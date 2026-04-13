// OpenAPI contract test — verifies the server's Swagger schema is reachable
// and that key routes are present in the spec.
//
// Run alongside the E2E test when DATABASE_URL is set.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";

async function buildMinimalServer() {
  const { default: fjwt }       = await import("@fastify/jwt");
  const { default: fswagger }   = await import("@fastify/swagger");
  const { default: fswaggerUi } = await import("@fastify/swagger-ui");
  const { default: fmultipart } = await import("@fastify/multipart");
  const { default: prismaPlugin }= await import("../../src/plugins/db.js");
  const { default: authPlugin }  = await import("../../src/plugins/auth.js");
  const { default: timeRoutes }  = await import("../../src/routes/time.js");
  const { default: authRoutes }  = await import("../../src/routes/auth.js");

  const app = Fastify({ logger: false });
  await app.register(fswagger, {
    openapi: { info: { title: "Test", version: "0" } },
  });
  await app.register(fswaggerUi, { routePrefix: "/docs" });
  await app.register(fjwt, { secret: "test-secret" });
  await app.register(fmultipart);
  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(timeRoutes, { prefix: "/v1" });
  await app.register(authRoutes, { prefix: "/v1" });
  await app.ready();
  return app;
}

let app: Awaited<ReturnType<typeof buildMinimalServer>>;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  app = await buildMinimalServer();
});

afterAll(async () => {
  if (app) await app.close();
});

describe("OpenAPI contract", () => {
  it("GET /docs/json returns a valid OpenAPI spec", async () => {
    if (!app) return;
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    expect(res.statusCode).toBe(200);
    const spec = JSON.parse(res.body);
    expect(spec.openapi).toMatch(/^3\./);
  });

  it("spec includes /v1/time path", async () => {
    if (!app) return;
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const spec = JSON.parse(res.body);
    expect(spec.paths).toHaveProperty("/v1/time");
  });

  it("spec includes /v1/auth/steam path", async () => {
    if (!app) return;
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    const spec = JSON.parse(res.body);
    expect(spec.paths).toHaveProperty("/v1/auth/steam");
  });
});
