// GET /v1/time
// Returns authoritative server Unix timestamp in ms.
// Clients use this to compare against check-in windows so local clock skew
// does not cause spurious "check-in closed" errors.

import type { FastifyPluginAsync } from "fastify";

const timeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/time",
    {
      schema: {
        tags: ["util"],
        summary: "Authoritative server time",
        response: {
          200: {
            type: "object",
            properties: {
              unix_ms: { type: "number" },
              iso: { type: "string" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const now = new Date();
      return reply.send({ unix_ms: now.getTime(), iso: now.toISOString() });
    }
  );
};

export default timeRoutes;
