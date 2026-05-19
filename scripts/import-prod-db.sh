#!/usr/bin/env bash
# Import the production database (and uploaded media) into the local dev setup.
#
# What it does:
#   1. SSHes into the production VPS and runs pg_dump there (custom format).
#   2. Streams the dump down to a local temp file.
#   3. Drops & recreates the local dev database and restores the dump into it.
#   4. rsyncs the production audio + image uploads down so local audio/images work.
#
# The production Postgres only listens on the VPS localhost, so the dump has to
# run on the server. Connection strings AND the production ssh target are read
# from .env (gitignored) so no credentials or infra live in this public repo.
#
# Required in .env (or as env vars):
#   PROD_SSH_TARGET   ssh login for the prod box, e.g. "user@host"
#   PROD_APP_DIR      remote app dir (optional, default /var/www/kalenjin)
#
# This drops and recreates the local DB with no prompt — it is destructive by
# design (the local DB is a disposable mirror of production).
#
# Usage:
#   scripts/import-prod-db.sh [--skip-media]
#
#   --skip-media  Only import the database; don't rsync uploads/audio.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

# Reads a single `KEY=value` line from the local .env (which can contain stray
# non-shell lines), trimming surrounding quotes/whitespace.
read_env_value() {
	grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '[:space:]'
}

SKIP_MEDIA=0
for arg in "$@"; do
	case "$arg" in
		--skip-media) SKIP_MEDIA=1 ;;
		-h | --help)
			grep '^#' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			echo "Unknown option: $arg" >&2
			exit 1
			;;
	esac
done

# --- Read the local DATABASE_URL ------------------------------------------------
# The local .env can contain stray non-shell lines, so grep the single line
# instead of sourcing the whole file.
if [[ ! -f .env ]]; then
	echo "ERROR: no .env in $REPO_ROOT — copy one in with the local DATABASE_URL first." >&2
	exit 1
fi

# Production SSH target lives in .env (gitignored), not in this script: this
# repo is public, so a real ssh user@host must not be committed. Environment
# variables override .env for one-off runs.
SSH_TARGET="${PROD_SSH_TARGET:-$(read_env_value PROD_SSH_TARGET)}"
REMOTE_APP_DIR="${PROD_APP_DIR:-$(read_env_value PROD_APP_DIR)}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/kalenjin}"
if [[ -z "$SSH_TARGET" ]]; then
	echo "ERROR: PROD_SSH_TARGET is not set. Add it to $REPO_ROOT/.env" >&2
	echo "       (e.g. PROD_SSH_TARGET=\"user@your-host\"), or pass it as an" >&2
	echo "       environment variable: PROD_SSH_TARGET=user@host npm run db:import-prod" >&2
	exit 1
fi

LOCAL_DB_URL="$(read_env_value DATABASE_URL)"
if [[ -z "$LOCAL_DB_URL" ]]; then
	echo "ERROR: DATABASE_URL not found in $REPO_ROOT/.env" >&2
	exit 1
fi

# psql/pg tools reject Prisma's "?schema=public" query suffix, so strip it.
LOCAL_PG_URL="${LOCAL_DB_URL%%\?*}"
LOCAL_DB_NAME="${LOCAL_PG_URL##*/}"
LOCAL_BASE_URL="${LOCAL_PG_URL%/*}"
LOCAL_MAINT_URL="${LOCAL_BASE_URL}/postgres"

if [[ -z "$LOCAL_DB_NAME" || "$LOCAL_DB_NAME" == "$LOCAL_PG_URL" ]]; then
	echo "ERROR: could not parse a database name out of the local DATABASE_URL." >&2
	exit 1
fi

echo "Local target database : $LOCAL_DB_NAME (will be dropped & recreated)"
echo "Production SSH target  : $SSH_TARGET ($REMOTE_APP_DIR)"
echo

# --- Open one shared SSH connection --------------------------------------------
# The dump, the remote env read, and both rsyncs would each authenticate
# separately. Multiplex them over a single master connection so the password
# (or 2FA) is only entered once. Keep the control socket in a short /tmp path
# to stay under the ~104-char unix socket limit.
SSH_SOCK_DIR="$(mktemp -d /tmp/kalenjin-import.XXXXXX)"
SSH_SOCK="$SSH_SOCK_DIR/cm"
SSH_OPTS=(-o "ControlMaster=auto" -o "ControlPath=$SSH_SOCK" -o "ControlPersist=120")
DUMP_FILE="$(mktemp -t kalenjin-prod-XXXXXX.dump)"

cleanup() {
	rm -f "$DUMP_FILE"
	ssh -O exit -o "ControlPath=$SSH_SOCK" "$SSH_TARGET" 2>/dev/null || true
	rm -rf "$SSH_SOCK_DIR"
}
trap cleanup EXIT

echo "==> Connecting to $SSH_TARGET (password entered once for this run)..."
ssh "${SSH_OPTS[@]}" -fN "$SSH_TARGET"

# --- Dump production ------------------------------------------------------------
echo "==> Dumping production database over SSH..."
# Everything below runs on the server: read its own DATABASE_URL, strip the
# surrounding quotes and the Prisma "?schema=" query suffix, and stream a
# custom-format dump to our stdout. The heredoc is unquoted, so only \$, \`
# and \\ are deferred to the remote shell — quotes pass through literally.
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s" >"$DUMP_FILE" <<REMOTE
set -euo pipefail
LINE="\$(grep -E '^DATABASE_URL=' "$REMOTE_APP_DIR/.env" | head -n1)"
PROD_URL="\${LINE#DATABASE_URL=}"
PROD_URL="\${PROD_URL%\\"}"
PROD_URL="\${PROD_URL#\\"}"
PROD_URL="\${PROD_URL%%\?*}"
if [[ -z "\$PROD_URL" ]]; then
	echo "no DATABASE_URL in $REMOTE_APP_DIR/.env" >&2
	exit 1
fi
pg_dump --format=custom --no-owner --no-privileges "\$PROD_URL"
REMOTE

if [[ ! -s "$DUMP_FILE" ]]; then
	echo "ERROR: production dump came back empty." >&2
	exit 1
fi
echo "    dump size: $(du -h "$DUMP_FILE" | cut -f1)"

# --- Recreate the local database -----------------------------------------------
echo "==> Dropping and recreating local database \"$LOCAL_DB_NAME\"..."
psql "$LOCAL_MAINT_URL" -v ON_ERROR_STOP=1 -q \
	-c "DROP DATABASE IF EXISTS \"$LOCAL_DB_NAME\" WITH (FORCE);" \
	-c "CREATE DATABASE \"$LOCAL_DB_NAME\";"

echo "==> Restoring dump into local database..."
# --no-owner/--no-privileges so the dump restores cleanly under the local role.
# pg_restore exits non-zero on benign notices (e.g. extension comments), so
# don't let `set -e` kill us on those; surface real failures via the verify.
pg_restore --no-owner --no-privileges --clean --if-exists \
	--dbname "$LOCAL_PG_URL" "$DUMP_FILE" || true

echo "==> Verifying restore..."
TABLE_COUNT="$(psql "$LOCAL_PG_URL" -tAc \
	"SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
if [[ "${TABLE_COUNT:-0}" -lt 1 ]]; then
	echo "ERROR: restore produced no tables in the public schema." >&2
	exit 1
fi
echo "    public tables: $TABLE_COUNT"

echo "==> Regenerating Prisma client..."
npx prisma generate >/dev/null

# --- Sync uploaded media -------------------------------------------------------
if [[ "$SKIP_MEDIA" -eq 1 ]]; then
	echo "==> Skipping media sync (--skip-media)."
else
	echo "==> Resolving remote media directories..."
	# Read the remote app's configured dirs; fall back to the code defaults
	# (audio: ./.uploads/audio, images: ./uploads), resolved against the app dir.
	REMOTE_ENV="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "grep -E '^(AUDIO_UPLOAD_DIR|UPLOADS_DIR)=' $REMOTE_APP_DIR/.env || true")"
	REMOTE_AUDIO_REL="$(echo "$REMOTE_ENV" | grep -E '^AUDIO_UPLOAD_DIR=' | head -n1 | cut -d= -f2- | tr -d '"' || true)"
	REMOTE_UPLOADS_REL="$(echo "$REMOTE_ENV" | grep -E '^UPLOADS_DIR=' | head -n1 | cut -d= -f2- | tr -d '"' || true)"
	REMOTE_AUDIO_REL="${REMOTE_AUDIO_REL:-./.uploads/audio}"
	REMOTE_UPLOADS_REL="${REMOTE_UPLOADS_REL:-uploads}"

	resolve_remote() {
		case "$1" in
			/*) echo "$1" ;;
			*) echo "$REMOTE_APP_DIR/${1#./}" ;;
		esac
	}
	REMOTE_AUDIO_DIR="$(resolve_remote "$REMOTE_AUDIO_REL")"
	REMOTE_UPLOADS_DIR="$(resolve_remote "$REMOTE_UPLOADS_REL")"

	# Local dirs mirror local .env, same code defaults.
	LOCAL_AUDIO_REL="$(grep -E '^AUDIO_UPLOAD_DIR=' .env | head -n1 | cut -d= -f2- | tr -d '"' || true)"
	LOCAL_UPLOADS_REL="$(grep -E '^UPLOADS_DIR=' .env | head -n1 | cut -d= -f2- | tr -d '"' || true)"
	LOCAL_AUDIO_DIR="$REPO_ROOT/${LOCAL_AUDIO_REL:-./.uploads/audio}"
	LOCAL_UPLOADS_DIR="$REPO_ROOT/${LOCAL_UPLOADS_REL:-uploads}"
	LOCAL_AUDIO_DIR="${LOCAL_AUDIO_DIR/.\//}"
	LOCAL_UPLOADS_DIR="${LOCAL_UPLOADS_DIR/.\//}"

	mkdir -p "$LOCAL_AUDIO_DIR" "$LOCAL_UPLOADS_DIR"

	echo "==> Syncing audio: $SSH_TARGET:$REMOTE_AUDIO_DIR -> $LOCAL_AUDIO_DIR"
	rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
		"$SSH_TARGET:$REMOTE_AUDIO_DIR/" "$LOCAL_AUDIO_DIR/" || \
		echo "    (audio sync skipped — remote dir may not exist yet)"

	echo "==> Syncing images: $SSH_TARGET:$REMOTE_UPLOADS_DIR -> $LOCAL_UPLOADS_DIR"
	# Exclude the audio subdir in case it lives under the uploads dir (the
	# DEPLOYMENT.md layout nests audio at uploads/audio); it's synced above.
	rsync -az --delete --exclude 'audio/' -e "ssh ${SSH_OPTS[*]}" \
		"$SSH_TARGET:$REMOTE_UPLOADS_DIR/" "$LOCAL_UPLOADS_DIR/" || \
		echo "    (image sync skipped — remote dir may not exist yet)"
fi

echo
echo "==> Done. Local database \"$LOCAL_DB_NAME\" now mirrors production."
