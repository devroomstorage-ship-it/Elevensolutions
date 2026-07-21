#!/usr/bin/env bash
# backend/scripts/backup-db.sh
#
# Dumps the Postgres database pointed to by DATABASE_URL to a gzipped,
# timestamped file. Works from any machine with `pg_dump` installed and
# network access to the DB — including Render's managed Postgres today
# (via its external connection string), not just the future VPS.
#
# Why this exists now, not just in GODADDY_PRODUCTION_GUIDE.txt: Render's
# free Postgres is deleted after 90 days with no built-in backup, and the
# VPS move is still only planned. This closes that gap in the meantime.
#
# Usage:
#   DATABASE_URL="postgres://user:pass@host:port/db" ./backup-db.sh [outdir]
#
# outdir defaults to ./backups (created if missing). Old backups beyond
# KEEP_DAYS (default 14) are pruned automatically.
#
# On the future VPS, prefer the `docker exec ... pg_dump` form documented
# in GODADDY_PRODUCTION_GUIDE.txt section 2/9 and drop this script, since
# it can dump straight from the container without going over the network.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set." >&2
  echo "Usage: DATABASE_URL=postgres://... $0 [outdir]" >&2
  exit 1
fi

OUTDIR="${1:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$OUTDIR"

TIMESTAMP="$(date +%F_%H%M%S)"
OUTFILE="$OUTDIR/eleven_solutions_${TIMESTAMP}.sql.gz"

echo "Dumping database to $OUTFILE ..."
pg_dump "$DATABASE_URL" | gzip > "$OUTFILE"
echo "Done: $(du -h "$OUTFILE" | cut -f1) written."

echo "Pruning backups older than ${KEEP_DAYS} days in $OUTDIR ..."
find "$OUTDIR" -name 'eleven_solutions_*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete

echo "Reminder: this backup lives on whichever machine ran this script."
echo "Copy it off-server too (S3, Backblaze B2, rclone, etc.) — a backup"
echo "that only exists in one place is not a backup."
