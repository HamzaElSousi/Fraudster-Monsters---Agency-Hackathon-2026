#!/bin/bash
# Copy pre-built hackathon.duckdb to writable cache on first Docker start.
# This avoids file-lock conflicts with any local start.sh process that may
# already have the data/hackathon.duckdb file open.
CACHE=/app/duckdb_cache/hackathon.duckdb
SOURCE=/data/hackathon.duckdb

if [ ! -f "$CACHE" ]; then
    if [ -f "$SOURCE" ]; then
        echo "[entrypoint] Copying pre-built hackathon.duckdb to writable cache..."
        cp "$SOURCE" "$CACHE"
        echo "[entrypoint] Done ($(du -sh $CACHE | cut -f1))."
    else
        echo "[entrypoint] No pre-built hackathon.duckdb found — will build from JSONL on first request."
    fi
else
    echo "[entrypoint] Using existing hackathon.duckdb in cache."
fi

exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
