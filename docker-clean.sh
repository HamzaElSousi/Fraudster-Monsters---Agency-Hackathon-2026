#!/bin/bash
# Clean rebuild — tears down everything including the DuckDB volume, rebuilds from scratch
# WARNING: DuckDB preload will re-run (~2 min) after this
set -e
echo "Tearing down containers and volumes..."
docker compose down -v
echo "Building fresh images (no cache)..."
docker compose build --no-cache
echo "Starting..."
docker compose up
