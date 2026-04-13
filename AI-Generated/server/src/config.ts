// Central config loaded from environment variables.
// All required vars throw at startup — fail fast rather than fail silently.

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optional("PORT", "3000"), 10),
  host: optional("HOST", "0.0.0.0"),
  logLevel: optional("LOG_LEVEL", "info"),

  jwtSecret: required("JWT_SECRET"),
  jwtExpiry: "24h",

  steamPublisherKey: required("STEAM_PUBLISHER_KEY"),
  steamAppId: optional("STEAM_APP_ID", "2212330"),

  supportedGameVersions: optional("SUPPORTED_GAME_VERSIONS", "1.9.20-steam")
    .split(",")
    .map((v) => v.trim()),

  replayMaxSizeBytes:
    parseInt(optional("REPLAY_MAX_SIZE_MB", "50"), 10) * 1024 * 1024,

  storage: {
    driver: optional("STORAGE_DRIVER", "local") as "local" | "s3",
    localPath: optional("LOCAL_STORAGE_PATH", "./replays"),
    s3Endpoint: optional("S3_ENDPOINT", ""),
    s3Bucket: optional("S3_BUCKET", ""),
    s3AccessKey: optional("S3_ACCESS_KEY", ""),
    s3SecretKey: optional("S3_SECRET_KEY", ""),
  },
} as const;
