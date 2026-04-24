# Follow The Money — AI Accountability Dashboard
## Agency 2026 Ottawa Hackathon · April 29, 2026 · Code freeze 2PM

---

## Stack

- **Backend**: FastAPI + DuckDB (embedded, queries JSONL directly, no PostgreSQL needed)
- **Frontend**: React + Vite (NOT create-react-app — use `import.meta.env.VITE_*` NOT `process.env.REACT_APP_*`)
- **AI**: AWS Bedrock Converse API (primary on event day) + Anthropic SDK fallback
- **Data**: 10GB JSONL files at `/mnt/c/Users/Hamza/Desktop/Current Project/AI Accountability Hackathon/data/`
- **DuckDB file**: `data/hackathon.duckdb` — auto-created on first run, preloads JSONL tables into persistent tables (~2min first run, instant after)

## How to run

```bash
# Backend (port 8000)
cd backend && python3 main.py

# Frontend (port 5173)
cd frontend && npm run dev
```

If frontend shows blank screen: clear browser cache (`Ctrl+Shift+R` doesn't always work — use JS `window.location.href = 'http://localhost:5173/?nocache=' + Date.now()`)

---

## Challenges implemented

| # | Name | Page | Status |
|---|------|------|--------|
| 1 | Zombie Recipients | `/zombies` | ✅ Working |
| 3 | Funding Loops | `/loops` | ✅ Working (graph + table view) |
| 4 | Sole Source & Amendment Creep | `/sole-source` | ✅ Working |
| 6 | Governance Networks | `/governance` | ✅ Working |
| Multi | Cross-challenge Alerts | `/alerts` | ✅ Working |
| AI | Ask AI Chat | `/chat` | ✅ Working |

---

## Data sources

- `cra/` — CRA T3010 charity filings (govt_funding_by_charity, cra_identification, cra_directors, loops, loop_charity_financials, etc.)
- `fed/` — Federal grants & contributions (grants_contributions.jsonl)
- `ab/` — Alberta open data (ab_sole_source.jsonl)

Key preloaded tables (in `_PRELOAD_TABLES`):
- `cra__loops`, `cra__loop_charity_financials`, `ab__ab_sole_source`
- `cra__govt_funding_by_charity`, `cra__cra_identification`, `cra__cra_directors`
- `fed__grants_contributions`

---

## Critical bugs fixed (history)

1. **`process.env` crash** — Vite uses `import.meta.env.VITE_*` not `process.env.REACT_APP_*`. Fixed in `frontend/src/api.js`.
2. **Graph nodes invisible** — ForceGraph2D needs `id` field on nodes matching link `source`/`target`. Fixed: `get_loop_graph_live` SQL now selects `bn as id`; frontend maps `n => ({...n, id: n.bn || n.id})`.
3. **Table view empty** — `fetchLoops` returns `{results:[...]}` not `{loops:[...]}`. Fixed: `lData?.results ?? lData?.loops ?? []`.
4. **Alerts page blank** — `get_alerts_live` used `STRING_SPLIT(path_bns, ',')` on DuckDB LIST type + broken QUALIFY. Rewritten as Python 4-step join.
5. **Alerts duplicates** — Same org (e.g. Salvation Army) has multiple BN numbers. Fixed: deduplicate by `bn[:9]` in `get_alerts_live`.
6. **Graph zoom glitch** — `zoomToFit` fired on every engine stop including after node clicks. Fixed: `hasZoomedRef` flag fires it only once on initial load.
7. **Governance positions overflow** — DuckDB LIST of all positions filled the card. Fixed: truncate to first 3 + count.
8. **Thread safety** — `_ensure_table` and `_cache` had race conditions. Fixed: `_table_lock`, `_cache_lock`, `CREATE TABLE IF NOT EXISTS`.

---

## Known issues / what to improve next

- Governance: positions still verbose if director has many different titles (data quality issue)
- Graph: nodes for BNs not in `loop_charity_financials` are stub nodes (just show BN number, no name)
- Chat: AI responses are slow without Bedrock configured; `ai_enabled: false` in health check means it uses template responses
- Alerts: only shows zombie+loop+governance flags; sole_source flag not yet cross-referenced
- Challenges not yet implemented: #2 Receipt Inflation, #8 Grant Stacking, #9 Threshold Gaming

---

## API endpoints

```
GET /api/stats
GET /api/zombies?min_funding=100000&limit=50
GET /api/loops?min_hops=2&max_hops=6&limit=100
GET /api/loops/graph?limit=30
GET /api/governance?min_boards=3&limit=50
GET /api/sole-source?min_ratio=3&limit=50
GET /api/alerts?min_flags=2&limit=20
GET /api/chat  (POST, body: {message: string})
GET /api/health
```

---

## Key files

| File | Purpose |
|------|---------|
| `backend/db_duckdb.py` | All DuckDB queries — get_zombies_live, get_loops_live, get_loop_graph_live, get_governance_live, get_sole_source_live, get_alerts_live, get_stats_live |
| `backend/main.py` | FastAPI routes + LLM chat logic |
| `frontend/src/api.js` | All fetch functions — uses `import.meta.env.VITE_API_URL \|\| 'http://localhost:8000'` |
| `frontend/src/App.jsx` | Router + sidebar with live alert count badge |
| `frontend/src/pages/FundingLoops.jsx` | Graph (ForceGraph2D) + table view, ~730 lines |
| `frontend/src/pages/Zombies.jsx` | Table with search + risk filter |
| `frontend/src/pages/Governance.jsx` | Director cards with expand |
| `frontend/src/pages/Alerts.jsx` | Multi-flag alert cards |
| `frontend/src/pages/Chat.jsx` | AI chat with inline DataCard expansion |
| `frontend/src/index.css` | All CSS variables + component styles |

---

## Important DuckDB gotchas

- DuckDB is single-writer: only one process can write at a time. Backend holds the lock — don't run tests that open the same `.duckdb` file concurrently.
- `path_bns` is a DuckDB LIST type (not a string). Use `UNNEST(path_bns)` not `STRING_SPLIT(path_bns, ',')`.
- `QUALIFY ROW_NUMBER() OVER (...)` works in DuckDB but not when combined with JOINs in some versions — use CTE + `WHERE rn = 1` instead.
- `TRY_CAST(x AS DOUBLE)` instead of plain CAST to avoid crashes on null/empty strings.
- Cache TTL is 10 minutes. To bust cache during dev, restart backend.

---

## Hackathon context

- Event: Agency 2026, Ottawa, April 29 2026
- Code freeze: 2PM
- Judging criteria: impact of finding, technical depth, AI integration, presentation
- Goal: demonstrate AI-powered accountability for $89.4B in tracked public funding
- Key narrative: 347 zombie recipients, 5,808 funding loops, 2,841 multi-board directors
