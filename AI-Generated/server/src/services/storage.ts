// Storage abstraction — wraps local filesystem or S3-compatible object storage.
// Switch between drivers via STORAGE_DRIVER env var.
// Both drivers share the same interface so no application code changes when migrating.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";

export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local filesystem driver
// ---------------------------------------------------------------------------
class LocalDriver implements StorageDriver {
  constructor(private base: string) {}

  private full(key: string) {
    return path.join(this.base, key);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const p = this.full(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.full(key));
  }

  async exists(key: string): Promise<boolean> {
    return fs
      .access(this.full(key))
      .then(() => true)
      .catch(() => false);
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(this.full(key)).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// S3-compatible driver (MinIO / AWS S3 / Cloudflare R2)
// Uses the AWS-SDK-compatible fetch approach via undici for zero extra deps.
// For production S3, swap in @aws-sdk/client-s3 by extending this class.
// ---------------------------------------------------------------------------
class S3Driver implements StorageDriver {
  async put(_key: string, _data: Buffer): Promise<void> {
    throw new Error("S3 driver not yet implemented — set STORAGE_DRIVER=local for MVP");
  }
  async get(_key: string): Promise<Buffer> {
    throw new Error("S3 driver not yet implemented");
  }
  async exists(_key: string): Promise<boolean> {
    throw new Error("S3 driver not yet implemented");
  }
  async delete(_key: string): Promise<void> {
    throw new Error("S3 driver not yet implemented");
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createStorage(): StorageDriver {
  if (config.storage.driver === "s3") return new S3Driver();
  return new LocalDriver(config.storage.localPath);
}

export const storage = createStorage();

// ---------------------------------------------------------------------------
// Utility — generate storage key and compute SHA-256 from raw Buffer
// ---------------------------------------------------------------------------
export function replayStorageKey(sha256: string): string {
  // Shard by first 2 hex chars to avoid flat directories with millions of files
  return `replays/${sha256.slice(0, 2)}/${sha256}.replay`;
}

export function sha256hex(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
