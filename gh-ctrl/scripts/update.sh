#!/usr/bin/env bash
# Vibe & Conquer — Docker Update Script
#
# Pulls the latest code from origin/main, rebuilds the Docker image,
# and restarts services via Docker Compose.
#
# ── Usage ──────────────────────────────────────────────────────────────────────
#
#   Manual (run on the VPS host):
#     cd /path/to/vibe-and-conquer && ./gh-ctrl/scripts/update.sh
#
#   In-app "Install Update" button (triggered via the backend inside the container):
#     Requires the following volumes in compose.yml (see compose.yml):
#       - /var/run/docker.sock:/var/run/docker.sock
#       - .:/workspace
#
# ── Prerequisites ───────────────────────────────────────────────────────────────
#   docker (compose v2 plugin)  •  git  •  curl (for backup, optional)
# ───────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Resolve project root ───────────────────────────────────────────────────────
# Inside the container the host project root is mounted at /workspace.
# When run on the host directly, derive the root from this script's location.
if [ -f "/workspace/compose.yml" ]; then
  PROJECT_ROOT="/workspace"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
fi

echo "==> Vibe & Conquer Update Script (Docker)"
echo "==> Project root: $PROJECT_ROOT"
echo ""

cd "$PROJECT_ROOT"

# ── 1. Backup database ─────────────────────────────────────────────────────────
echo "==> Backing up database..."
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
docker compose cp app:/app/data/. "$BACKUP_DIR/" 2>/dev/null \
  && echo "  Backed up to $BACKUP_DIR" \
  || echo "  (skipped — container not running or no data volume yet)"
echo ""

# ── 2. Pull latest source code ─────────────────────────────────────────────────
echo "==> Pulling latest code from origin/main..."
git pull origin main
echo ""

# ── 3. Rebuild and restart via Docker Compose ──────────────────────────────────
echo "==> Rebuilding and restarting services (prod profile)..."
docker compose --profile prod up -d --build
echo ""

# ── 4. Prune stale images ──────────────────────────────────────────────────────
echo "==> Cleaning up old images..."
docker image prune -f
echo ""

echo "==> Update complete!"
echo "==> The container is restarting with the latest build."
echo "==> Monitor logs with: docker compose logs -f app"
