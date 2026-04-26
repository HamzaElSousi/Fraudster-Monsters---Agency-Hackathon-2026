# Follow The Money — AI Accountability Dashboard

> **Agency 2026 · Ottawa · April 29, 2026**
> An AI-powered investigative dashboard exposing patterns in Canadian government spending that no human could trace by hand.

---

## What It Does

This tool ingests **10GB of public government records** and surfaces accountability failures across four challenge categories:

| Challenge | What We Find |
|-----------|-------------|
| **Zombie Recipients** | Charities with 70%+ government revenue dependency that stopped filing tax returns — public money sent into the void |
| **Funding Loops** | Circular money flows between charities where the same dollar passes through multiple organizations, each issuing its own charitable tax receipt |
| **Governance Networks** | Directors who simultaneously control multiple government-funded charities, concentrating oversight of public money in few hands |
| **Sole-Source Contracts** | Alberta procurement contracts awarded without competitive bidding, showing amendment creep and threshold gaming |

The **Cross-Challenge Alerts** page identifies organizations flagged simultaneously across multiple categories — the highest-priority accountability failures.

---

## Data Sources

All data is from **official Canadian government open data portals** — nothing scraped, nothing estimated (except phantom receipt upper bounds).

| Source | What It Contains | Size |
|--------|-----------------|------|
| CRA T3010 Charity Filings | Annual financials, directors, govt funding, loops | ~6GB |
| Federal Proactive Disclosure | 1.27M grant & contribution records (51+ depts) | ~3GB |
| Alberta Open Data | 15,533 sole-source procurement contracts | ~1GB |

### Getting the Data

The `data/` directory is **not committed** (10GB — too large for git). You need it to run the app.

**Hackathon shared drive**: The pre-processed dataset is available via the Agency 2026 group chat link:

> **[Download data folder from Google Drive](https://drive.google.com/file/d/1D3vb9x7WF2cEtt44n70nzHGXsAbLtaFQ/view)**

Download it and extract/place the contents so your project root has a `data/` folder structured as:

```
data/
├── cra/        # CRA T3010 JSONL files
├── fed/        # Federal grants JSONL
└── ab/         # Alberta procurement JSONL
```

`data/hackathon.duckdb` is auto-created on first backend run — do not copy it between machines.

**Raw sources (if needed)**:
- CRA T3010: [open.canada.ca](https://open.canada.ca)
- Federal grants: [search.open.canada.ca/grants/](https://search.open.canada.ca/grants/)
- Alberta contracts: [open.alberta.ca](https://open.alberta.ca)

> The app expects JSONL files at `data/cra/`, `data/fed/`, `data/ab/`. `data/hackathon.duckdb` is auto-created on first run (~2 min).

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- WSL (Windows) or any Linux/Mac terminal

### 1. Clone and set up

```bash
git clone https://github.com/HamzaElSousi/Fraudster-Monsters---Agency-Hackathon-2026.git
cd Fraudster-Monsters---Agency-Hackathon-2026
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add AWS Bedrock keys or Anthropic API key for AI chat
```

### 3. Place data files

```bash
# Download from the Google Drive link above and extract into the project root
# Then verify:
ls data/cra/loops.jsonl    # spot check — should exist before first run
# data/hackathon.duckdb is auto-created on first backend start (do not copy it)
```

### 4. Start everything

```bash
bash start.sh
# Opens backend on :8000 and frontend on :5173
# First run takes ~2 min to load DuckDB tables; instant after that
```

Or run individually:

```bash
# Terminal 1 — backend
cd backend && pip install -r requirements.txt && python3 main.py

# Terminal 2 — frontend
cd frontend && npm install && npm run dev
```

Visit **http://localhost:5173**

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python · FastAPI · DuckDB (embedded, queries JSONL directly) |
| Frontend | React 19 · Vite · React Router |
| Visualization | Apache ECharts · D3 |
| AI | AWS Bedrock Converse API (primary) · Anthropic SDK (fallback) |
| Deploy | Docker · nginx (optional) |

**Dual database support**: DuckDB reads the JSONL files directly and caches them in `data/hackathon.duckdb` on first run. PostgreSQL integration via shared Render.com database provides dual-verification (see [PostgreSQL Connection](#postgresql-connection) below).

---

## PostgreSQL Connection

The shared Render.com PostgreSQL database is now connected and verified at startup:

| Component | Details |
|-----------|---------|
| **Connection** | Real Render.com connection string loaded from `backend/.env` |
| **Tables** | 89 tables across 4 schemas: `cra`, `ab`, `fed`, `general` |
| **Entity resolution** | `general.entity_golden_records` and `general.vw_entity_search` enable cross-dataset matching |
| **Backend behavior** | `.env` loaded from both root AND `backend/` directory (backend-specific vars override root) |
| **Health check** | `GET /api/health` returns `pg_connected: true/false` + `pg_table_count` to verify connection |

---

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI routes + AI chat logic
│   ├── db_duckdb.py         # All DuckDB queries (get_*_live functions)
│   ├── requirements.txt
│   └── .env.example         # Copy to .env, fill in API keys
│
├── frontend/
│   └── src/
│       ├── api.js            # All fetch functions
│       ├── App.jsx           # Router + sidebar
│       └── pages/
│           ├── Dashboard.jsx
│           ├── Zombies.jsx
│           ├── FundingLoops.jsx
│           ├── Governance.jsx
│           ├── SoleSource.jsx
│           ├── Alerts.jsx
│           ├── Chat.jsx
│           └── EntityCaseFile.jsx
│
├── data/                    # ← NOT in git (10GB). Get from shared drive.
│   ├── hackathon.duckdb     # Auto-created on first run
│   ├── cra/                 # CRA T3010 JSONL files
│   ├── fed/                 # Federal grants JSONL
│   └── ab/                  # Alberta procurement JSONL
│
├── start.sh                 # One-command startup
├── docker-compose.yml       # Docker alternative
└── CLAUDE.md                # Technical reference (architecture, bugs, gotchas)
```

---

## Key API Endpoints

```
GET  /api/stats                         — Dashboard headline numbers
GET  /api/zombies?min_funding=100000    — Zombie recipients
GET  /api/loops?min_hops=2&max_hops=6  — Funding loops (with suspicion scoring)
GET  /api/loops/stats                   — Loop stats incl. phantom receipt totals
GET  /api/governance?min_boards=3       — Multi-board directors
GET  /api/alerts?min_flags=2            — Cross-challenge intersections
GET  /api/sole-source?min_ratio=3       — Sole-source concentration
GET  /api/entity/{bn}                   — Full entity case file
GET  /api/dashboard/featured            — Top 5 high-risk entities
GET  /api/health
POST /api/chat                          — AI investigator (body: {message: string})
```

Full API docs at **http://localhost:8000/docs** when backend is running.

---

## AI Chat

The `/chat` page lets you ask natural-language questions about the data. It routes to:
- **AWS Bedrock** (Claude) — requires `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` in `.env`
- **Anthropic direct** — requires `ANTHROPIC_API_KEY` in `.env`
- **Template fallback** — works without any API keys; returns structured data cards

Check `GET /api/health` → `ai_enabled: true/false` to see which mode is active.

---

## Docker (Alternative)

```bash
docker-compose up --build
# Backend on :8000, Frontend on :80 via nginx
```

---

## Environment Variables

See `backend/.env.example` for the full list. Key ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | For AI chat | Bedrock access |
| `AWS_SECRET_ACCESS_KEY` | For AI chat | Bedrock secret |
| `AWS_SESSION_TOKEN` | For AI chat | Session token (event-day credentials) |
| `ANTHROPIC_API_KEY` | Alt. for AI | Direct Anthropic API |
| `DATA_DIR` | Optional | Override data path (default: `../data`) |

---

## What the Numbers Mean

| Metric | Value | Definition |
|--------|-------|------------|
| Registered charities | 91,129 | COUNT DISTINCT BN from CRA identification |
| Govt-funded charities | 45,933 | Charities with any govt revenue in any year |
| Zombie recipients | 219 | ≥70% govt revenue + ≥$100K + stopped filing by 2022 |
| Funding loops | 5,808 | Confirmed circular gift cycles in CRA T3010 |
| Multi-board directors | ~2,841 | Directors appearing on 3+ distinct charity boards |
| Federal grant records | 1,275,521 | Rows in federal proactive disclosure dataset |
| AB sole-source records | 15,533 | Alberta no-bid contracts |
| AB contract value | $18.2B | Total value of sole-source contracts |

**Phantom receipts** = `total_flow × hops` for same-year loops — an upper-bound estimate of tax receipt inflation. Labelled as such everywhere in the UI.

---

## For New Team Members

1. **Read `CLAUDE.md`** — it has the full technical reference: every bug fixed, every gotcha, all SQL patterns, data schema notes.
2. **The backend is single-writer** — DuckDB holds an exclusive lock. Don't try to open `hackathon.duckdb` directly while the server is running.
3. **Cache TTL is 10 minutes** — restart backend after any backend code change to bust the cache.
4. **BN format** — CRA uses 9-char roots (`107951618`) and 15-char program accounts (`107951618RR0001`). Always normalize with `LEFT(bn, 9)` when joining across tables.
5. **Frontend env** — use `import.meta.env.VITE_*`, never `process.env.*` (Vite, not CRA).

---

## Hackathon Notes

- **Code freeze**: 2PM April 29, 2026
- **Judging criteria**: Impact of finding · Technical depth · AI integration · Presentation
- **Data provenance**: All findings from official government open data. Nothing fabricated.
