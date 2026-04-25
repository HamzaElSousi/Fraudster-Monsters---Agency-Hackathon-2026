#!/bin/bash
# Start Follow The Money — run from project root in WSL
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Kill anything already on these ports
echo "[0/2] Clearing ports 8000 and 5173..."
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
sleep 1

BACKEND_PID=""

cleanup() {
  echo ""
  echo "[stop] Shutting down..."
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  fuser -k 8000/tcp 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM

echo "[1/2] Starting backend..."
(cd "$PROJECT_ROOT/backend" && python3 main.py) &
BACKEND_PID=$!

# Wait for backend to be healthy (max 30s)
echo "[1/2] Waiting for backend..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "[1/2] Backend ready."
    break
  fi
  sleep 1
done

echo "[2/2] Starting frontend..."
(cd "$PROJECT_ROOT/frontend" && npm run dev)
