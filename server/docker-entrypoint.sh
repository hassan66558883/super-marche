#!/bin/sh
# Applies pending migrations (additive, never resets data), then starts the API.
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations…"
  /app/node_modules/.bin/prisma migrate deploy
fi
exec "$@"
