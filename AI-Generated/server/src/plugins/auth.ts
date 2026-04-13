// Auth plugin — decorates fastify.authenticate() for use as a preHandler hook.
// Also exposes fastify.optionalAuthenticate() for routes that allow anon reads.

import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { JwtPayload } from "../types/index.js";

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = await request.jwtVerify<JwtPayload>();
        const player = await fastify.prisma.player.findUniqueOrThrow({
          where: { id: payload.sub },
        });
        request.player = player;
      } catch {
        reply.code(401).send({ error: "Unauthorized" });
      }
    }
  );

  fastify.decorate(
    "optionalAuthenticate",
    async (request: FastifyRequest, _reply: FastifyReply) => {
      try {
        const payload = await request.jwtVerify<JwtPayload>();
        const player = await fastify.prisma.player.findUnique({
          where: { id: payload.sub },
        });
        if (player) request.player = player;
      } catch {
        // anonymous — request.player remains undefined
      }
    }
  );

  fastify.decorate(
    "requireAdmin",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.player?.isAdmin) {
        reply.code(403).send({ error: "Forbidden" });
      }
    }
  );
};

export default fp(authPlugin, { name: "auth", dependencies: ["prisma", "@fastify/jwt"] });

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void>;
    optionalAuthenticate: (req: FastifyRequest, rep: FastifyReply) => Promise<void>;
    requireAdmin: (req: FastifyRequest, rep: FastifyReply) => Promise<void>;
  }
}
