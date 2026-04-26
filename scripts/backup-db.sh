#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_DIR="$PROJECT_ROOT/server/data"
DB="$DB_DIR/app.db"
BACKUP_DIR="$PROJECT_ROOT/backups"

if [[ ! -f "$DB" ]]; then
  echo "Database not found: $DB" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/appdb-backup-$STAMP.tar.gz"

FILES=("app.db")
[[ -f "$DB_DIR/app.db-wal" ]] && FILES+=("app.db-wal")
[[ -f "$DB_DIR/app.db-shm" ]] && FILES+=("app.db-shm")

(
  cd "$DB_DIR"
  tar -czf "$OUT" "${FILES[@]}"
)

echo "Backup created: $OUT"

