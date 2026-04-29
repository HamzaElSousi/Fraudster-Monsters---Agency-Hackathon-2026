#!/bin/bash
# docker-rebuild.sh — Fire-and-forget Docker rebuild for Follow The Money
#
# Usage:
#   bash docker-rebuild.sh              # rebuild both services, keep DuckDB volume
#   bash docker-rebuild.sh frontend     # frontend only (~30s, no DuckDB re-copy)
#   bash docker-rebuild.sh backend      # backend only
#   bash docker-rebuild.sh clean        # nuke DuckDB cache too — first start takes ~2 min
#   bash docker-rebuild.sh -d           # detached mode — returns terminal, polls health
#   bash docker-rebuild.sh frontend -d  # combine target + detached
#
# Any argument order works: "bash docker-rebuild.sh -d frontend" also valid.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# ── Parse arguments ─────────────────────────────────────────────────────────
TARGET="both"
DETACH=false
for arg in "$@"; do
  case "$arg" in
    frontend|backend|clean) TARGET="$arg" ;;
    -d|--detach|--detached) DETACH=true ;;
    -h|--help)
      sed -n '/^# Usage:/,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0 ;;
    *) echo "⚠  Unknown argument: $arg (ignored)" ;;
  esac
done

# ── Pretty header ────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Follow The Money — Docker Rebuild              ║"
printf "║   Target: %-10s  Mode: %-16s  ║\n" "$TARGET" "$([ "$DETACH" = true ] && echo 'detached' || echo 'attached')"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. Preflight checks ──────────────────────────────────────────────────────
echo "[preflight] Checking Docker..."

# Check Docker daemon
if ! docker info > /dev/null 2>&1; then
  echo ""
  echo "  ✗ Docker daemon is not running."
  echo "  → On Windows: open Docker Desktop and wait for it to say 'Engine running'"
  echo "  → On Linux/WSL: sudo systemctl start docker"
  echo ""
  exit 1
fi
echo "  ✓ Docker daemon running"

# Detect compose command (v2 plugin vs legacy standalone)
if docker compose version > /dev/null 2>&1; then
  DC="docker compose"
elif docker-compose version > /dev/null 2>&1; then
  DC="docker-compose"
else
  echo ""
  echo "  ✗ Neither 'docker compose' (v2) nor 'docker-compose' (v1) found."
  echo "  → Install Docker Desktop or run: pip install docker-compose"
  echo ""
  exit 1
fi
echo "  ✓ Compose command: $DC"

# Check data/hackathon.duckdb exists (needed for entrypoint.sh to copy into volume)
if [ ! -f "data/hackathon.duckdb" ]; then
  echo ""
  echo "  ⚠  data/hackathon.duckdb not found."
  echo "  → Download the data folder from the shared Google Drive link in README.md"
  echo "  → Without it the backend container will start but return empty data"
  echo ""
  # Continue anyway — don't block the build
fi

# ── 2. Kill WSL-side zombie processes on ports 8000 + 3000 ──────────────────
echo ""
echo "[1/3] Clearing WSL-side port zombies..."
for port in 8000 3000 5173; do
  pids=$(lsof -t -i:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "  Killing PID(s) $pids on port $port..."
    kill -9 $pids 2>/dev/null || true
  fi
done
pkill -9 -f "uvicorn main:app" 2>/dev/null || true
pkill -9 -f "vite"            2>/dev/null || true

# Check if ports are still held (likely by Docker Desktop Windows proxy — root owned)
for port in 8000 3000; do
  if ss -tulnp 2>/dev/null | grep -q ":$port "; then
    echo "  ⚠  Port $port still held after kill attempt."
    echo "     This is usually Docker Desktop's Windows-side proxy (a root process)."
    echo "     Fix: restart Docker Desktop on Windows, then re-run this script."
  fi
done
echo "  ✓ Port cleanup done"

# ── 3. Stop containers ───────────────────────────────────────────────────────
echo ""
echo "[2/3] Stopping existing containers..."
if [ "$TARGET" = "clean" ]; then
  echo "  ⚠  CLEAN mode — removing DuckDB cache volume. First start will take ~2 min."
  $DC down -v 2>/dev/null || true
else
  $DC down 2>/dev/null || true
fi
echo "  ✓ Containers stopped"

# ── 4. Build ─────────────────────────────────────────────────────────────────
echo ""
echo "[3/3] Building images (no cache)..."
case "$TARGET" in
  frontend)
    $DC build --no-cache frontend
    ;;
  backend)
    $DC build --no-cache backend
    ;;
  clean|both|*)
    $DC build --no-cache
    ;;
esac
echo "  ✓ Build complete"

# ── 5. Start ─────────────────────────────────────────────────────────────────
echo ""
if [ "$DETACH" = true ]; then
  echo "[start] Starting in detached mode..."
  $DC up -d
  echo ""
  echo "  Containers started. Waiting for backend health check (max 120s)..."
  for i in $(seq 1 24); do
    if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
      echo ""
      echo "  ✓ Backend healthy!"
      break
    fi
    printf "  ·"
    sleep 5
    if [ "$i" = "24" ]; then
      echo ""
      echo "  ⚠  Backend did not respond after 120s."
      echo "     Check logs: $DC logs backend"
    fi
  done
  echo ""
  echo "  ┌─────────────────────────────────────────┐"
  echo "  │  Frontend  →  http://localhost:3000      │"
  echo "  │  Backend   →  http://localhost:8000      │"
  echo "  │  API docs  →  http://localhost:8000/docs │"
  echo "  └─────────────────────────────────────────┘"
  echo ""
  echo "  Logs: $DC logs -f"
  echo "  Stop: $DC down"
else
  echo "[start] Starting (attached — Ctrl+C to stop)..."
  echo ""
  $DC up
fi
