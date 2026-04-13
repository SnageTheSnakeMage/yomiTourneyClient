// POST /v1/auth/steam
// Validates a Steamworks session ticket and returns a signed JWT.

import type { FastifyPluginAsync } from "fastify";
import { authenticateTicket, getPlayerSummaries } from "../services/steam.js";
import type { JwtPayload } from "../types/index.js";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: { ticket: string };
  }>(
    "/auth/steam",
    {
      schema: {
        tags: ["auth"],
        summary: "Authenticate via Steamworks session ticket",
        body: {
          type: "object",
          required: ["ticket"],
          properties: {
            ticket: { type: "string", description: "Hex-encoded Steam auth ticket" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: { type: "string" },
              player: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  steamId: { type: "string" },
                  displayName: { type: "string", nullable: true },
                  avatarUrl: { type: "string", nullable: true },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { ticket } = request.body;

      let steamResult;
      try {
        steamResult = await authenticateTicket(ticket);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Steam auth failed";
        return reply.code(401).send({ error: msg });
      }

      // Upsert player — first login creates the record; subsequent logins refresh profile
      let player = await fastify.prisma.player.findUnique({
        where: { steamId: steamResult.steamId },
      });

      if (!player) {
        // Fetch display name + avatar from Steam on first registration
        const profiles = await getPlayerSummaries([steamResult.steamId]).catch(
          () => []
        );
        const profile = profiles[0];

        player = await fastify.prisma.player.create({
          data: {
            steamId: steamResult.steamId,
            displayName: profile?.displayName ?? null,
            avatarUrl: profile?.avatarUrl ?? null,
          },
        });
      }

      const payload: JwtPayload = {
        sub: player.id,
        steamId: player.steamId,
        isAdmin: player.isAdmin,
      };

      const token = fastify.jwt.sign(payload, { expiresIn: "24h" });

      return reply.send({ token, player });
    }
  );
};

export default authRoutes;
