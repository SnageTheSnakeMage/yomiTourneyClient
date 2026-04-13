// POST /v1/matches/:id/replay — multipart upload of a .replay file.
// Idempotent by SHA-256: same file → same storage key → no duplicate processing.

import type { FastifyPluginAsync } from "fastify";
import { storage, replayStorageKey, sha256hex } from "../services/storage.js";
import { config } from "../config.js";
import { replayQueue } from "../workers/replay-worker.js";

// Per-player upload quota — stored in memory (sufficient for single replica)
const uploadCounts = new Map<string, { count: number; resetAt: number }>();
const QUOTA_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const QUOTA_MAX = 20;                    // max 20 uploads per hour per player

function checkQuota(playerId: string): boolean {
  const now = Date.now();
  const entry = uploadCounts.get(playerId);
  if (!entry || entry.resetAt < now) {
    uploadCounts.set(playerId, { count: 1, resetAt: now + QUOTA_WINDOW_MS });
    return true;
  }
  if (entry.count >= QUOTA_MAX) return false;
  entry.count += 1;
  return true;
}

const replayRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>(
    "/matches/:id/replay",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["replays"],
        summary: "Upload a replay file for a match",
        security: [{ bearerAuth: [] }],
        params: { type: "object", properties: { id: { type: "string" } } },
        consumes: ["multipart/form-data"],
      },
      config: {
        // Override global rate limit for uploads: stricter
        rateLimit: { max: 5, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const matchId = request.params.id;

      // Confirm match exists and player is a participant
      const match = await fastify.prisma.match.findUnique({
        where: { id: matchId },
      });
      if (!match) return reply.code(404).send({ error: "Match not found" });

      const myId = request.player.id;
      if (match.playerAId !== myId && match.playerBId !== myId && !request.player.isAdmin) {
        return reply.code(403).send({ error: "You are not a participant in this match" });
      }

      // Per-user quota
      if (!checkQuota(myId)) {
        return reply
          .code(429)
          .send({ error: "Upload quota exceeded — max 20 replays per hour" });
      }

      // Read multipart file
      const data = await request.file();
      if (!data) return reply.code(400).send({ error: "No file uploaded" });

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buf = Buffer.concat(chunks);

      // Size guard (also enforced by @fastify/multipart limits, belt-and-suspenders)
      if (buf.length > config.replayMaxSizeBytes) {
        return reply.code(413).send({
          error: `File too large — max ${config.replayMaxSizeBytes / 1024 / 1024} MB`,
        });
      }

      // Compute hash — idempotency key
      const hash = sha256hex(buf);
      const key  = replayStorageKey(hash);

      // Check for exact duplicate
      const existing = await fastify.prisma.replay.findUnique({ where: { sha256: hash } });
      if (existing) {
        return reply.send({ replay: existing, duplicate: true });
      }

      // Persist to storage
      await storage.put(key, buf);

      // Create DB record
      const replay = await fastify.prisma.replay.create({
        data: {
          matchId,
          uploadedById:    myId,
          storageKey:      key,
          sha256:          hash,
          fileSizeBytes:   buf.length,
          processingStatus:"QUEUED",
          characterIds:    [],
          embeddedSteamIds:[],
          parserWarnings:  [],
        },
      });

      // Enqueue for async processing
      replayQueue.enqueue(replay.id);

      return reply.code(201).send({ replay, duplicate: false });
    }
  );

  // GET /v1/replays/:id  — status and metadata
  fastify.get<{ Params: { id: string } }>(
    "/replays/:id",
    {
      schema: {
        tags: ["replays"],
        summary: "Get replay processing status",
        params: { type: "object", properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const replay = await fastify.prisma.replay.findUnique({
        where: { id: request.params.id },
      });
      if (!replay) return reply.code(404).send({ error: "Replay not found" });
      return reply.send({ replay });
    }
  );
};

export default replayRoutes;
