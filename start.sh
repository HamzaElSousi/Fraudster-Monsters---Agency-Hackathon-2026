#!/bin/bash
# Start Follow The Money — run from project root in WSL
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[1/2] Starting backend..."
(cd "$PROJECT_ROOT/backend" && python3 main.py) &
BACKEND_PID=$!

echo "[2/2] Starting frontend..."
(cd "$PROJECT_ROOT/frontend" && npm run dev)

# If frontend exits, kill backend
kill $BACKEND_PID 2>/dev/null
