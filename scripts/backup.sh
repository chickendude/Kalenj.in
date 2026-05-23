#!/usr/bin/env bash
# Nightly backup of the production database + uploaded media to this computer.
#
# What it does:
#   1. SSHes into the production VPS and runs pg_dump there (plain SQL, with
#      DROP ... IF EXISTS so the dump can be restored straight back into prod),
#      gzips it on the server, and streams it down.
#   2. rsyncs the production audio + image uploads down into a NEW dated
#      snapshot, hard-linking unchanged files against the previous snapshot
#      (Time Machine style) so disk only grows by what actually changed.
#   3. Compares the new dump + media against the previous snapshot. If NOTHING
#      changed, the just-created snapshot is thrown away and nothing is kept.
#   4. Prunes old snapshots: keeps every daily snapshot from the last 30 days,
#      then one-per-month for the last 12 months; always keeps the newest.
#
# Everything runs read-only against production. The production Postgres only
# listens on the VPS localhost, so the dump runs on the server. The prod ssh
# target and app dir are read from .env (gitignored) so no infra lives in this
# public repo. The prod DATABASE_URL never leaves the server.
#
# Required in .env (or as env vars):
#   PROD_SSH_TARGET   ssh login for the prod box, e.g. "user@host"
#   PROD_APP_DIR      remote app dir (optional, default /var/www/kalenjin)
#
# Backups are written to $KALENJIN_BACKUP_DIR (default: ~/kalenjin-backups).
#
# Usage:
#   scripts/backup.sh [--force]
#
#   --force   Write a snapshot even if nothing changed since the last one.
#
# This is designed to run unattended from launchd, so SSH must be passwordless
# (key-based). It uses BatchMode so a missing key fails fast instead of hanging
# on a password prompt.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

FORCE=0
for arg in "$@"; do
	case "$arg" in
		--force) FORCE=1 ;;
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

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Reads a single `KEY=value` line from the local .env (which can contain stray
# non-shell lines), trimming surrounding quotes/whitespace.
read_env_value() {
	grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '[:space:]'
}

if [[ ! -f .env ]]; then
	echo "ERROR: no .env in $REPO_ROOT — need PROD_SSH_TARGET (and local DATABASE_URL)." >&2
	exit 1
fi

SSH_TARGET="${PROD_SSH_TARGET:-$(read_env_value PROD_SSH_TARGET)}"
REMOTE_APP_DIR="${PROD_APP_DIR:-$(read_env_value PROD_APP_DIR)}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/var/www/kalenjin}"
if [[ -z "$SSH_TARGET" ]]; then
	echo "ERROR: PROD_SSH_TARGET is not set. Add it to $REPO_ROOT/.env" >&2
	exit 1
fi

BACKUP_ROOT="${KALENJIN_BACKUP_DIR:-$HOME/kalenjin-backups}"
SNAP_ROOT="$BACKUP_ROOT/snapshots"
mkdir -p "$SNAP_ROOT"

log "Backup root      : $BACKUP_ROOT"
log "Production target: $SSH_TARGET ($REMOTE_APP_DIR)"

# Newest existing snapshot (lexical sort works because names are zero-padded
# YYYY-MM-DD_HHMMSS). Empty on the very first run.
PREV_SNAP=""
PREV_SNAP="$(find "$SNAP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' 2>/dev/null | sort | tail -n1)"

TS="$(date '+%Y-%m-%d_%H%M%S')"
WORK="$SNAP_ROOT/.in-progress-$TS"
rm -rf "$WORK"
mkdir -p "$WORK/media/audio" "$WORK/media/uploads"

# --- One shared SSH connection (key auth, no prompts) --------------------------
SSH_SOCK_DIR="$(mktemp -d /tmp/kalenjin-backup.XXXXXX)"
SSH_SOCK="$SSH_SOCK_DIR/cm"
SSH_OPTS=(-o "BatchMode=yes" -o "ControlMaster=auto" -o "ControlPath=$SSH_SOCK" -o "ControlPersist=120")

cleanup() {
	ssh -O exit -o "ControlPath=$SSH_SOCK" "$SSH_TARGET" 2>/dev/null || true
	rm -rf "$SSH_SOCK_DIR"
	# If we bailed before promoting the work dir, don't leave it lying around.
	[[ -d "$WORK" ]] && rm -rf "$WORK"
}
trap cleanup EXIT

log "Connecting to $SSH_TARGET ..."
if ! ssh "${SSH_OPTS[@]}" -fN "$SSH_TARGET"; then
	echo "ERROR: could not open SSH connection to $SSH_TARGET." >&2
	echo "       Passwordless key auth is required for unattended backups." >&2
	echo "       Try: ssh-copy-id $SSH_TARGET" >&2
	exit 1
fi

# --- Dump production database (gzipped on the server) --------------------------
log "Dumping production database ..."
# The heredoc is unquoted, so \$, \` and \\ defer to the remote shell; quotes
# pass through literally. Read the server's own DATABASE_URL, strip quotes and
# the Prisma "?schema=" suffix, dump plain SQL with DROP IF EXISTS, gzip it.
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s" >"$WORK/db.sql.gz" <<REMOTE
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
pg_dump --format=plain --clean --if-exists --no-owner --no-privileges "\$PROD_URL" | gzip -c
REMOTE

if [[ ! -s "$WORK/db.sql.gz" ]]; then
	echo "ERROR: production dump came back empty." >&2
	exit 1
fi
log "    dump size: $(du -h "$WORK/db.sql.gz" | cut -f1)"

# Content hash of the dump, ignoring the volatile "-- Dumped ..." header lines
# (server/pg version strings) so an unchanged database always hashes the same.
DB_HASH="$(gzip -dc "$WORK/db.sql.gz" | grep -v '^-- Dumped' | shasum -a 256 | cut -d' ' -f1)"

# --- Resolve remote media directories ------------------------------------------
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

# --- Sync media into the new snapshot (hard-linking unchanged files) -----------
# --link-dest points at the matching subdir of the previous snapshot, so files
# that haven't changed become hard links instead of fresh copies.
AUDIO_LINK=()
UPLOADS_LINK=()
if [[ -n "$PREV_SNAP" && -d "$PREV_SNAP/media/audio" ]]; then
	AUDIO_LINK=(--link-dest "$PREV_SNAP/media/audio")
fi
if [[ -n "$PREV_SNAP" && -d "$PREV_SNAP/media/uploads" ]]; then
	UPLOADS_LINK=(--link-dest "$PREV_SNAP/media/uploads")
fi

log "Syncing audio  : $REMOTE_AUDIO_DIR"
rsync -az --delete ${AUDIO_LINK[@]+"${AUDIO_LINK[@]}"} \
	-e "ssh ${SSH_OPTS[*]}" \
	"$SSH_TARGET:$REMOTE_AUDIO_DIR/" "$WORK/media/audio/" 2>/dev/null || \
	log "    (audio sync skipped — remote dir may not exist yet)"

log "Syncing images : $REMOTE_UPLOADS_DIR"
rsync -az --delete --exclude 'audio/' ${UPLOADS_LINK[@]+"${UPLOADS_LINK[@]}"} \
	-e "ssh ${SSH_OPTS[*]}" \
	"$SSH_TARGET:$REMOTE_UPLOADS_DIR/" "$WORK/media/uploads/" 2>/dev/null || \
	log "    (image sync skipped — remote dir may not exist yet)"

# Media fingerprint: relative path + size + mtime for every file. rsync -a
# preserves mtime, and --link-dest only hard-links when size+mtime match, so
# this fingerprint changes exactly when the media set changes.
( cd "$WORK/media" && find . -type f -exec stat -f '%z %m %N' {} \; 2>/dev/null | LC_ALL=C sort ) > "$WORK/media.manifest"
MEDIA_HASH="$(shasum -a 256 "$WORK/media.manifest" | cut -d' ' -f1)"

# --- Did anything change vs the previous snapshot? -----------------------------
CHANGED=1
if [[ "$FORCE" -eq 0 && -n "$PREV_SNAP" && -f "$PREV_SNAP/.dbhash" && -f "$PREV_SNAP/.mediahash" ]]; then
	PREV_DB_HASH="$(cat "$PREV_SNAP/.dbhash")"
	PREV_MEDIA_HASH="$(cat "$PREV_SNAP/.mediahash")"
	if [[ "$DB_HASH" == "$PREV_DB_HASH" && "$MEDIA_HASH" == "$PREV_MEDIA_HASH" ]]; then
		CHANGED=0
	fi
fi

if [[ "$CHANGED" -eq 0 ]]; then
	log "No changes since $(basename "$PREV_SNAP") — discarding snapshot."
	rm -rf "$WORK"
	WORK=""  # so the cleanup trap doesn't try again
else
	echo "$DB_HASH" > "$WORK/.dbhash"
	echo "$MEDIA_HASH" > "$WORK/.mediahash"
	{
		echo "snapshot:   $TS"
		echo "created:    $(date)"
		echo "source:     $SSH_TARGET ($REMOTE_APP_DIR)"
		echo "db_sha256:  $DB_HASH"
		echo "media_sha:  $MEDIA_HASH"
		echo "db_size:    $(du -h "$WORK/db.sql.gz" | cut -f1)"
		echo "media_size: $(du -sh "$WORK/media" | cut -f1)"
		echo "media_files:$(grep -c '' "$WORK/media.manifest" 2>/dev/null || echo 0)"
	} > "$WORK/manifest.txt"

	FINAL="$SNAP_ROOT/$TS"
	mv "$WORK" "$FINAL"
	WORK=""  # promoted; cleanup trap should leave it alone
	log "Snapshot saved : $FINAL ($(du -sh "$FINAL" | cut -f1))"
fi

# --- Prune old snapshots (Grandfather-Father-Son) ------------------------------
# Keep: every snapshot from the last 30 days; then the newest snapshot in each
# of the last 12 calendar months; always keep the single newest overall.
prune_snapshots() {
	local now day30 month12 newest
	now="$(date +%s)"
	day30="$((now - 30 * 86400))"
	month12="$(date -v-12m +%s)"

	# All snapshots, newest first.
	local snaps=()
	while IFS= read -r d; do
		[[ -n "$d" ]] && snaps+=("$d")
	done < <(find "$SNAP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' | LC_ALL=C sort -r)

	[[ "${#snaps[@]}" -le 1 ]] && return 0
	newest="${snaps[0]}"

	local -A month_seen=()
	local snap name datepart epoch ym
	for snap in "${snaps[@]}"; do
		name="$(basename "$snap")"
		[[ "$snap" == "$newest" ]] && continue  # never delete the newest

		datepart="${name%%_*}"  # YYYY-MM-DD
		ym="${name:0:7}"        # YYYY-MM
		epoch="$(date -j -f '%Y-%m-%d' "$datepart" '+%s' 2>/dev/null || echo 0)"

		if [[ "$epoch" -ge "$day30" ]]; then
			continue  # within 30 days: keep all
		elif [[ "$epoch" -ge "$month12" ]]; then
			if [[ -z "${month_seen[$ym]:-}" ]]; then
				month_seen[$ym]=1  # newest in this month (we iterate newest-first): keep
				continue
			fi
			log "Pruning (monthly dup): $name"
			rm -rf "$snap"
		else
			log "Pruning (>12 months): $name"
			rm -rf "$snap"
		fi
	done
}

prune_snapshots

log "Done."
