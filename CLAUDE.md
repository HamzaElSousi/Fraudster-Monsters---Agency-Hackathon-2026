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
# Both at once (recommended)
bash start.sh

# Or individually:
cd backend && python3 main.py          # port 8000
cd frontend && npm run dev             # port 5173

# Docker (not tested end-to-end but should work):
docker compose up --build
```

If frontend shows blank screen: clear browser cache or use `window.location.href = 'http://localhost:5173/?nocache=' + Date.now()`

---

## Challenges implemented

| # | Name | Page | Status |
|---|------|------|--------|
| 1 | Zombie Recipients | `/zombies` | ✅ Working (table + loop crossref tab) |
| 3 | Funding Loops | `/loops` | ✅ Working (graph + table + MoneyTrace + classification filter) |
| 4 | Sole Source & Amendment Creep | `/sole-source` | ✅ Working |
| 6 | Governance Networks | `/governance` | ✅ Working (self-dealing toggle) |
| Multi | Cross-challenge Alerts | `/alerts` | ✅ Working |
| AI | Ask AI Chat | `/chat` | ✅ Working |
| Deep | Entity Case File | `/entity/:bn` | ✅ Working (flags, funding chart, loop table, AI narrative) |

---

## Data sources

- `cra/` — CRA T3010 charity filings (govt_funding_by_charity, cra_identification, cra_directors, loops, loop_charity_financials, loop_participants, identified_hubs, etc.)
- `fed/` — Federal grants & contributions (grants_contributions.jsonl)
- `ab/` — Alberta open data (ab_sole_source.jsonl)

Key preloaded tables (in `_PRELOAD_TABLES`):
- `cra__loops`, `cra__loop_charity_financials`, `cra__loop_financials`, `cra__loop_participants`
- `cra__loop_edges`, `cra__loop_edge_year_flows`, `cra__identified_hubs`, `cra__scc_summary`
- `cra__govt_funding_by_charity`, `cra__cra_identification`, `cra__cra_directors`
- `ab__ab_sole_source`

---

## API endpoints

```
GET  /api/stats
GET  /api/zombies?min_funding=100000&limit=50
GET  /api/zombies/loop-crossref?min_funding=100000&limit=50
GET  /api/loops?min_hops=2&max_hops=6&min_flow=0&max_flow=0&same_year_only=false&risk_level=&classification=&limit=200
GET  /api/loops/stats          — enriched: phantom_receipts_total, high_alert_count, suspicious_count
GET  /api/loops/charities?limit=50
GET  /api/loops/detail/{loop_id}   — participants + timeline
GET  /api/loops/graph?limit=25
GET  /api/governance?min_boards=3&limit=50
GET  /api/governance/self-dealing?min_boards=2&limit=50
GET  /api/alerts?min_flags=2&limit=20
GET  /api/sole-source?min_ratio=3&limit=50
GET  /api/entity/{bn}          — full case file: flags, funding history, loops, narrative
GET  /api/dashboard/featured   — top 5 high-risk entities
GET  /api/search?q=...         — global full-text search
GET  /api/health
POST /api/chat  (body: {message: string})
```

**Query param bounds enforced** (FastAPI `Query` validators): `min_hops` 2–20, `max_hops` 2–20, `limit` 1–500, `risk_level` max 20 chars, `classification` max 50 chars.

---

## Key files

| File | Purpose |
|------|---------|
| `backend/db_duckdb.py` | All DuckDB queries — get_zombies_live, get_loops_enriched_live, get_loop_graph_live, get_loop_detail_live, get_governance_live, get_self_dealing_directors_live, get_sole_source_live, get_alerts_live, get_stats_live, get_entity_case_file_live, get_dashboard_featured_cases_live, get_zombie_loop_crossref_live |
| `backend/main.py` | FastAPI routes + LLM chat logic + Query validators |
| `frontend/src/api.js` | All fetch functions — uses `import.meta.env.VITE_API_URL \|\| 'http://localhost:8000'` |
| `frontend/src/App.jsx` | Router + sidebar with live alert count badge; includes `/entity/:bn` route |
| `frontend/src/pages/FundingLoops.jsx` | Graph (ECharts force) + table view + MoneyTrace expand + classification filter + suspicion tooltip |
| `frontend/src/pages/Zombies.jsx` | Table with search + risk filter + loop crossref tab |
| `frontend/src/pages/Governance.jsx` | Director cards with expand + self-dealing toggle |
| `frontend/src/pages/EntityCaseFile.jsx` | Single-org deep dive: red flags, ECharts funding chart, loop table, AI narrative |
| `frontend/src/pages/Dashboard.jsx` | Executive briefing hero + Kill Shot card + featured cases + phantom receipts stat |
| `frontend/src/pages/Alerts.jsx` | Multi-flag alert cards |
| `frontend/src/pages/Chat.jsx` | AI chat with inline DataCard expansion |
| `frontend/src/index.css` | All CSS variables + component styles |

---

## Suspicion scoring (funding loops)

Each loop gets a score 0–8:

| Condition | Points |
|-----------|--------|
| Same fiscal year (same_year = true) | +3 |
| Avg circular outflow > 30% of revenue | +2 |
| Avg program spending < 40% of expenditures | +2 |
| Short loop (hops ≤ 3) AND no identified hub | +1 |
| Any participant is an identified hub org | −3 |

Classification: `score >= 6` → High Alert 🔴 · `score >= 3` → Suspicious 🟡 · `score < 3` → Normal ✅

**Phantom receipts**: `total_flow × hops` for same-year loops — upper-bound estimate of tax receipt inflation if every hop issued a charitable receipt.

---

## Critical bugs fixed (history)

1. **`process.env` crash** — Vite uses `import.meta.env.VITE_*`. Fixed in `api.js`.
2. **Graph nodes invisible** — `get_loop_graph_live` SQL now selects `bn as id`; frontend filters links to existing node set.
3. **Table view empty** — `fetchLoops` returns `{results:[...]}`. Fixed: `d.results ?? d.loops ?? []`.
4. **Alerts page blank** — `STRING_SPLIT(path_bns, ',')` on DuckDB LIST type. Rewritten as Python 4-step join.
5. **Alerts duplicates** — deduplicate by `bn[:9]` in `get_alerts_live`.
6. **Graph zoom glitch** — `hasZoomedRef` flag fires `zoomToFit` only once on initial load.
7. **Governance positions overflow** — truncate positions list to first 3 + count.
8. **Thread safety** — `_table_lock`, `_cache_lock`, `CREATE TABLE IF NOT EXISTS`.
9. **Dashboard featured empty** — API returns plain array, not `{results:[]}`. Fixed: `Array.isArray(d) ? d : d.results || []`.
10. **FundingLoops 422 error** — `fetchLoops` (7-param) called with 8 args → `limit=''`. Fixed: use `fetchLoopsEnriched` (8-param including `classification`).
11. **SQL injection** — `risk_level` filter whitelisted to `{high, medium, low}`; BN list sanitized with regex before SQL interpolation.
12. **DualRangeSlider invisible fill** — Added custom fill div with `left%`/`width%` computed from values; native track made transparent via `::-webkit-slider-runnable-track`.

---

## Known issues / what to improve next

- Chat: AI responses are slow without Bedrock configured (`ai_enabled: false` in health check → template responses)
- Alerts: sole_source flag not yet cross-referenced
- Challenges not yet implemented: #2 Receipt Inflation, #8 Grant Stacking, #9 Threshold Gaming
- Docker not yet tested end-to-end (files exist, not run)
- Phantom receipt formula (`flow × hops`) is an upper-bound heuristic — label it as estimated when presenting to judges

---

## Important DuckDB gotchas

- DuckDB is single-writer: only one process can write at a time. Backend holds the lock — don't run concurrent test processes against the same `.duckdb` file.
- `path_bns` is a DuckDB LIST type. Use `UNNEST(path_bns)` not `STRING_SPLIT(path_bns, ',')`.
- `QUALIFY ROW_NUMBER() OVER (...)` works in DuckDB but not combined with JOINs in some versions — use CTE + `WHERE rn = 1` instead.
- `TRY_CAST(x AS DOUBLE)` instead of plain CAST to avoid crashes on null/empty strings.
- Cache TTL is 10 minutes. To bust cache during dev, restart backend.
- `re` module (stdlib) used in `db_duckdb.py` for BN sanitization — no pip install needed.

---

## Hackathon context

- Event: Agency 2026, Ottawa, April 29 2026
- Code freeze: 2PM
- Judging criteria: impact of finding, technical depth, AI integration, presentation
- Goal: demonstrate AI-powered accountability for $89.4B in tracked public funding
- Key narrative: 347 zombie recipients, 5,808 funding loops, 2,841 multi-board directors
- Data provenance: CRA T3010 filings, Federal Proactive Disclosure (51+ departments), Alberta Open Data — all public records
