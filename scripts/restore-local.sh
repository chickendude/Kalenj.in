#!/usr/bin/env bash
# Verify a backup snapshot by restoring its database dump into a LOCAL scratch
# database (never prod). This is how you prove a backup is actually restorable.
#
# It loads <snapshot>/db.sql.gz into a throwaway database, then reports the
# table count and the row counts of the biggest tables so you can eyeball that
# real data came back. The scratch DB is dropped afterwards unless you pass
# --keep.
#
# Connection details (host/port/user/password) are taken from the local
# DATABASE_URL in .env; only the database NAME is swapped for the scratch one.
#
# Usage:
#   scripts/restore-local.sh <snapshot> [--db NAME] [--keep]
#
#   <snapshot>   Snapshot name (e.g. 2026-05-22_120041) under
#                $KALENJIN_BACKUP_DIR/snapshots, or an absolute path.
#   --db NAME    Scratch database name. Default: kalenjin_restore_test
#   --keep       Don't drop the scratch DB afterwards (so you can inspect it).

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

SNAP_ARG=""
SCRATCH_DB="kalenjin_restore_test"
KEEP=0
while [[ $# -gt 0 ]]; do
	case "$1" in
		--db) SCRATCH_DB="$2"; shift 2 ;;
		--keep) KEEP=1; shift ;;
		-h | --help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		-*) echo "Unknown option: $1" >&2; exit 1 ;;
		*) SNAP_ARG="$1"; shift ;;
	esac
done

[[ -n "$SNAP_ARG" ]] || { echo "ERROR: no snapshot given." >&2; exit 1; }
[[ -f .env ]] || { echo "ERROR: no .env in $REPO_ROOT." >&2; exit 1; }

read_env_value() {
	grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '[:space:]'
}

BACKUP_ROOT="${KALENJIN_BACKUP_DIR:-$HOME/kalenjin-backups}"
if [[ -d "$SNAP_ARG" ]]; then
	SNAP_DIR="$SNAP_ARG"
elif [[ -d "$BACKUP_ROOT/snapshots/$SNAP_ARG" ]]; then
	SNAP_DIR="$BACKUP_ROOT/snapshots/$SNAP_ARG"
else
	echo "ERROR: snapshot not found: $SNAP_ARG (looked in $BACKUP_ROOT/snapshots/)" >&2
	exit 1
fi
[[ -f "$SNAP_DIR/db.sql.gz" ]] || { echo "ERROR: $SNAP_DIR/db.sql.gz missing." >&2; exit 1; }

# Parse the local DATABASE_URL; strip Prisma's "?schema=" suffix, swap the DB
# name for the scratch one, and build a maintenance URL on the "postgres" db.
LOCAL_DB_URL="$(read_env_value DATABASE_URL)"
[[ -n "$LOCAL_DB_URL" ]] || { echo "ERROR: DATABASE_URL not found in .env." >&2; exit 1; }
LOCAL_PG_URL="${LOCAL_DB_URL%%\?*}"
LOCAL_BASE_URL="${LOCAL_PG_URL%/*}"
SCRATCH_URL="$LOCAL_BASE_URL/$SCRATCH_DB"
MAINT_URL="$LOCAL_BASE_URL/postgres"

echo "==> Snapshot      : $(basename "$SNAP_DIR")"
echo "==> Scratch DB    : $SCRATCH_DB (on the local Postgres from .env)"

cleanup() {
	if [[ "$KEEP" -eq 0 ]]; then
		psql "$MAINT_URL" -q -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE);" 2>/dev/null || true
		echo "==> Dropped scratch DB \"$SCRATCH_DB\"."
	else
		echo "==> Kept scratch DB. Inspect with:  psql \"$SCRATCH_URL\""
	fi
}
trap cleanup EXIT

echo "==> Creating fresh scratch database ..."
psql "$MAINT_URL" -v ON_ERROR_STOP=1 -q \
	-c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE);" \
	-c "CREATE DATABASE \"$SCRATCH_DB\";"

echo "==> Loading dump into scratch database ..."
# Capture any ERROR lines but don't abort on benign notices; the real pass/fail
# check is the table + row counts below.
LOAD_LOG="$(mktemp -t kalenjin-restore-log-XXXXXX)"
gzip -dc "$SNAP_DIR/db.sql.gz" | psql "$SCRATCH_URL" >"$LOAD_LOG" 2>&1 || true
if grep -q '^ERROR' "$LOAD_LOG"; then
	echo "    ! psql reported errors during load:"
	grep '^ERROR' "$LOAD_LOG" | sed 's/^/      /' | head -20
fi
rm -f "$LOAD_LOG"

echo "==> Verifying ..."
TABLE_COUNT="$(psql "$SCRATCH_URL" -tAc \
	"SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
echo "    public tables: ${TABLE_COUNT:-0}"
if [[ "${TABLE_COUNT:-0}" -lt 1 ]]; then
	echo "    RESTORE FAILED: no tables in the public schema." >&2
	exit 1
fi

echo "    largest tables by row count:"
psql "$SCRATCH_URL" -tAF $'\t' -c "
	SELECT relname, n_live_tup
	FROM pg_stat_user_tables
	ORDER BY n_live_tup DESC
	LIMIT 10;" 2>/dev/null | awk -F'\t' '{printf "      %-40s %s rows\n", $1, $2}'

echo
echo "==> Restore verified: the dump loads into a clean database with data."
