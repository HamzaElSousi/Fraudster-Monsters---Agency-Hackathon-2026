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
bash start.sh          # kills ports 8000 + 5173, starts both, waits for health check

# Or individually:
cd backend && python3 main.py    # port 8000
cd frontend && npm run dev       # port 5173
```

**After any backend code change, restart the backend** — stats are cached 10 min under key `"stats"`.

If frontend shows blank screen: `window.location.href = 'http://localhost:5173/?nocache=' + Date.now()`

---

## Challenges implemented

| # | Name | Page | Status |
|---|------|------|--------|
| 1 | Zombie Recipients | `/zombies` | ✅ Working (table + loop crossref tab) |
| 3 | Funding Loops | `/loops` | ✅ Working (table + MoneyTrace + classification filter) |
| 4 | Sole Source & Amendment Creep | `/sole-source` | ✅ Working |
| 6 | Governance Networks | `/governance` | ✅ Working (self-dealing toggle) |
| Multi | Cross-challenge Alerts | `/alerts` | ✅ Working |
| AI | Ask AI Chat | `/chat` | ✅ Working |
| Deep | Entity Case File | `/entity/:bn` | ✅ Working (flags, funding chart, loop table, AI narrative) |

**PostgreSQL**: Shared Render.com DB connected (89 tables) — same data as DuckDB, provides dual-verification badge in sidebar

---

## Live stat values (as of last audit)

| Stat | Value | Source |
|------|-------|--------|
| Registered charities | 91,129 | `COUNT(DISTINCT bn)` from `cra_identification` |
| Govt-funded charities | 45,933 | `COUNT(DISTINCT bn)` from `govt_funding_by_charity WHERE total_govt > 0` |
| Zombie recipients | 219 | govt_share ≥ 70%, min $100K, stopped filing by 2022 |
| Funding loops | 5,808 | `COUNT(*)` from `cra__loops` |
| Multi-board directors headline stat | computed | name-match, 5+ distinct BN roots, govt-funded charities only (stat); governance page browses at 3+ |
| Federal grant records | 1,275,521 | `COUNT(*)` from `fed__grants_contributions` |
| AB sole-source records | 15,533 | `COUNT(*)` from `ab__ab_sole_source` (real data, not hardcoded) |
| AB contract value | $18.2B | `SUM(amount)` from `ab__ab_sole_source` (real data, not hardcoded) |
| At-risk funding | $482M | peak-year govt funding of zombie charities |

**Hero text** = "We mapped N charities, M grant records, K procurement contracts" — no dollar figure in hero because `total_public_funding` ($300B = SUM of peak annual year per charity) is not a coherent single pool and would mislead judges.

---

## Known issues / next improvements

### Filter/graph problems (RESOLVED)
- ~~Loop filters do not visibly change the graph~~ → **FIXED**: graph computed client-side via `useMemo` from filtered `loopsData`
- ~~Network graph has repeated/duplicate nodes~~ → **FIXED**: all BNs normalized to 9-char before building nodes
- ~~Classification filter "Suspicious" tab sent `high_alert,suspicious` multi-value~~ → **FIXED**: tab removed; backend now handles comma-separated OR logic
- Risk level filter and classification filter stacking without indicator — cosmetic only, both work correctly

### Data gaps
- Chat: AI responses are template-only without Bedrock (`ai_enabled: false` in health check)
- Alerts: `sole_source` flag not cross-referenced yet
- Challenges not implemented: #2 Receipt Inflation, #8 Grant Stacking, #9 Threshold Gaming
- `multi_board_directors` uses name-only matching — common names (e.g. "John Smith") across different people inflate count; no position/province disambiguation

### Presentation depth
- ~~Entity case file lacks zombie flag~~ → **FIXED**: zombie banner added (govt_share ≥ 70%, last_year ≤ 2022, total_govt ≥ $100K)
- No year-over-year trend line for funding history
- Loop timeline chart (from `fetchLoopDetail`) exists in backend but unused in expanded row
- `multi_board_directors` sidebar badge shows 37,481 (name-only match) while governance page uses stricter filter yielding ~2,841; cosmetic inconsistency only

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
GET  /api/loops/graph?limit=25     — NOT filter-aware; cached independently
GET  /api/governance?min_boards=3&limit=50
GET  /api/governance/self-dealing?min_boards=2&limit=50
GET  /api/alerts?min_flags=2&limit=20
GET  /api/sole-source?min_ratio=3&limit=50
GET  /api/entity/{bn}          — full case file (uses LEFT(bn,9) matching across all tables)
GET  /api/dashboard/featured   — top 5 high-risk entities
GET  /api/search?q=...
GET  /api/health
POST /api/chat  (body: {message: string})
```

**Query param bounds** (FastAPI `Query` validators): `min_hops` 2–20, `max_hops` 2–20, `limit` 1–500, `risk_level` max 20 chars, `classification` max 50 chars.

---

## Key files

| File | Purpose |
|------|---------|
| `backend/db_duckdb.py` | All DuckDB queries — all `get_*_live` functions |
| `backend/main.py` | FastAPI routes + LLM chat logic + Query validators |
| `frontend/src/api.js` | All fetch functions — uses `import.meta.env.VITE_API_URL \|\| 'http://localhost:8000'` |
| `frontend/src/App.jsx` | Router + sidebar with live alert count badge; `/entity/:bn` route |
| `frontend/src/pages/FundingLoops.jsx` | Table + MoneyTrace expand + classification filter + suspicion tooltip |
| `frontend/src/pages/Zombies.jsx` | Table + loop crossref tab |
| `frontend/src/pages/Governance.jsx` | Director cards + self-dealing toggle |
| `frontend/src/pages/EntityCaseFile.jsx` | Deep dive: flags, ECharts funding chart, loop table, AI narrative |
| `frontend/src/pages/Dashboard.jsx` | Hero + Kill Shot card + featured cases |
| `frontend/src/pages/Alerts.jsx` | Multi-flag alert cards |
| `frontend/src/pages/Chat.jsx` | AI chat |
| `frontend/src/index.css` | All CSS variables + component styles |

---

## Suspicion scoring (funding loops)

| Condition | Points |
|-----------|--------|
| Same fiscal year (same_year = true) | +3 |
| Avg circular outflow > 30% of revenue | +2 |
| Avg program spending < 40% of expenditures | +2 |
| Short loop (hops ≤ 3) AND no identified hub | +1 |
| Any participant is an identified hub org | −3 |

Classification: `score >= 6` → High Alert 🔴 · `score >= 3` → Suspicious 🟡 · `score < 3` → Normal

**Phantom receipts**: `total_flow × hops` for same-year loops — upper-bound estimate, labelled as such in UI.

---

## Bug history (all fixed)

1. `process.env` crash → `import.meta.env.VITE_*`
2. Graph nodes invisible → `bn as id` in SQL; frontend filters links to node set
3. Table view empty → `d.results ?? d.loops ?? []`
4. Alerts page blank → `STRING_SPLIT` on DuckDB LIST; rewritten as Python join
5. Alerts duplicates → deduplicate by `bn[:9]`
6. Graph zoom glitch → `hasZoomedRef` fires `zoomToFit` once only
7. Governance positions overflow → truncate to first 3
8. Thread safety → `_table_lock`, `_cache_lock`, `CREATE TABLE IF NOT EXISTS`
9. Dashboard featured empty → `Array.isArray(d) ? d : d.results || []`
10. FundingLoops 422 → switched to `fetchLoopsEnriched` (8-param)
11. SQL injection → `risk_level` whitelisted; BN list regex-sanitized
12. DualRangeSlider no fill → custom track div with `left%`/`width%`; native track transparent
13. Entity case file no flags → BN format mismatch; all loop table queries use `LEFT(bn,9)`
14. Stats zombie count inflated → added `govt_share >= 70%` + `min $100K` to match zombies page
15. `multi_board_directors` 37,481→~2,841 → added `!= ''` and `LENGTH > 1` filters to match governance page
16. Hero `$300B` misleading → removed dollar total from hero; replaced with verifiable record counts
17. Dashboard stat duplicates → `total_ab_grants`/`total_sole_source` (same count) distinguished via dollar value for AB card; `total_entities` changed from `charity+sole` to funded-charities-only
18. Alerts governance flag definition wrong → `get_alerts_live` was checking `COUNT(DISTINCT LEFT(bn, 9)) >= 1` (everyone); fixed to `>= 3` to match multi-board director definition
19. Chat.jsx welcome stat calculation mixed incompatible values → fixed to sum only `fedGrants + abGrants` (record counts) instead of adding charities and soleSource counts
20. get_stats_live governance count missing CTE → added director_boards CTE to ensure each (last_name, first_name, bn_root) counted once before grouping
21. Entity case file 910 rows for Salvation Army → `funding_history` had no GROUP BY year; added `GROUP BY fiscal_year` + `SUM()` so multi-program-account orgs aggregate to one row per year
22. Entity case file profile used `LIMIT 1` → grabbed only one program account's revenue/circular_outflow; replaced with two-stage aggregate: `MAX` per BN, then `SUM` across BNs
23. Entity case file circular_outflow_pct = 107% → cumulative outflow vs annual revenue is apples-to-oranges; suppressed ratio when > 1.0 (physically impossible); no false `high_circular_dependency` flag
24. Entity case file loop_count = 717 (sum of lcf.loops_count across 180 accounts) → replaced with `COUNT(DISTINCT loop_id)` from `loop_participants`; Salvation Army now shows 196 distinct loops
25. Alerts zombie false positives (Salvation Army, United Church, Catholic dioceses) → `get_alerts_live` zombie query had no govt dependency threshold; added `govt_share >= 70% AND total_govt >= $100K`; also grouped by 9-char BN root so multi-account orgs use their MOST RECENT filing date
26. FundingLoops graph not updating with filters → graph was fetched once via `/api/loops/graph`; replaced with `useMemo` computing graph client-side from filtered `loopsData` + `charities` — always in sync
27. FundingLoops graph duplicate nodes → mixed 9/15-char BNs; all BNs normalized to `bn.slice(0, 9)` before building nodes and links
28. FundingLoops "Suspicious Loops" tab broken → was setting `classification='high_alert,suspicious'` which backend silently ignored; tab removed; classification buttons at top handle single-value filtering correctly
29. Backend classification filter accepted only single value → updated to parse comma-separated values with `IN (...)` for OR logic
30. Alerts page missing narrative and Investigate button → restored `buildNarrative()` function, always-visible paragraph per card, "Investigate →" button linking to `/entity/:bn`, and "Source: CRA T3010" badge
31. Search click navigation wrong → `handleResultClick` navigated to category pages (e.g., `/zombies`); fixed to navigate to `/entity/${item.bn}` when item has `bn` field
32. Dashboard overcrowded with 8 stat cards + Quick Investigations panel → replaced with 3 focused finding cards (Zombies, Loops, Directors) with real verified stats; removed Quick Investigations panel
33. Entity case file sparse → added 4 new sections: Zombie Status banner, Federal Grants table, Directors table with board counts, Related Entities (loop partners as clickable chips)
34. Sole Source no story → replaced generic header with investigative narrative + top 5 worst cases by total value; fixed hardcoded `avg_amendment_ratio=1.0` and `contracts_over_5x=0` stats
35. PostgreSQL not connected → updated `backend/.env` with real Render.com connection string; added `backend/.env` load to `main.py`; PG probe at startup stores 89 tables across `cra/ab/fed/general` schemas; `/api/health` now returns `pg_connected` + `pg_tables`
36. Loop graph had 17 duplicate Salvation Army nodes → `get_loop_graph_live` used raw 15-char BNs from `path_bns`; fixed to normalise all BNs to `[:9]` before building nodes/links and `GROUP BY LEFT(bn,9)` in node SQL; node count reduced from 44 → 28 distinct orgs
37. `multi_board_directors` stat showing 37,481 (inflated) → name-only matching across all 91K charities; restricted to govt-funded charities only (`LEFT(bn,9) IN (SELECT ... WHERE total_govt > 0)`); applied same filter to `get_governance_live` Step 1; stat now 18,134 — real, computable, and scoped to the relevant population
38. Hardcoded WSL absolute path in `db_duckdb._base()` → replaced with `os.path.dirname(os.path.dirname(os.path.abspath(__file__)))` so DATA_DIR defaults to `<repo_root>/data` on any machine; Docker and CI work without manually setting DATA_DIR
39. `docker-compose.yml` missing env vars → added `env_file: [.env, backend/.env]` to backend service so DB_CONNECTION_STRING and AI keys are passed into container; `environment` block overrides Docker-specific paths (DATA_DIR, DUCKDB_PATH)
40. `vite.config.js` had no dev proxy → added `server.proxy` for `/api` → `http://localhost:8000`; development now works without VITE_API_URL; Docker nginx still handles production proxying
41. Hardcoded fallback numbers in Dashboard.jsx and SoleSource.jsx → replaced `|| 15533` / `?? 219` etc. with null-safe `?.` and `?? '…'`; values come from API only, no fabricated fallbacks
42. Hardcoded `15533` in main.py chat response → changed fallback to `0`
43. `/api/search` DuckDB-only, no cross-dataset results → added `_pg_entity_search()` in `main.py` that queries `general.entity_golden_records` via PostgreSQL when connected; results prepended under `"entities"` key, confidence-ranked; graceful fallback to DuckDB-only when PG is down
44. Search dropdown showed all categories as equal → App.jsx now renders `entities` section first with `✦` icon and CRA/Federal/Alberta dataset source pills; click still navigates to `/entity/:bn`
45. Governance self-dealing mode showed blank positions → `get_director_loop_intersections_live()` CTE now includes `LIST(DISTINCT position)` in `multi_board`; frontend maps `sd.positions || []` instead of hardcoded `[]`
46. Self-dealing filter returned 0 results (regression) → `mb.positions` was in SELECT but not GROUP BY in `get_director_loop_intersections_live()` → DuckDB error silently caught; fixed GROUP BY; also changed HAVING `>= 2` to `>= 1` so "loop exposure" shows directors with any loop-connected org
47. Loops graph started too zoomed in → added `zoom: 0.6` to graph series, reduced repulsion 400→200, tightened edgeLength [100,200]→[80,150], increased gravity 0.1→0.15
48. Multi-board director count label overclaimed → updated Governance page header to note name-matching methodology and approximate nature; renamed "Self-dealing" filter to "Loop Exposure"
49. Multi-board directors stat inflated at 3+ boards → raised headline stat threshold to 5+ boards in `get_stats_live()`; governance page keeps 3+ default for browsing; Dashboard label updated to "5+ boards"
50. docker-compose.yml env_file hard error for teammates without .env files → added `required: false` to both `.env` and `backend/.env` entries so the app still starts without credentials
51. Docker zombie count = 0 (discrepancy vs start.sh) → root cause: fresh `duckdb_vol` has no pre-built tables; large JSONL loads triggered lazily on first request exceed nginx 30s timeout; error cached as `{}`; zombie_count falls back to 0. Fix: DUCKDB_PATH now points to `./data/hackathon.duckdb` (pre-built, same as local); removed separate duckdb_vol volume; nginx proxy_read_timeout raised 30s→120s

---

## Important DuckDB gotchas

- DuckDB is single-writer. Backend holds the lock — no concurrent `.duckdb` access.
- `path_bns` is a DuckDB LIST. Use `UNNEST(path_bns)` not `STRING_SPLIT`.
- `QUALIFY ROW_NUMBER()` broken with JOINs in some DuckDB versions — use CTE + `WHERE rn = 1`.
- `TRY_CAST(x AS DOUBLE)` everywhere — prevents crashes on null/empty JSONL fields.
- Cache TTL = 10 min. Restart backend to bust cache.
- `re` module (stdlib) in `db_duckdb.py` — no pip install needed.

---

## Hackathon context

- Event: Agency 2026, Ottawa, April 29 2026
- Code freeze: 2PM
- Judging: impact of finding, technical depth, AI integration, presentation
- Key narrative: 219 zombie recipients, 5,808 funding loops, ~2,841 multi-board directors
- Data provenance: CRA T3010, Federal Proactive Disclosure (51+ depts), Alberta Open Data — all public records
