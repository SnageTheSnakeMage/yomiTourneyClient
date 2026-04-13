// Smoke E2E test — spins up the full Fastify app (in-process) against a
// real Postgres database running in Docker Compose.
//
// Run manually with:
//   docker compose -f ../deploy/docker-compose.yml up -d postgres
//   DATABASE_URL=postgresql://... JWT_SECRET=test STEAM_PUBLISHER_KEY=test \
//     npx vitest run tests/smoke-e2e.test.ts
//
// These tests cover the happy-path vertical slice end-to-end.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";

// Build a minimal in-process server instance for testing
async function buildTestServer() {
  const { default: fjwt }        = await import("@fastify/jwt");
  const { default: fmultipart }  = await import("@fastify/multipart");
  const { default: prismaPlugin }= await import("../src/plugins/db.js");
  const { default: authPlugin }  = await import("../src/plugins/auth.js");
  const { default: timeRoutes }  = await import("../src/routes/time.js");
  const { default: tournamentRoutes } = await import("../src/routes/tournaments.js");

  const app = Fastify({ logger: false });
  await app.register(fjwt, { secret: "test-secret" });
  await app.register(fmultipart);
  await app.register(prismaPlugin);
  await app.register(authPlugin);
  app.get("/healthz", async () => ({ ok: true }));
  await app.register(timeRoutes, { prefix: "/v1" });
  await app.register(tournamentRoutes, { prefix: "/v1" });
  await app.ready();
  return app;
}

let app: Awaited<ReturnType<typeof buildTestServer>>;

beforeAll(async () => {
  // Requires DATABASE_URL env var pointing at a running Postgres instance
  if (!process.env.DATABASE_URL) {
    console.warn("Skipping E2E — no DATABASE_URL set");
    return;
  }
  app = await buildTestServer();
});

afterAll(async () => {
  if (app) await app.close();
});

describe("Smoke E2E — health and time", () => {
  it("GET /healthz returns ok", async () => {
    if (!app) return;
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it("GET /v1/time returns unix_ms and iso", async () => {
    if (!app) return;
    const res = await app.inject({ method: "GET", url: "/v1/time" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.unix_ms).toBe("number");
    expect(typeof body.iso).toBe("string");
  });

  it("GET /v1/tournaments returns empty array when no data", async () => {
    if (!app) return;
    const res = await app.inject({ method: "GET", url: "/v1/tournaments" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.tournaments)).toBe(true);
  });
});
