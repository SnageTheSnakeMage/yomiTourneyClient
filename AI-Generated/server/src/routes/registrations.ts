// Registration routes:
//   POST   /v1/tournaments/:id/register
//   POST   /v1/tournaments/:id/check-in
//   DELETE /v1/tournaments/:id/register   (withdraw)
//   GET    /v1/tournaments/:id/registrations

import type { FastifyPluginAsync } from "fastify";

const registrationRoutes: FastifyPluginAsync = async (fastify) => {
  // ------------------------------------------------------------------
  // GET /v1/tournaments/:id/registrations
  // ------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>(
    "/tournaments/:id/registrations",
    {
      schema: {
        tags: ["registrations"],
        summary: "List registered players for a tournament",
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const regs = await fastify.prisma.registration.findMany({
        where: { tournamentId: request.params.id },
        include: {
          player: {
            select: { id: true, steamId: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });
      return reply.send({ registrations: regs });
    }
  );

  // ------------------------------------------------------------------
  // POST /v1/tournaments/:id/register
  // ------------------------------------------------------------------
  fastify.post<{ Params: { id: string } }>(
    "/tournaments/:id/register",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["registrations"],
        summary: "Register for a tournament",
        security: [{ bearerAuth: [] }],
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const tournament = await fastify.prisma.tournament.findUnique({
        where: { id: request.params.id },
        include: { _count: { select: { registrations: true } } },
      });
      if (!tournament) return reply.code(404).send({ error: "Tournament not found" });
      if (tournament.status !== "OPEN") {
        return reply.code(409).send({ error: "Tournament is not open for registration" });
      }
      if (tournament._count.registrations >= tournament.maxPlayers) {
        return reply.code(409).send({ error: "Tournament is full" });
      }

      const existing = await fastify.prisma.registration.findUnique({
        where: { tournamentId_playerId: { tournamentId: tournament.id, playerId: request.player.id } },
      });
      if (existing && existing.status !== "WITHDRAWN") {
        return reply.code(409).send({ error: "Already registered" });
      }

      const reg = await fastify.prisma.registration.upsert({
        where: { tournamentId_playerId: { tournamentId: tournament.id, playerId: request.player.id } },
        create: { tournamentId: tournament.id, playerId: request.player.id, status: "REGISTERED" },
        update: { status: "REGISTERED" },
      });

      return reply.code(201).send({ registration: reg });
    }
  );

  // ------------------------------------------------------------------
  // POST /v1/tournaments/:id/check-in
  // ------------------------------------------------------------------
  fastify.post<{ Params: { id: string } }>(
    "/tournaments/:id/check-in",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["registrations"],
        summary: "Check in for a tournament (uses server time to validate window)",
        security: [{ bearerAuth: [] }],
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const tournament = await fastify.prisma.tournament.findUnique({
        where: { id: request.params.id },
      });
      if (!tournament) return reply.code(404).send({ error: "Tournament not found" });

      // Use authoritative server time — never trust client
      const now = new Date();
      if (now < tournament.checkInOpensAt || now > tournament.checkInClosesAt) {
        return reply.code(409).send({
          error: "Check-in window is not open",
          window: {
            opens:  tournament.checkInOpensAt.toISOString(),
            closes: tournament.checkInClosesAt.toISOString(),
            server_now: now.toISOString(),
          },
        });
      }

      const reg = await fastify.prisma.registration.findUnique({
        where: { tournamentId_playerId: { tournamentId: tournament.id, playerId: request.player.id } },
      });
      if (!reg || reg.status === "WITHDRAWN") {
        return reply.code(404).send({ error: "Not registered for this tournament" });
      }
      if (reg.status === "CHECKED_IN") {
        return reply.send({ registration: reg }); // idempotent
      }

      const updated = await fastify.prisma.registration.update({
        where: { id: reg.id },
        data: { status: "CHECKED_IN" },
      });

      return reply.send({ registration: updated });
    }
  );

  // ------------------------------------------------------------------
  // DELETE /v1/tournaments/:id/register  (withdraw)
  // ------------------------------------------------------------------
  fastify.delete<{ Params: { id: string } }>(
    "/tournaments/:id/register",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["registrations"],
        summary: "Withdraw from a tournament",
        security: [{ bearerAuth: [] }],
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const reg = await fastify.prisma.registration.findUnique({
        where: {
          tournamentId_playerId: {
            tournamentId: request.params.id,
            playerId: request.player.id,
          },
        },
      });
      if (!reg || reg.status === "WITHDRAWN") {
        return reply.code(404).send({ error: "Registration not found" });
      }

      await fastify.prisma.registration.update({
        where: { id: reg.id },
        data: { status: "WITHDRAWN" },
      });

      return reply.code(204).send();
    }
  );
};

export default registrationRoutes;
