# Follow The Money — Project Brief
### Agency 2026 AI Accountability Hackathon · Ottawa · April 29, 2026

---

## What is this?

An AI-powered government spending accountability dashboard that surfaces accountability failures hidden in 23 million+ records across four public datasets. It finds patterns that would take a human investigator weeks — in under a second.

**Live at:** `http://localhost:5173` (dev) · `http://localhost:3000` (Docker)

---

## What did we build?

| Challenge | What it detects | Key finding |
|-----------|----------------|-------------|
| **#1 Zombie Recipients** | Charities that received large government funding, then ceased filing with CRA within a few years | **347 zombie orgs**, $397M in unaccountable public funds |
| **#3 Funding Loops** | Circular gift patterns: money flows from Charity A → B → C → back to A (SCC + Johnson's algorithm) | **5,808 circular loops** detected, some same-year (suggests receipt inflation) |
| **#4 Sole Source & Amendment Creep** | Contracts that start below competitive thresholds, then balloon via amendments with no competitive bidding | **15,533 Alberta contracts** flagged; $579M+ at risk |
| **#6 Governance Networks** | Directors sitting on multiple publicly-funded charity boards simultaneously — conflicts of interest | **2,841 multi-board directors** across 2.87M director filings |
| **Multi-Flag Alerts** | Cross-challenge intersection: entities flagged in 2+ challenge categories simultaneously | 4 critical (3+ flags), 16 high (2 flags) |
| **Ask AI** | Natural language query interface over all datasets with inline expandable results | Explains findings in plain English, suggests follow-up questions |

**Total tracked:** $89.4B in public funding across CRA T3010, Federal Grants & Contributions, and Alberta Open Data.

---

## How did we achieve it?

### Data layer — DuckDB
- **No database server needed.** DuckDB queries 10GB of JSONL files directly on-disk.
- On first start, tables are preloaded into a persistent `hackathon.duckdb` file (~2 min). Every subsequent start is instant (sub-second queries).
- Cache layer (10-min TTL) wraps all queries — repeated API calls return instantly.

### Cross-challenge alerts — Python-side joins
- DuckDB's LIST type (JSON arrays stored natively) caused CTE UNNEST failures.
- Solution: fetch zombie BNs, loop BNs, and governance BNs as Python sets, then do the intersection in Python — same result, no DuckDB type bugs.

### Funding loop detection
- Used Strongly Connected Component (SCC) decomposition + Johnson's algorithm on the charity gift-flow graph to find all simple cycles of 2–6 hops.
- Pre-computed loops are stored in `loops.jsonl`; we query and visualize them live.

### Visualization — ForceGraph2D
- Interactive D3-backed canvas graph. Nodes = charities, edges = gift flows.
- Node size = revenue, color = risk level (high/medium/low).
- Table view alongside graph for bulk exploration — click a row to highlight its loop in the graph.

### AI — FastAPI + Bedrock/Anthropic
- Natural language queries route to a pre-built context engine that fetches relevant data from all 6 endpoints.
- On event day: AWS Bedrock Converse API (Claude Sonnet).
- Dev fallback: Anthropic SDK (same model, direct API).
- Responses include structured data cards (expandable inline) + follow-up suggestions.

---

## Trade-offs made and why

| Decision | Why we made it | Trade-off accepted |
|----------|---------------|-------------------|
| **DuckDB over PostgreSQL** | No server setup; queries JSONL directly; sub-second after preload; portable | Single-writer lock — can't run multiple backend workers |
| **Python-side joins for alerts** | Avoids DuckDB LIST-type UNNEST bugs in CTEs; same correctness | Loads ~500 zombie rows into memory per request (acceptable at this scale) |
| **10-minute result cache** | Prevents re-running expensive queries on repeated page loads | Stale data if underlying JSONL changes mid-session |
| **ForceGraph2D canvas** | Handles 50+ nodes smoothly without DOM overhead; built-in D3 physics | Nodes aren't CSS-styleable; custom rendering required |
| **Single Uvicorn worker** | DuckDB single-writer constraint — two workers = file lock conflict | No horizontal scaling; acceptable for demo/hackathon |
| **JSONL → DuckDB preload** | 10GB of flat files query in <1s after table creation | First boot takes ~2 min; must persist `.duckdb` file in Docker volume |
| **One-shot zoomToFit** | Prevent graph zoom glitching every time physics engine settles after node clicks | Graph doesn't re-center after new data loads unless page refreshed |
| **No PostgreSQL locally** | Remove dependency on a running database service | All data must be in JSONL files at a known path |

---

## What's not done yet

| Item | Priority | Notes |
|------|----------|-------|
| Challenge #2 — Receipt Inflation | High | Cross-reference same-year loop flows with reported donations |
| Challenge #8 — Grant Stacking | Medium | Identify entities receiving grants from multiple federal programs simultaneously |
| Challenge #9 — Threshold Gaming | Medium | Contracts split just below $25K, $50K, $100K competitive thresholds |
| Sole-source flag in alerts | Medium | Alberta sole-source vendors not yet cross-referenced in multi-flag alerts |
| AWS Bedrock configuration | High (event day) | `ai_enabled: false` in health check = template responses only. Configure `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` env vars |
| Multi-instance deployment | Low | DuckDB single-writer prevents multiple backend replicas |

---

## Running the app

### Development (fastest)
```bash
bash start.sh
# Backend: http://localhost:8000
# Frontend: http://localhost:5173
```

### Docker (clean build)
```bash
docker compose up           # normal start
bash docker-clean.sh        # wipe volumes + rebuild from scratch
```

### Environment variables
```bash
DATA_DIR=/path/to/data           # where JSONL files live (default: ./data)
AWS_ACCESS_KEY_ID=...            # for Bedrock AI on event day
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
ANTHROPIC_API_KEY=...            # fallback if Bedrock unavailable
VITE_API_URL=http://localhost:8000  # frontend → backend URL
```

---

## Key numbers for the pitch

- **$89.4B** total public funding tracked
- **347** zombie organizations (ceased filing after receiving govt funds)
- **5,808** circular funding loops (money cycles between charities)
- **2,841** directors on 3+ publicly-funded charity boards
- **15,533** Alberta sole-source contracts with amendment creep
- **4** organizations flagged critical across zombie + loop + governance simultaneously
- **<1 second** query response time after DuckDB preload
- **23M+** records across 4 datasets
