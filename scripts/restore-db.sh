#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-tar-gz> [project-root]" >&2
  exit 1
fi

BACKUP_FILE="$1"
PROJECT_ROOT="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DB_DIR="$PROJECT_ROOT/server/data"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

mkdir -p "$DB_DIR"

tar -xzf "$BACKUP_FILE" -C "$DB_DIR"
echo "Restore complete. Restart API server before use."

