#!/bin/bash
# docker-rebuild.sh — Fast targeted rebuild
# Usage:
#   bash docker-rebuild.sh           → rebuild both services (keeps DuckDB volume)
#   bash docker-rebuild.sh frontend  → rebuild frontend only (fastest, ~30s)
#   bash docker-rebuild.sh backend   → rebuild backend only
#   bash docker-rebuild.sh clean     → nuke everything including DuckDB cache (~2 min first run)

set -e
cd "$(dirname "${BASH_SOURCE[0]}")"

TARGET="${1:-both}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Follow The Money — Docker Rebuild      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Stop running containers (keep volumes unless --clean)
echo "[1/3] Stopping containers..."
docker compose down 2>/dev/null || true

if [ "$TARGET" = "clean" ]; then
  echo "      ⚠  CLEAN mode — removing DuckDB cache volume (first start will take ~2 min)"
  docker compose down -v 2>/dev/null || true
fi

# Build
echo "[2/3] Building images (no cache)..."
case "$TARGET" in
  frontend)
    docker compose build --no-cache frontend
    ;;
  backend)
    docker compose build --no-cache backend
    ;;
  clean|both|*)
    docker compose build --no-cache
    ;;
esac

# Start
echo "[3/3] Starting..."
echo ""
docker compose up
