#!/bin/sh
# Daily PostgreSQL backup (runs in the "backup" service). Compressed custom-format dumps,
# checked after writing, older ones pruned after BACKUP_KEEP_DAYS days.
set -eu
HOUR="${BACKUP_HOUR:-2}"
KEEP="${BACKUP_KEEP_DAYS:-30}"
mkdir -p /backups

run_backup() {
  stamp=$(date +%Y%m%d-%H%M%S)
  file="/backups/technova-${stamp}.dump"
  echo "[$(date)] Backup → ${file}"
  if pg_dump --format=custom --compress=9 --no-owner --file="${file}.tmp" && pg_restore --list "${file}.tmp" >/dev/null; then
    mv "${file}.tmp" "${file}"
    echo "[$(date)] Backup OK ($(du -h "${file}" | cut -f1))"
  else
    rm -f "${file}.tmp"
    echo "[$(date)] BACKUP FAILED" >&2
  fi
  find /backups -name 'technova-*.dump' -mtime +"${KEEP}" -print -delete || true
}

# One backup right away if none exists yet, then every day at HOUR:00
ls /backups/technova-*.dump >/dev/null 2>&1 || run_backup
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%Y-%m-%d) ${HOUR}:00:00" +%s 2>/dev/null || date -D '%Y-%m-%d %H:%M:%S' -d "$(date +%Y-%m-%d) ${HOUR}:00:00" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  run_backup
done
