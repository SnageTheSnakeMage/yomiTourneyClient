import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import fhelmet from "@fastify/helmet";
import fcors from "@fastify/cors";
import fratelimit from "@fastify/rate-limit";
import fswagger from "@fastify/swagger";
import fswaggerUi from "@fastify/swagger-ui";
import fmultipart from "@fastify/multipart";

import { config } from "./config.js";
import prismaPlugin from "./plugins/db.js";
import authPlugin from "./plugins/auth.js";

import authRoutes from "./routes/auth.js";
import timeRoutes from "./routes/time.js";
import tournamentRoutes from "./routes/tournaments.js";
import registrationRoutes from "./routes/registrations.js";
import bracketRoutes from "./routes/brackets.js";
import replayRoutes from "./routes/replays.js";
import matchRoutes from "./routes/matches.js";
import adminRoutes from "./routes/admin.js";

const server = Fastify({
  logger: {
    level: config.logLevel,
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty" }
        : undefined,
  },
});

async function start() {
  // Security
  await server.register(fhelmet, { contentSecurityPolicy: false });
  await server.register(fcors, {
    origin: false, // API is consumed by the game mod (not browsers)
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  // Rate limiting — in-memory for single-replica MVP
  // Switch to Redis store when scaling to multiple replicas
  await server.register(fratelimit, {
    max: 120,
    timeWindow: "1 minute",
    skipOnError: false,
  });

  // Multipart for replay uploads
  await server.register(fmultipart, {
    limits: { fileSize: config.replayMaxSizeBytes },
  });

  // OpenAPI — published at /documentation
  await server.register(fswagger, {
    openapi: {
      info: { title: "YOMIH Tournament API", version: "1.0.0" },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  });
  await server.register(fswaggerUi, { routePrefix: "/documentation" });

  // JWT
  await server.register(fjwt, { secret: config.jwtSecret });

  // DB + auth decorators
  await server.register(prismaPlugin);
  await server.register(authPlugin);

  // Health check (unauthenticated, used by Docker healthcheck)
  server.get("/healthz", async () => ({ ok: true }));

  // Versioned routes
  const v1 = { prefix: "/v1" };
  await server.register(authRoutes, v1);
  await server.register(timeRoutes, v1);
  await server.register(tournamentRoutes, v1);
  await server.register(registrationRoutes, v1);
  await server.register(bracketRoutes, v1);
  await server.register(replayRoutes, v1);
  await server.register(matchRoutes, v1);
  await server.register(adminRoutes, v1);

  await server.listen({ port: config.port, host: config.host });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
