#!/usr/bin/env bash
# Install (or reinstall) the nightly backup as a macOS launchd LaunchAgent.
#
# Unlike cron, a launchd calendar job whose fire time was missed because the
# Mac was asleep runs as soon as the machine wakes — so a 3am backup still
# happens even if the laptop was closed overnight.
#
# Usage:
#   scripts/install-backup-schedule.sh [--hour H] [--minute M] [--uninstall]
#
#   --hour H     Hour to run (0-23). Default: 3
#   --minute M   Minute to run (0-59). Default: 0
#   --uninstall  Remove the LaunchAgent and exit.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"
BACKUP_SCRIPT="$REPO_ROOT/scripts/backup.sh"

LABEL="in.kalenjin.backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BACKUP_ROOT="${KALENJIN_BACKUP_DIR:-$HOME/kalenjin-backups}"
LOG_DIR="$BACKUP_ROOT/logs"

HOUR=3
MINUTE=0
UNINSTALL=0
while [[ $# -gt 0 ]]; do
	case "$1" in
		--hour) HOUR="$2"; shift 2 ;;
		--minute) MINUTE="$2"; shift 2 ;;
		--uninstall) UNINSTALL=1; shift ;;
		-h | --help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		*) echo "Unknown option: $1" >&2; exit 1 ;;
	esac
done

if [[ "$UNINSTALL" -eq 1 ]]; then
	launchctl unload -w "$PLIST" 2>/dev/null || true
	rm -f "$PLIST"
	echo "Removed $PLIST"
	exit 0
fi

[[ -f "$BACKUP_SCRIPT" ]] || { echo "ERROR: $BACKUP_SCRIPT not found." >&2; exit 1; }
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

# launchd jobs get a minimal PATH; add Homebrew + standard dirs so ssh/rsync/
# shasum and (for safety) any pg tools resolve. The backup itself only needs
# ssh, rsync, gzip and shasum locally — pg_dump runs on the server.
JOB_PATH="/opt/homebrew/opt/postgresql@16/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>$LABEL</string>
	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>$BACKUP_SCRIPT</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>$JOB_PATH</string>
		<key>HOME</key>
		<string>$HOME</string>
		<key>KALENJIN_BACKUP_DIR</key>
		<string>$BACKUP_ROOT</string>
	</dict>
	<key>StartCalendarInterval</key>
	<dict>
		<key>Hour</key>
		<integer>$HOUR</integer>
		<key>Minute</key>
		<integer>$MINUTE</integer>
	</dict>
	<key>RunAtLoad</key>
	<false/>
	<key>StandardOutPath</key>
	<string>$LOG_DIR/backup.out.log</string>
	<key>StandardErrorPath</key>
	<string>$LOG_DIR/backup.err.log</string>
</dict>
</plist>
PLIST_EOF

# Reload so changes take effect.
launchctl unload -w "$PLIST" 2>/dev/null || true
launchctl load -w "$PLIST"

printf 'Installed LaunchAgent: %s\n' "$PLIST"
printf 'Schedule            : daily at %02d:%02d (runs on wake if missed)\n' "$HOUR" "$MINUTE"
printf 'Logs                : %s/backup.{out,err}.log\n' "$LOG_DIR"
echo
echo "Test it now with:"
echo "    launchctl start $LABEL    # then watch $LOG_DIR/backup.out.log"
echo
echo "NOTE: backups need passwordless SSH to the prod box. If you haven't yet:"
echo "    ssh-copy-id \"\$(grep ^PROD_SSH_TARGET .env | cut -d= -f2- | tr -d '\"')\""
echo "and add your key to the agent/keychain so launchd can use it:"
echo "    ssh-add --apple-use-keychain ~/.ssh/id_ed25519"
