#!/bin/bash
# Start Follow The Money — run from project root in WSL
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Kill anything already on these ports
echo "[0/2] Clearing ports 8000 and 5173..."
for port in 8000 5173; do
  # Try fuser (works for same-user processes)
  fuser -k $port/tcp 2>/dev/null || true
  # Try lsof (also same-user)
  pids=$(lsof -t -i:$port 2>/dev/null)
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  # If still held (e.g. by a root Docker process), try sudo kill
  pids=$(sudo lsof -t -i:$port 2>/dev/null)
  [ -n "$pids" ] && sudo kill -9 $pids 2>/dev/null || true
done
# Also kill any stale uvicorn/main.py processes by name
pkill -f "uvicorn main:app" 2>/dev/null || true
sudo pkill -f "uvicorn main:app" 2>/dev/null || true

# Wait for ports to actually be free
for port in 8000 5173; do
  for i in $(seq 1 30); do
    if ! ss -tulnp 2>/dev/null | grep -q ":$port "; then
      break
    fi
    sleep 0.2
  done
done

BACKEND_PID=""

cleanup() {
  echo ""
  echo "[stop] Shutting down..."
  # Kill the whole process group to catch uvicorn child processes
  [ -n "$BACKEND_PID" ] && kill -- -"$BACKEND_PID" 2>/dev/null || kill "$BACKEND_PID" 2>/dev/null
  fuser -k 8000/tcp 2>/dev/null || true
  pkill -f "uvicorn main:app" 2>/dev/null || true
  exit 0
}
trap cleanup EXIT INT TERM

echo "[1/2] Starting backend..."
(cd "$PROJECT_ROOT/backend" && python3 main.py) &
BACKEND_PID=$!

# Wait for backend to be healthy (max 30s)
# Try port 8000 first, then fall back to 8001 if zombie socket is present
BACKEND_PORT=8000
echo "[1/2] Waiting for backend..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "[1/2] Backend ready on port 8000."
    BACKEND_PORT=8000
    break
  elif curl -sf http://localhost:8001/api/health > /dev/null 2>&1; then
    echo "[1/2] Backend ready on port 8001 (8000 was held by zombie socket)."
    BACKEND_PORT=8001
    break
  fi
  sleep 1
done

# Update frontend API URL if needed
if [ "$BACKEND_PORT" != "8000" ]; then
  export VITE_API_URL="http://localhost:$BACKEND_PORT"
  echo "[1/2] Frontend will use VITE_API_URL=$VITE_API_URL"
fi

echo "[2/2] Starting frontend..."
(cd "$PROJECT_ROOT/frontend" && npm run dev)
