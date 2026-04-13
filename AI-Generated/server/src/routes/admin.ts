// Admin / TO routes — all require isAdmin = true on the JWT.
//
// POST /v1/matches/:id/override   — manually set winner (bypasses simulation)
// POST /v1/players/:id/sync       — refresh a player's Steam profile from API
// POST /v1/players/sync-all       — bulk-refresh all players (rate-limited)
// GET  /v1/admin/replays          — list replays pending TO review

import type { FastifyPluginAsync } from "fastify";
import { getPlayerSummaries } from "../services/steam.js";

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // -----------------------------------------------------------------------
  // TO override — set match winner without simulation
  // -----------------------------------------------------------------------
  fastify.post<{
    Params: { id: string };
    Body: { winnerId: string; reason?: string };
  }>(
    "/matches/:id/override",
    {
      preHandler: [fastify.authenticate, fastify.requireAdmin],
      schema: {
        tags: ["admin"],
        summary: "Manually override match winner (TO)",
        security: [{ bearerAuth: [] }],
        params: { type: "object", properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["winnerId"],
          properties: {
            winnerId: { type: "string" },
            reason:   { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const match = await fastify.prisma.match.findUnique({
        where: { id: request.params.id },
      });
      if (!match) return reply.code(404).send({ error: "Match not found" });

      const updated = await fastify.prisma.match.update({
        where: { id: match.id },
        data:  { winnerId: request.body.winnerId, status: "COMPLETED" },
      });

      fastify.log.info(
        { matchId: match.id, winnerId: request.body.winnerId, by: request.player.steamId, reason: request.body.reason },
        "TO override applied"
      );

      return reply.send({ match: updated });
    }
  );

  // -----------------------------------------------------------------------
  // Steam profile sync — single player
  // -----------------------------------------------------------------------
  fastify.post<{ Params: { id: string } }>(
    "/players/:id/sync",
    {
      preHandler: [fastify.authenticate, fastify.requireAdmin],
      schema: {
        tags: ["admin"],
        summary: "Refresh player Steam profile",
        security: [{ bearerAuth: [] }],
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const player = await fastify.prisma.player.findUnique({
        where: { id: request.params.id },
      });
      if (!player) return reply.code(404).send({ error: "Player not found" });

      // Degraded mode: if Steam API is down, return cached data with a warning
      let updated = player;
      try {
        const profiles = await getPlayerSummaries([player.steamId]);
        const profile  = profiles[0];
        if (profile) {
          updated = await fastify.prisma.player.update({
            where: { id: player.id },
            data: {
              displayName: profile.displayName,
              avatarUrl:   profile.avatarUrl,
            },
          });
        }
      } catch (err) {
        fastify.log.warn({ err }, "Steam API unavailable during player sync — returning cached data");
        return reply.send({ player, stale: true, warning: "Steam API unavailable; cached data returned" });
      }

      return reply.send({ player: updated, stale: false });
    }
  );

  // -----------------------------------------------------------------------
  // Steam profile sync — all players (bulk; rate-limited)
  // -----------------------------------------------------------------------
  fastify.post(
    "/players/sync-all",
    {
      preHandler: [fastify.authenticate, fastify.requireAdmin],
      config: { rateLimit: { max: 1, timeWindow: "1 minute" } },
      schema: {
        tags: ["admin"],
        summary: "Bulk-refresh all player Steam profiles (max 1/min)",
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const players = await fastify.prisma.player.findMany({
        select: { id: true, steamId: true },
      });

      let updated = 0;
      let failed  = 0;

      try {
        const steamIds = players.map((p) => p.steamId);
        const profiles = await getPlayerSummaries(steamIds);
        const profileMap = new Map(profiles.map((p) => [p.steamId, p]));

        await Promise.allSettled(
          players.map(async (player) => {
            const profile = profileMap.get(player.steamId);
            if (!profile) return;
            await fastify.prisma.player.update({
              where: { id: player.id },
              data: { displayName: profile.displayName, avatarUrl: profile.avatarUrl },
            });
            updated++;
          })
        );
      } catch {
        failed = players.length;
      }

      return reply.send({ updated, failed, total: players.length });
    }
  );

  // -----------------------------------------------------------------------
  // List replays awaiting TO review (FAILED or warnings present)
  // -----------------------------------------------------------------------
  fastify.get(
    "/admin/replays",
    {
      preHandler: [fastify.authenticate, fastify.requireAdmin],
      schema: {
        tags: ["admin"],
        summary: "List replays needing TO attention",
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const replays = await fastify.prisma.replay.findMany({
        where: {
          OR: [
            { processingStatus: "FAILED" },
            { processingStatus: "COMPLETE", derivedWinnerId: null },
          ],
        },
        orderBy: { createdAt: "asc" },
        include: { match: { select: { id: true, tournamentId: true, round: true } } },
      });
      return reply.send({ replays });
    }
  );
};

export default adminRoutes;
