// GET /v1/me/next-match — returns the authenticated player's next pending match.
// GET /v1/matches/:id  — match detail with player profiles.

import type { FastifyPluginAsync } from "fastify";

const matchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/me/next-match",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["matches"],
        summary: "Get authenticated player's next pending match",
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const playerId = request.player.id;

      const match = await fastify.prisma.match.findFirst({
        where: {
          status: "PENDING",
          OR: [{ playerAId: playerId }, { playerBId: playerId }],
        },
        orderBy: { round: "asc" },
        include: {
          tournament: { select: { id: true, title: true, type: true, startsAt: true } },
          playerA: {
            select: { id: true, steamId: true, displayName: true, avatarUrl: true },
          },
          playerB: {
            select: { id: true, steamId: true, displayName: true, avatarUrl: true },
          },
        },
      });

      if (!match) return reply.send({ match: null });

      // Identify opponent
      const opponent =
        match.playerAId === playerId ? match.playerB : match.playerA;

      // Steam profile deep-link (opens in Steam overlay or browser)
      const steamProfileUrl = opponent?.steamId
        ? `steam://url/SteamIDPage/${opponent.steamId}`
        : null;

      return reply.send({ match, opponent, steamProfileUrl });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/matches/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["matches"],
        summary: "Get match detail",
        security: [{ bearerAuth: [] }],
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const match = await fastify.prisma.match.findUnique({
        where: { id: request.params.id },
        include: {
          tournament: { select: { id: true, title: true, type: true } },
          playerA: {
            select: { id: true, steamId: true, displayName: true, avatarUrl: true },
          },
          playerB: {
            select: { id: true, steamId: true, displayName: true, avatarUrl: true },
          },
          winner: {
            select: { id: true, steamId: true, displayName: true, avatarUrl: true },
          },
          replays: {
            select: {
              id: true,
              processingStatus: true,
              gameVersion: true,
              characterIds: true,
              parserWarnings: true,
            },
          },
        },
      });

      if (!match) return reply.code(404).send({ error: "Match not found" });
      return reply.send({ match });
    }
  );
};

export default matchRoutes;
