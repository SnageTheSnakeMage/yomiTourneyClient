#!/usr/bin/env bash
# -----------------------------------------------------------------------
# backup.sh — nightly backup script for the YOMIH tournament server
#
# Cron example (run daily at 03:00 server time):
#   0 3 * * * /opt/yomih-tourney/deploy/backup.sh >> /var/log/yomih-backup.log 2>&1
# -----------------------------------------------------------------------
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/yomih-tourney}"
COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE_STAMP="$(date +%Y%m%d_%H%M%S)"

source "$COMPOSE_DIR/.env"

mkdir -p "$BACKUP_DIR/postgres" "$BACKUP_DIR/replays"

# -----------------------------------------------------------------------
# 1. PostgreSQL dump
# -----------------------------------------------------------------------
PG_DUMP_FILE="$BACKUP_DIR/postgres/yomih_${DATE_STAMP}.sql.gz"
echo "[backup] Dumping Postgres to $PG_DUMP_FILE"

docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$PG_DUMP_FILE"

echo "[backup] Postgres dump complete: $(du -sh "$PG_DUMP_FILE" | cut -f1)"

# -----------------------------------------------------------------------
# 2. Replay storage snapshot (if using local driver)
# -----------------------------------------------------------------------
if [ "${STORAGE_DRIVER:-local}" = "local" ]; then
  REPLAY_ARCHIVE="$BACKUP_DIR/replays/replays_${DATE_STAMP}.tar.gz"
  echo "[backup] Archiving replay storage to $REPLAY_ARCHIVE"

  # The replay_storage Docker volume is mounted at /app/replays in the api container
  docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T api \
    tar czf - -C /app replays > "$REPLAY_ARCHIVE"

  echo "[backup] Replay archive complete: $(du -sh "$REPLAY_ARCHIVE" | cut -f1)"
fi

# -----------------------------------------------------------------------
# 3. Prune backups older than RETENTION_DAYS
# -----------------------------------------------------------------------
find "$BACKUP_DIR" -name "*.sql.gz"   -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "*.tar.gz"   -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Pruned backups older than ${RETENTION_DAYS} days"
echo "[backup] Done at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
