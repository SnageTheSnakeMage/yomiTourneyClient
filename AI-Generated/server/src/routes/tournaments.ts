// Tournament CRUD + calendar endpoint

import type { FastifyPluginAsync } from "fastify";
import type { TournamentType } from "@prisma/client";

const tournamentRoutes: FastifyPluginAsync = async (fastify) => {
  // ------------------------------------------------------------------
  // GET /v1/tournaments  — list with optional date range (calendar feed)
  // ------------------------------------------------------------------
  fastify.get<{
    Querystring: { from?: string; to?: string; status?: string; limit?: number; offset?: number };
  }>(
    "/tournaments",
    {
      schema: {
        tags: ["tournaments"],
        summary: "List tournaments (calendar-range or all-open)",
        querystring: {
          type: "object",
          properties: {
            from: { type: "string", format: "date-time" },
            to:   { type: "string", format: "date-time" },
            status: { type: "string" },
            limit:  { type: "integer", default: 50, maximum: 200 },
            offset: { type: "integer", default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const { from, to, status, limit = 50, offset = 0 } = request.query;

      const tournaments = await fastify.prisma.tournament.findMany({
        where: {
          ...(from || to
            ? {
                startsAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to   ? { lte: new Date(to)   } : {}),
                },
              }
            : {}),
          ...(status ? { status: status as never } : {}),
        },
        orderBy: { startsAt: "asc" },
        take: limit,
        skip: offset,
        include: {
          createdBy: { select: { id: true, steamId: true, displayName: true, avatarUrl: true } },
          _count: { select: { registrations: true } },
        },
      });

      return reply.send({ tournaments });
    }
  );

  // ------------------------------------------------------------------
  // GET /v1/tournaments/:id
  // ------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>(
    "/tournaments/:id",
    {
      schema: {
        tags: ["tournaments"],
        summary: "Get tournament detail",
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const t = await fastify.prisma.tournament.findUnique({
        where: { id: request.params.id },
        include: {
          createdBy: { select: { id: true, steamId: true, displayName: true, avatarUrl: true } },
          characterRules: true,
          _count: { select: { registrations: true, matches: true } },
        },
      });
      if (!t) return reply.code(404).send({ error: "Tournament not found" });
      return reply.send({ tournament: t });
    }
  );

  // ------------------------------------------------------------------
  // POST /v1/tournaments  — create (authenticated)
  // ------------------------------------------------------------------
  fastify.post<{
    Body: {
      title: string;
      description?: string;
      type: TournamentType;
      startsAt: string;
      checkInOpensAt: string;
      checkInClosesAt: string;
      minPlayers: number;
      maxPlayers: number;
      characterRules?: Array<{ mode: "WHITELIST" | "BLACKLIST"; characterId: string }>;
    };
  }>(
    "/tournaments",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["tournaments"],
        summary: "Create a tournament",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["title", "type", "startsAt", "checkInOpensAt", "checkInClosesAt", "minPlayers", "maxPlayers"],
          properties: {
            title:           { type: "string", minLength: 1, maxLength: 120 },
            description:     { type: "string", maxLength: 2000 },
            type:            { type: "string", enum: ["SINGLE_ELIM", "DOUBLE_ELIM", "ROUND_ROBIN"] },
            startsAt:        { type: "string", format: "date-time" },
            checkInOpensAt:  { type: "string", format: "date-time" },
            checkInClosesAt: { type: "string", format: "date-time" },
            minPlayers:      { type: "integer", minimum: 2 },
            maxPlayers:      { type: "integer", minimum: 2, maximum: 256 },
            characterRules: {
              type: "array",
              items: {
                type: "object",
                required: ["mode", "characterId"],
                properties: {
                  mode:        { type: "string", enum: ["WHITELIST", "BLACKLIST"] },
                  characterId: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body;

      const tournament = await fastify.prisma.tournament.create({
        data: {
          title:           body.title,
          description:     body.description ?? null,
          type:            body.type,
          startsAt:        new Date(body.startsAt),
          checkInOpensAt:  new Date(body.checkInOpensAt),
          checkInClosesAt: new Date(body.checkInClosesAt),
          minPlayers:      body.minPlayers,
          maxPlayers:      body.maxPlayers,
          createdById:     request.player.id,
          characterRules:  body.characterRules?.length
            ? { createMany: { data: body.characterRules } }
            : undefined,
        },
        include: { characterRules: true },
      });

      return reply.code(201).send({ tournament });
    }
  );

  // ------------------------------------------------------------------
  // PATCH /v1/tournaments/:id/status  — TO-only status transitions
  // ------------------------------------------------------------------
  fastify.patch<{
    Params: { id: string };
    Body: { status: string };
  }>(
    "/tournaments/:id/status",
    {
      preHandler: [fastify.authenticate, fastify.requireAdmin],
      schema: {
        tags: ["tournaments"],
        summary: "Advance tournament status (TO/admin only)",
        security: [{ bearerAuth: [] }],
        params: { type: "object", properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["status"],
          properties: {
            status: {
              type: "string",
              enum: ["OPEN", "CHECK_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const t = await fastify.prisma.tournament.findUnique({
        where: { id: request.params.id },
      });
      if (!t) return reply.code(404).send({ error: "Tournament not found" });

      const updated = await fastify.prisma.tournament.update({
        where: { id: t.id },
        data: { status: request.body.status as never },
      });

      return reply.send({ tournament: updated });
    }
  );
};

export default tournamentRoutes;
