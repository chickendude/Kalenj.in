#!/usr/bin/env bash
# DANGER: Restore a local backup snapshot back UP to production.
#
# This OVERWRITES the production database and/or the production media with the
# contents of a snapshot taken by scripts/backup.sh. It is a break-glass tool
# for disaster recovery, not part of the nightly flow.
#
# What it does:
#   1. DB:    streams the snapshot's gzipped dump up to the server and loads it
#             with psql. The dump was taken with `--clean --if-exists`, so it
#             drops and recreates every object in place.
#   2. MEDIA: rsyncs the snapshot's audio + images back up to the prod upload
#             dirs (with --delete, so prod ends up matching the snapshot).
#
# The prod ssh target / app dir are read from .env; the prod DATABASE_URL is
# resolved on the server and never leaves it.
#
# Usage:
#   scripts/restore-to-prod.sh <snapshot> [--db-only | --media-only] [--yes]
#
#   <snapshot>     A snapshot name (e.g. 2026-05-21_030000) under
#                  $KALENJIN_BACKUP_DIR/snapshots, or an absolute path to one.
#   --db-only      Restore only the database.
#   --media-only   Restore only the media.
#   --yes          Skip the interactive typed confirmation (use with care).
#
# STRONGLY recommended: stop the app on the server first so nothing writes
# during the restore, e.g.  ssh <prod> 'sudo systemctl stop kalenjin-app'
# and start it again afterwards.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

SNAP_ARG=""
DO_DB=1
DO_MEDIA=1
ASSUME_YES=0
for arg in "$@"; do
	case "$arg" in
		--db-only) DO_MEDIA=0 ;;
		--media-only) DO_DB=0 ;;
		--yes) ASSUME_YES=1 ;;
		-h | --help)
			grep '^#' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		-*)
			echo "Unknown option: $arg" >&2
			exit 1
			;;
		*)
			if [[ -n "$SNAP_ARG" ]]; then
				echo "Unexpected extra argument: $arg" >&2
				exit 1
			fi
			SNAP_ARG="$arg"
			;;
	esac
done

if [[ -z "$SNAP_ARG" ]]; then
	echo "ERROR: no snapshot given. Usage: scripts/restore-to-prod.sh <snapshot> [...]" >&2
	exit 1
fi

read_env_value() {
	grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '[:space:]'
}

[[ -f .env ]] || { echo "ERROR: no .env in $REPO_ROOT." >&2; exit 1; }

SSH_TARGET="${PROD_SSH_TARGET:-$(read_env_value PROD_SSH_TARGET)}"
REMOTE_APP_DIR="${PROD_APP_DIR:-$(read_env_value PROD_APP_DIR)}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/kalenjin}"
[[ -n "$SSH_TARGET" ]] || { echo "ERROR: PROD_SSH_TARGET not set in .env." >&2; exit 1; }

BACKUP_ROOT="${KALENJIN_BACKUP_DIR:-$HOME/kalenjin-backups}"

# Resolve the snapshot directory.
if [[ -d "$SNAP_ARG" ]]; then
	SNAP_DIR="$SNAP_ARG"
elif [[ -d "$BACKUP_ROOT/snapshots/$SNAP_ARG" ]]; then
	SNAP_DIR="$BACKUP_ROOT/snapshots/$SNAP_ARG"
else
	echo "ERROR: snapshot not found: $SNAP_ARG" >&2
	echo "       Looked in $BACKUP_ROOT/snapshots/" >&2
	exit 1
fi
SNAP_NAME="$(basename "$SNAP_DIR")"

[[ "$DO_DB" -eq 1 && ! -f "$SNAP_DIR/db.sql.gz" ]] && { echo "ERROR: $SNAP_DIR/db.sql.gz missing." >&2; exit 1; }

echo "=================================================================="
echo " RESTORE TO PRODUCTION"
echo "=================================================================="
echo " snapshot : $SNAP_NAME"
echo " target   : $SSH_TARGET ($REMOTE_APP_DIR)"
echo " database : $([[ "$DO_DB" -eq 1 ]] && echo "WILL BE OVERWRITTEN" || echo "skipped")"
echo " media    : $([[ "$DO_MEDIA" -eq 1 ]] && echo "WILL BE OVERWRITTEN (rsync --delete)" || echo "skipped")"
[[ -f "$SNAP_DIR/manifest.txt" ]] && { echo " ---"; sed 's/^/ /' "$SNAP_DIR/manifest.txt"; }
echo "=================================================================="
echo " This is DESTRUCTIVE and cannot be undone. Stop the app first:"
echo "   ssh $SSH_TARGET 'sudo systemctl stop kalenjin-app'"
echo "=================================================================="

if [[ "$ASSUME_YES" -ne 1 ]]; then
	printf 'Type exactly "RESTORE TO PROD" to continue: '
	read -r CONFIRM
	if [[ "$CONFIRM" != "RESTORE TO PROD" ]]; then
		echo "Aborted." >&2
		exit 1
	fi
fi

# --- Shared SSH connection -----------------------------------------------------
SSH_SOCK_DIR="$(mktemp -d /tmp/kalenjin-restore.XXXXXX)"
SSH_SOCK="$SSH_SOCK_DIR/cm"
SSH_OPTS=(-o "ControlMaster=auto" -o "ControlPath=$SSH_SOCK" -o "ControlPersist=120")
cleanup() {
	ssh -O exit -o "ControlPath=$SSH_SOCK" "$SSH_TARGET" 2>/dev/null || true
	rm -rf "$SSH_SOCK_DIR"
}
trap cleanup EXIT

echo "==> Connecting to $SSH_TARGET ..."
ssh "${SSH_OPTS[@]}" -fN "$SSH_TARGET"

# --- Restore database ----------------------------------------------------------
if [[ "$DO_DB" -eq 1 ]]; then
	echo "==> Restoring database from $SNAP_NAME/db.sql.gz ..."
	# Resolve the prod DATABASE_URL on the server and exec psql there, reading
	# the SQL we pipe in over ssh stdin. The remote command is passed as an
	# argument (not a heredoc), so stdin stays free for the SQL stream.
	REMOTE_PSQL='set -euo pipefail; '
	REMOTE_PSQL+='LINE="$(grep -E "^DATABASE_URL=" '"$REMOTE_APP_DIR"'/.env | head -n1)"; '
	REMOTE_PSQL+='U="${LINE#DATABASE_URL=}"; U="${U%\"}"; U="${U#\"}"; U="${U%%\?*}"; '
	REMOTE_PSQL+='[ -n "$U" ] || { echo "no DATABASE_URL on server" >&2; exit 1; }; '
	REMOTE_PSQL+='exec psql -v ON_ERROR_STOP=1 "$U"'
	gzip -dc "$SNAP_DIR/db.sql.gz" | ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$REMOTE_PSQL"
	echo "    database restored."
fi

# --- Restore media -------------------------------------------------------------
if [[ "$DO_MEDIA" -eq 1 ]]; then
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

	if [[ -d "$SNAP_DIR/media/audio" ]]; then
		echo "==> Restoring audio -> $SSH_TARGET:$REMOTE_AUDIO_DIR ..."
		ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p '$REMOTE_AUDIO_DIR'"
		rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
			"$SNAP_DIR/media/audio/" "$SSH_TARGET:$REMOTE_AUDIO_DIR/"
	fi
	if [[ -d "$SNAP_DIR/media/uploads" ]]; then
		echo "==> Restoring images -> $SSH_TARGET:$REMOTE_UPLOADS_DIR ..."
		ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p '$REMOTE_UPLOADS_DIR'"
		rsync -az --delete --exclude 'audio/' -e "ssh ${SSH_OPTS[*]}" \
			"$SNAP_DIR/media/uploads/" "$SSH_TARGET:$REMOTE_UPLOADS_DIR/"
	fi
	echo "    media restored."
fi

echo
echo "==> Done. Remember to start the app again:"
echo "    ssh $SSH_TARGET 'sudo systemctl start kalenjin-app'"
