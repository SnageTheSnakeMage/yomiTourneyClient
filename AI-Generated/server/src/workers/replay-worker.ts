// Replay processing worker.
//
// Uses an in-process FIFO queue (simple for MVP; replace with BullMQ or
// pg_boss for persistence across restarts if needed).
//
// Pipeline:
//   1. Load replay bytes from storage
//   2. Extract metadata (version, characters, Steam IDs) — Step A
//   3. Attempt outcome extraction — Step B (research track)
//   4. Validate version against supported list
//   5. If winner determined with high confidence, advance bracket
//   6. On any failure: mark FAILED, log warnings — TO override always available

import { PrismaClient } from "@prisma/client";
import { storage, replayStorageKey } from "../services/storage.js";
import { parseReplayMetadata, parseReplayOutcome } from "../services/replay-parser.js";
import { config } from "../config.js";

// Simple in-process queue
class SimpleQueue {
  private queue: string[] = [];
  private running = false;
  private prisma: PrismaClient | null = null;

  setPrisma(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  enqueue(replayId: string) {
    this.queue.push(replayId);
    this.drain();
  }

  private drain() {
    if (this.running) return;
    this.running = true;
    this.processNext().catch(console.error);
  }

  private async processNext() {
    while (this.queue.length > 0) {
      const id = this.queue.shift()!;
      await this.process(id).catch((err) =>
        console.error(`[replay-worker] Unhandled error for replay ${id}:`, err)
      );
    }
    this.running = false;
  }

  private async process(replayId: string) {
    if (!this.prisma) return;
    const db = this.prisma;

    const replay = await db.replay.findUnique({ where: { id: replayId } });
    if (!replay || replay.processingStatus !== "QUEUED") return;

    await db.replay.update({
      where: { id: replayId },
      data:  { processingStatus: "PROCESSING" },
    });

    try {
      // Load bytes
      const buf = await storage.get(replay.storageKey);

      // Step A — metadata
      const meta = parseReplayMetadata(buf);
      const warnings = [...meta.warnings];

      // Version validation
      let versionOk = true;
      if (meta.gameVersion) {
        versionOk = config.supportedGameVersions.some((v) =>
          meta.gameVersion!.startsWith(v)
        );
        if (!versionOk) {
          warnings.push(`unsupported_version:${meta.gameVersion}`);
        }
      }

      // Validate embedded Steam IDs against match participants
      if (meta.embeddedSteamIds.length > 0) {
        const match = await db.match.findUnique({
          where: { id: replay.matchId },
          include: {
            playerA: { select: { steamId: true } },
            playerB: { select: { steamId: true } },
          },
        });
        if (match) {
          const expected = [match.playerA?.steamId, match.playerB?.steamId].filter(Boolean);
          for (const sid of meta.embeddedSteamIds) {
            if (!expected.includes(sid)) {
              warnings.push(`unexpected_steam_id:${sid}`);
            }
          }
        }
      }

      // Step B — outcome
      let derivedWinnerId: string | null = null;
      if (versionOk) {
        const outcome = parseReplayOutcome(buf);

        if (outcome.winnerSlot !== null && outcome.confidence === "high") {
          const match = await db.match.findUnique({
            where: { id: replay.matchId },
          });
          if (match) {
            derivedWinnerId =
              outcome.winnerSlot === "A" ? match.playerAId :
              outcome.winnerSlot === "B" ? match.playerBId :
              null;
          }
        } else {
          warnings.push("winner_undetermined:manual_override_required");
        }
      }

      // Update replay record
      await db.replay.update({
        where: { id: replayId },
        data: {
          processingStatus: "COMPLETE",
          gameVersion:      meta.gameVersion,
          characterIds:     meta.characterIds,
          embeddedSteamIds: meta.embeddedSteamIds,
          derivedWinnerId,
          parserWarnings:   warnings,
        },
      });

      // Advance bracket if winner confirmed
      if (derivedWinnerId) {
        // Import lazily to avoid circular dep with brackets route
        const { advanceMatch } = await import("../routes/brackets.js");
        // advanceMatch needs a fastify instance — expose via a simple wrapper
        await db.match.update({
          where: { id: replay.matchId },
          data:  { winnerId: derivedWinnerId, status: "COMPLETED" },
        });
        // TODO: call advanceSlot logic directly without fastify; refactor into
        // a shared service function in bracket-engine when wiring is stable.
        console.log(`[replay-worker] Winner ${derivedWinnerId} set for match ${replay.matchId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db.replay.update({
        where: { id: replayId },
        data: {
          processingStatus: "FAILED",
          parserWarnings: [`processing_error:${msg}`],
        },
      });
      console.error(`[replay-worker] Failed to process replay ${replayId}:`, msg);
    }
  }
}

export const replayQueue = new SimpleQueue();

// Called once from index.ts after Prisma connects
export function initWorker(prisma: PrismaClient) {
  replayQueue.setPrisma(prisma);
  // Re-enqueue any QUEUED replays from before the last restart
  prisma.replay
    .findMany({ where: { processingStatus: "QUEUED" }, select: { id: true } })
    .then((rows) => rows.forEach((r) => replayQueue.enqueue(r.id)))
    .catch(console.error);
}
