// Bracket routes:
//   GET  /v1/tournaments/:id/bracket   — read bracket state
//   POST /v1/tournaments/:id/bracket   — start tournament + generate bracket (TO/admin)

import type { FastifyPluginAsync } from "fastify";
import {
  generateSingleElim,
  generateDoubleElim,
  generateRoundRobin,
  advanceSlot,
} from "../services/bracket-engine/index.js";
import type { MatchSpec } from "../services/bracket-engine/index.js";

const bracketRoutes: FastifyPluginAsync = async (fastify) => {
  // ------------------------------------------------------------------
  // GET /v1/tournaments/:id/bracket
  // ------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>(
    "/tournaments/:id/bracket",
    {
      schema: {
        tags: ["bracket"],
        summary: "Get current bracket state",
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const matches = await fastify.prisma.match.findMany({
        where: { tournamentId: request.params.id },
        orderBy: [{ round: "asc" }, { position: "asc" }],
        include: {
          playerA: { select: { id: true, steamId: true, displayName: true, avatarUrl: true } },
          playerB: { select: { id: true, steamId: true, displayName: true, avatarUrl: true } },
          winner:  { select: { id: true, steamId: true, displayName: true, avatarUrl: true } },
        },
      });

      if (matches.length === 0) {
        return reply.code(404).send({ error: "Bracket not generated yet" });
      }

      return reply.send({ matches });
    }
  );

  // ------------------------------------------------------------------
  // POST /v1/tournaments/:id/bracket  — generate bracket (TO/admin)
  // ------------------------------------------------------------------
  fastify.post<{ Params: { id: string } }>(
    "/tournaments/:id/bracket",
    {
      preHandler: [fastify.authenticate, fastify.requireAdmin],
      schema: {
        tags: ["bracket"],
        summary: "Generate bracket from checked-in players (TO/admin)",
        security: [{ bearerAuth: [] }],
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const tournament = await fastify.prisma.tournament.findUnique({
        where: { id: request.params.id },
      });
      if (!tournament) return reply.code(404).send({ error: "Tournament not found" });
      if (tournament.status !== "CHECK_IN" && tournament.status !== "OPEN") {
        return reply.code(409).send({ error: "Tournament must be in CHECK_IN or OPEN status" });
      }

      const existing = await fastify.prisma.match.count({
        where: { tournamentId: tournament.id },
      });
      if (existing > 0) {
        return reply.code(409).send({ error: "Bracket already generated" });
      }

      // Checked-in players only (fall back to all registered if nobody checked in)
      const registrations = await fastify.prisma.registration.findMany({
        where: {
          tournamentId: tournament.id,
          status: { in: ["CHECKED_IN", "REGISTERED"] },
        },
        orderBy: { seed: "asc" },
      });

      const playerIds = registrations.map((r) => r.playerId);
      if (playerIds.length < tournament.minPlayers) {
        return reply.code(409).send({
          error: `Not enough players: have ${playerIds.length}, need ${tournament.minPlayers}`,
        });
      }

      let matchSpecs: MatchSpec[] = [];
      if (tournament.type === "SINGLE_ELIM") {
        matchSpecs = generateSingleElim(playerIds);
      } else if (tournament.type === "DOUBLE_ELIM") {
        const { winners, losers, grandFinals } = generateDoubleElim(playerIds);
        matchSpecs = [...winners, ...losers, ...grandFinals];
      } else {
        matchSpecs = generateRoundRobin(playerIds);
      }

      await fastify.prisma.$transaction([
        fastify.prisma.match.createMany({
          data: matchSpecs.map((ms) => ({
            tournamentId: tournament.id,
            round:       ms.round,
            position:    ms.position,
            bracketSide: ms.bracketSide ?? null,
            playerAId:   ms.slotA.playerId,
            playerBId:   ms.slotB.playerId,
            status:      ms.isBye ? "BYE" : "PENDING",
          })),
        }),
        fastify.prisma.tournament.update({
          where: { id: tournament.id },
          data:  { status: "IN_PROGRESS" },
        }),
      ]);

      const matches = await fastify.prisma.match.findMany({
        where: { tournamentId: tournament.id },
        orderBy: [{ round: "asc" }, { position: "asc" }],
      });

      return reply.code(201).send({ matches });
    }
  );

  // ------------------------------------------------------------------
  // POST /v1/matches/:id/advance  — manually advance a match winner (TO)
  // Also called internally by the replay worker on success.
  // ------------------------------------------------------------------
  fastify.post<{ Params: { id: string }; Body: { winnerId: string } }>(
    "/matches/:id/advance",
    {
      preHandler: [fastify.authenticate, fastify.requireAdmin],
      schema: {
        tags: ["bracket"],
        summary: "Set match winner and advance bracket (TO/admin)",
        security: [{ bearerAuth: [] }],
        params: { type: "object", properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["winnerId"],
          properties: { winnerId: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      await advanceMatch(fastify, request.params.id, request.body.winnerId);
      return reply.send({ ok: true });
    }
  );
};

// Shared advancement logic used by route AND replay worker
export async function advanceMatch(
  fastify: Parameters<FastifyPluginAsync>[0],
  matchId: string,
  winnerId: string
): Promise<void> {
  const match = await fastify.prisma.match.findUniqueOrThrow({ where: { id: matchId } });

  if (match.status === "COMPLETED") return; // idempotent

  await fastify.prisma.match.update({
    where: { id: matchId },
    data:  { winnerId, status: "COMPLETED" },
  });

  // For single-elim and DE winners bracket: advance to next match
  if (!match.bracketSide || match.bracketSide === "WINNERS") {
    const { nextRound, nextPosition, slot } = advanceSlot(match.round, match.position);

    const nextMatch = await fastify.prisma.match.findFirst({
      where: { tournamentId: match.tournamentId, round: nextRound, position: nextPosition },
    });
    if (nextMatch) {
      await fastify.prisma.match.update({
        where: { id: nextMatch.id },
        data:  slot === "A" ? { playerAId: winnerId } : { playerBId: winnerId },
      });
    }
  }
}

export default bracketRoutes;
