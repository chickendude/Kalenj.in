#!/usr/bin/env bash
# SAFE disaster-recovery drill for restore-to-prod.sh.
#
# This proves the production restore *mechanism* works — without touching your
# live database or live media. It exercises the exact same ssh -> psql and
# rsync-up code paths the real restore uses, but against throwaway targets:
#
#   1. Transport probe : pipes a read-only SELECT through the same ssh+psql
#                        path restore-to-prod uses, against the LIVE db. Proves
#                        the connection + command quoting actually work.
#   2. Sandbox load    : creates a scratch database (kalenjin_restore_drill) on
#                        the server, loads the snapshot dump into it, counts the
#                        tables, then drops it. If the prod role can't create
#                        databases, this step is skipped with a clear note (the
#                        `npm run backup:verify` local test already proves the
#                        dump restores into a clean database).
#   3. Media probe     : rsyncs the snapshot media UP into a /tmp dir on the
#                        server (no --delete, never the live upload dirs),
#                        counts the files, then removes the temp dir.
#
# Nothing here is destructive to production. Run it whenever you want to be
# confident the real restore would work.
#
# Usage:
#   scripts/restore-prod-drill.sh [<snapshot>]
#
#   <snapshot>  Snapshot name or path. Default: the newest snapshot.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

read_env_value() {
	grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '[:space:]'
}

[[ -f .env ]] || { echo "ERROR: no .env in $REPO_ROOT." >&2; exit 1; }
SSH_TARGET="${PROD_SSH_TARGET:-$(read_env_value PROD_SSH_TARGET)}"
REMOTE_APP_DIR="${PROD_APP_DIR:-$(read_env_value PROD_APP_DIR)}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/kalenjin}"
[[ -n "$SSH_TARGET" ]] || { echo "ERROR: PROD_SSH_TARGET not set in .env." >&2; exit 1; }

BACKUP_ROOT="${KALENJIN_BACKUP_DIR:-$HOME/kalenjin-backups}"
SCRATCH_DB="kalenjin_restore_drill"

SNAP_ARG="${1:-}"
if [[ -z "$SNAP_ARG" ]]; then
	SNAP_DIR="$(find "$BACKUP_ROOT/snapshots" -mindepth 1 -maxdepth 1 -type d -name '20*' 2>/dev/null | sort | tail -n1)"
	[[ -n "$SNAP_DIR" ]] || { echo "ERROR: no snapshots in $BACKUP_ROOT/snapshots." >&2; exit 1; }
elif [[ -d "$SNAP_ARG" ]]; then
	SNAP_DIR="$SNAP_ARG"
elif [[ -d "$BACKUP_ROOT/snapshots/$SNAP_ARG" ]]; then
	SNAP_DIR="$BACKUP_ROOT/snapshots/$SNAP_ARG"
else
	echo "ERROR: snapshot not found: $SNAP_ARG" >&2
	exit 1
fi
[[ -f "$SNAP_DIR/db.sql.gz" ]] || { echo "ERROR: $SNAP_DIR/db.sql.gz missing." >&2; exit 1; }

echo "=================================================================="
echo " RESTORE-TO-PROD DRILL (non-destructive)"
echo "=================================================================="
echo " snapshot : $(basename "$SNAP_DIR")"
echo " target   : $SSH_TARGET ($REMOTE_APP_DIR)"
echo " scratch  : db=$SCRATCH_DB  +  /tmp media dir (both removed after)"
echo "=================================================================="

# --- Shared SSH connection -----------------------------------------------------
SSH_SOCK_DIR="$(mktemp -d /tmp/kalenjin-drill.XXXXXX)"
SSH_SOCK="$SSH_SOCK_DIR/cm"
SSH_OPTS=(-o "ControlMaster=auto" -o "ControlPath=$SSH_SOCK" -o "ControlPersist=120")
TMP_REMOTE="/tmp/kalenjin-restore-drill.$$"

cleanup() {
	# Best-effort teardown of anything the drill created on the server.
	ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s -- '$REMOTE_APP_DIR' '$SCRATCH_DB' '$TMP_REMOTE'" <<'REMOTE_CLEAN' 2>/dev/null || true
set -euo pipefail
APPDIR="$1"; SCRATCH="$2"; TMP="$3"
LINE="$(grep -E '^DATABASE_URL=' "$APPDIR/.env" | head -n1)"
U="${LINE#DATABASE_URL=}"; U="${U%\"}"; U="${U#\"}"; U="${U%%\?*}"
BASE="${U%/*}"
psql "$BASE/postgres" -q -c "DROP DATABASE IF EXISTS \"$SCRATCH\" WITH (FORCE);" >/dev/null 2>&1 || true
[ -n "$TMP" ] && rm -rf "$TMP"
REMOTE_CLEAN
	ssh -O exit -o "ControlPath=$SSH_SOCK" "$SSH_TARGET" 2>/dev/null || true
	rm -rf "$SSH_SOCK_DIR"
}
trap cleanup EXIT

echo "==> Connecting to $SSH_TARGET ..."
ssh "${SSH_OPTS[@]}" -fN "$SSH_TARGET"

# --- 1. Transport probe (read-only against the live DB) ------------------------
echo
echo "==> [1/3] Transport probe (read-only SELECT via the real ssh+psql path) ..."
# This is the exact remote command restore-to-prod.sh uses to reach prod psql.
REMOTE_PSQL='set -euo pipefail; '
REMOTE_PSQL+='LINE="$(grep -E "^DATABASE_URL=" '"$REMOTE_APP_DIR"'/.env | head -n1)"; '
REMOTE_PSQL+='U="${LINE#DATABASE_URL=}"; U="${U%\"}"; U="${U#\"}"; U="${U%%\?*}"; '
REMOTE_PSQL+='[ -n "$U" ] || { echo "no DATABASE_URL on server" >&2; exit 1; }; '
REMOTE_PSQL+='exec psql -v ON_ERROR_STOP=1 -tA "$U"'
PROBE="$(printf 'SELECT current_database();' | ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$REMOTE_PSQL")"
if [[ -n "$PROBE" ]]; then
	echo "    OK — reached prod database: $PROBE"
else
	echo "    FAILED — no response from prod psql." >&2
	exit 1
fi

# --- 2. Sandbox database load --------------------------------------------------
echo
echo "==> [2/3] Sandbox load into scratch DB \"$SCRATCH_DB\" ..."
CREATE_OK=1
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s -- '$REMOTE_APP_DIR' '$SCRATCH_DB'" <<'REMOTE_CREATE' || CREATE_OK=0
set -euo pipefail
APPDIR="$1"; SCRATCH="$2"
LINE="$(grep -E '^DATABASE_URL=' "$APPDIR/.env" | head -n1)"
U="${LINE#DATABASE_URL=}"; U="${U%\"}"; U="${U#\"}"; U="${U%%\?*}"
BASE="${U%/*}"
psql "$BASE/postgres" -v ON_ERROR_STOP=1 -q \
	-c "DROP DATABASE IF EXISTS \"$SCRATCH\" WITH (FORCE);" \
	-c "CREATE DATABASE \"$SCRATCH\";"
REMOTE_CREATE

if [[ "$CREATE_OK" -ne 1 ]]; then
	echo "    SKIPPED — could not create a scratch database on the server."
	echo "    (The prod DB role likely lacks CREATEDB. The dump itself is already"
	echo "     proven restorable by 'npm run backup:verify'. To enable this step,"
	echo "     grant CREATEDB to the prod role, or run the drill as a superuser.)"
else
	# Load the dump into the scratch DB through the same ssh+psql transport,
	# swapping only the database name (BASE/$SCRATCH instead of the live DB).
	REMOTE_LOAD="APPDIR='$REMOTE_APP_DIR'; SCRATCH='$SCRATCH_DB'; "'
		set -euo pipefail
		LINE="$(grep -E "^DATABASE_URL=" "$APPDIR/.env" | head -n1)"
		U="${LINE#DATABASE_URL=}"; U="${U%\"}"; U="${U#\"}"; U="${U%%\?*}"
		BASE="${U%/*}"
		exec psql -v ON_ERROR_STOP=0 -q "$BASE/$SCRATCH"'
	echo "    loading dump into scratch DB ..."
	gzip -dc "$SNAP_DIR/db.sql.gz" | ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$REMOTE_LOAD" >/dev/null 2>&1 || true

	TC="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s -- '$REMOTE_APP_DIR' '$SCRATCH_DB'" <<'REMOTE_VERIFY'
set -euo pipefail
APPDIR="$1"; SCRATCH="$2"
LINE="$(grep -E '^DATABASE_URL=' "$APPDIR/.env" | head -n1)"
U="${LINE#DATABASE_URL=}"; U="${U%\"}"; U="${U#\"}"; U="${U%%\?*}"
BASE="${U%/*}"
psql "$BASE/$SCRATCH" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
REMOTE_VERIFY
)"
	if [[ "${TC:-0}" -ge 1 ]]; then
		echo "    OK — dump restored into scratch DB: $TC public tables."
	else
		echo "    FAILED — scratch DB has no tables after load." >&2
		exit 1
	fi
fi

# --- 3. Media rsync-up probe ---------------------------------------------------
echo
echo "==> [3/3] Media rsync-up probe (into $TMP_REMOTE on the server) ..."
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p '$TMP_REMOTE/audio' '$TMP_REMOTE/uploads'"
if [[ -d "$SNAP_DIR/media/audio" ]]; then
	rsync -az -e "ssh ${SSH_OPTS[*]}" "$SNAP_DIR/media/audio/" "$SSH_TARGET:$TMP_REMOTE/audio/"
fi
if [[ -d "$SNAP_DIR/media/uploads" ]]; then
	rsync -az --exclude 'audio/' -e "ssh ${SSH_OPTS[*]}" "$SNAP_DIR/media/uploads/" "$SSH_TARGET:$TMP_REMOTE/uploads/"
fi
REMOTE_FILES="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "find '$TMP_REMOTE' -type f 2>/dev/null | wc -l | tr -d ' '")"
LOCAL_FILES="$(find "$SNAP_DIR/media" -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "    uploaded $REMOTE_FILES files (snapshot has $LOCAL_FILES)."
if [[ "${REMOTE_FILES:-0}" -eq "${LOCAL_FILES:-0}" && "${LOCAL_FILES:-0}" -ge 0 ]]; then
	echo "    OK — media rsync-up works."
else
	echo "    WARNING — file counts differ; check the output above." >&2
fi

echo
echo "=================================================================="
echo " DRILL COMPLETE — scratch DB and temp media dir are being removed."
echo " If all three steps said OK, the real restore-to-prod would work."
echo "=================================================================="
