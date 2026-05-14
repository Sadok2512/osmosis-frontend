#!/usr/bin/env bash
# Start (or restart) the SPA + reverse-proxy server on :3000.
# Idempotent: kills any prior spa-proxy and respawns clean.
# No sudo. Logs to /tmp/spa-proxy.log.
#
# Architecture: serves ../dist/ (Vite build) + proxies /api/v1/* → :8000
# (osmosis-parser FastAPI), /api/* → :3001 (this repo's index.js).
# See server/spa-proxy.js for full route table.

set -u

# Refuse to run as root. Bug seen 2026-05-14: collaborator's remote SSH
# session (uid=0) spawned spa-proxy as root → port :3000 became unkillable
# without sudo, blocking every subsequent rebuild for any non-root user.
# Always run this script as devmat (`su - devmat` first if needed).
if [ "$(id -u)" -eq 0 ]; then
  echo "ERR: do not run as root — spawns an unkillable :3000 listener." >&2
  echo "     Switch user first:  su - devmat -c 'bash $0'" >&2
  exit 2
fi

PROJ="/home/devmat/bmad-project/qoebit-frontend"
LOG="/tmp/spa-proxy.log"
LOCK="/tmp/spa-proxy-start.lock"

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$(date -u +%FT%TZ) start-frontend.sh: another instance holds the lock — exit" >&2
  exit 0
fi

cd "$PROJ" || { echo "ERR: cannot cd $PROJ"; exit 1; }

# Sanity: dist/ must exist + contain index.html. Build is the user's job;
# we don't auto-build because vite build can take 60+ s and is noisy.
if [ ! -f "dist/index.html" ]; then
  echo "ERR: $PROJ/dist/index.html missing — run 'npm run build' first" >&2
  exit 1
fi

SELF_PID=$$
PARENT_PID=$PPID

# Match only the node process running spa-proxy.js on :3000. Excludes the
# server/index.js (also node, but on :3001).
matches() {
  ps -eo pid,cmd --no-headers \
    | awk -v self="$SELF_PID" -v parent="$PARENT_PID" \
        '$2 ~ /node/ && $0 ~ /spa-proxy\.js/ \
         && $1 != self && $1 != parent { print $1 }'
}

PIDS=$(matches)
if [ -n "$PIDS" ]; then
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null || true
  sleep 2
  # shellcheck disable=SC2086
  kill -9 $PIDS 2>/dev/null || true
fi

# 9<&- closes the lockfile FD in the child so the spawned node does not
# keep the flock alive past this script's exit.
cd server
nohup node spa-proxy.js > "$LOG" 2>&1 9<&- &
NEW_PID=$!

echo "$(date -u +%FT%TZ) start-frontend.sh: pid=$NEW_PID port=3000"
