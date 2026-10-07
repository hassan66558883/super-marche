#!/bin/sh
# Manual backup: ./scripts/backup-now.sh  → backups/technova-manual-<date>.dump
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
file="backups/technova-manual-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db sh -c 'pg_dump --format=custom --compress=9 --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$file"
docker compose exec -T db pg_restore --list < "$file" >/dev/null
echo "Backup written: $file"
