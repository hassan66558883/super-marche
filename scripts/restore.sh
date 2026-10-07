#!/bin/sh
# Restores a backup into a NEW database, checks it, then (only after confirmation) switches the
# API to it. The current database is kept untouched as a fallback — nothing is dropped.
#   ./scripts/restore.sh backups/technova-20261007-020000.dump
set -eu
cd "$(dirname "$0")/.."
dump="${1:?Usage: restore.sh <file.dump>}"
[ -s "$dump" ] || { echo "File not found: $dump"; exit 1; }
target="technova_restore_$(date +%Y%m%d%H%M%S)"
echo "Restoring $dump into new database $target…"
docker compose exec -T db sh -c "createdb -U \"\$POSTGRES_USER\" $target"
docker compose exec -T db sh -c "pg_restore --no-owner --exit-on-error -U \"\$POSTGRES_USER\" -d $target" < "$dump"
docker compose exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d $target -Atc 'select count(*) as sales from sales'"
cat <<MSG

Restored into "$target". The live database was not modified.
To use it: set POSTGRES_DB=$target in .env, then run: docker compose up -d api backup
MSG
