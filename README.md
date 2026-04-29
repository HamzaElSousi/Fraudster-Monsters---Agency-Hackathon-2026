# Follow The Money — AI Accountability Dashboard

> **Fraudster Monsters · Agency 2026 · Ottawa · April 29, 2026**

An AI-powered investigative platform that ingests **10GB of official Canadian government records** and uses **agentic AI with autonomous tool use** to surface accountability failures no human could trace by hand.

---

## The Team

| Name | Role | GitHub |
|------|------|--------|
| **Hamza El Sousi** | Lead SWE / AI | [github.com/HamzaElSousi](https://github.com/HamzaElSousi) |
| **Mansi Joshi** | Frontend SWE / AI | [github.com/mansijoshi04](https://github.com/mansijoshi04) |
| **Farah Mohammed** | Data / AI | [github.com/FaraDuMatin](https://github.com/FaraDuMatin) |
| **Keena Swanson** | SWE / AI | [github.com/k334a](https://github.com/k334a) |

---

## What We Found

> **219 zombie charities** received public money after going dark · **5,808 circular funding loops** may inflate charitable tax receipts · **Thousands of directors** each sit on 5+ government-funded charity boards · **15,533 no-bid contracts** worth $18.2B in Alberta alone

---

## All 10 Challenges Implemented

| # | Challenge | What We Find |
|---|-----------|-------------|
| 1 | **Zombie Recipients** | Charities with 70%+ govt dependency that stopped filing — includes temporal analysis showing years inactive |
| 2 | **Ghost Capacity** | Persistent orgs with 0–3 employees, 80%+ govt revenue, near-zero program spending — the money enters but nothing comes out |
| 3 | **Funding Loops** | Circular gift flows with suspicion scoring, phantom receipt estimates, and **board overlap detection** (shared directors across loop participants) |
| 4 | **Sole Source & Amendment Creep** | No-bid Alberta contracts with escalation trend detection and near-threshold splitting analysis |
| 5 | **Vendor Concentration** | HHI + CR-3 analysis by department, NAICS sector, and region — surfaces monopoly-level vendor lock-in |
| 6 | **Governance Networks** | Multi-board directors with **tenure tracking** (flags 15+ year entrenchment) and loop exposure detection |
| 7 | **Policy Misalignment** | Federal spending by department vs stated priorities (climate, housing, healthcare, reconciliation) with AI analysis + program-level drill-down |
| 8 | **Duplicative Funding** | Organizations funded by both federal and Alberta governments — with **purpose overlap scoring** across policy domains |
| 9 | **Threshold Gaming** | Grants clustered 85–99.99% below $25K/$100K/$1M thresholds — weighted risk score by proximity, not just count |
| 10 | **Adverse Media** | AI-powered entity risk assessment generating targeted search queries for media databases and regulatory enforcement records |

**Cross-Challenge Alerts** identify entities flagged across multiple categories simultaneously — the highest-priority accountability failures.

**OSINT Investigations** provide deep-dive reports combining internal dossier data with external intelligence synthesis.

---

## Agentic AI Investigator

The `/chat` page is not a chatbot — it's an **autonomous AI investigator** with 12 database tools:

```
search_zombies · search_funding_loops · search_governance · search_sole_source
search_vendor_concentration · search_duplicative_funding · search_threshold_gaming
get_entity_dossier · search_entities · get_cross_challenge_alerts · get_platform_stats
```

**How it works:**
1. User asks an investigative question
2. Claude (via AWS Bedrock) decides which tools to call
3. Backend executes queries against the live database
4. Claude reasons over the results, may call more tools (up to 6 turns)
5. Returns a narrative with citations, markdown tables, and tool badges

Built with **Anthropic SDK tool_use** + **AWS Bedrock Converse API** with `toolConfig`. Falls back to data-driven template responses when AI is unavailable.

---

## Data Sources

All data from **official Canadian government open data portals** — nothing scraped, nothing estimated.

| Source | Records | Size |
|--------|---------|------|
| CRA T3010 Charity Filings | 91,129 charities, annual filings 2020–2024 | ~6GB |
| Federal Proactive Disclosure | 1,275,521 grant records from 51+ departments | ~3GB |
| Alberta Open Data | 15,533 sole-source contracts + grants | ~1GB |
| Entity Resolution | 851,000 golden records linking all three sources | included |

### Getting the Data

The `data/` directory is **not in git** (10GB). Download from the hackathon shared drive:

> **[Download data folder from Google Drive](https://drive.google.com/file/d/1D3vb9x7WF2cEtt44n70nzHGXsAbLtaFQ/view)**

Extract so your project root has:
```
data/
├── hackathon.duckdb     # Pre-built DuckDB (~768MB)
├── cra/                 # CRA T3010 JSONL files
├── fed/                 # Federal grants JSONL
├── ab/                  # Alberta procurement JSONL
└── general/             # Entity resolution JSONL
```

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- 10GB data files (see above)

### Setup

```bash
git clone https://github.com/HamzaElSousi/Fraudster-Monsters---Agency-Hackathon-2026.git
cd Fraudster-Monsters---Agency-Hackathon-2026

# Configure AI credentials
cp backend/.env.example backend/.env
# Edit backend/.env — add AWS Bedrock keys for agentic AI

# Install dependencies
cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..

# Start everything
bash start.sh
```

Visit **http://localhost:5173**

### Docker Alternative

```bash
bash docker-rebuild.sh clean -d
# Backend on :8000, frontend on :3000 via nginx
# First run copies DuckDB to isolated volume (~30s)
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python · FastAPI · DuckDB (embedded, queries 10GB JSONL directly) |
| Frontend | React 19 · TypeScript · Vite · React Router 7 |
| Visualization | Apache ECharts · D3 · React Force Graph |
| AI | AWS Bedrock Converse API with tool_use (Claude Sonnet 4.6) |
| Entity Resolution | 851K golden records via DuckDB + PostgreSQL dual-DB |
| Icons | Lucide React |
| Deploy | Docker Compose · nginx reverse proxy |

---

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI routes + agentic AI chat (12 tools)
│   ├── db_duckdb.py         # All DuckDB queries (get_*_live functions)
│   ├── risk_scorer.py       # Risk scoring utilities
│   └── .env.example         # Copy to .env, add API keys
│
├── frontend/src/
│   ├── App.tsx              # Router + sidebar with 10 challenge nav
│   ├── api.ts               # All fetch functions
│   └── pages/
│       ├── Home.jsx          # Landing page with team + all 10 challenges
│       ├── Dashboard.jsx     # 6 finding cards + investigation start
│       ├── Zombies.tsx       # Challenge #1 — clickable entity rows
│       ├── GhostRecipients.jsx # Challenge #2 — ghost capacity analysis
│       ├── FundingLoops.tsx  # Challenge #3 — graph + table + board overlap
│       ├── SoleSource.tsx    # Challenge #4 — amendment creep + trends
│       ├── VendorConcentration.jsx # Challenge #5 — HHI gauge + AI briefs
│       ├── Governance.tsx    # Challenge #6 — director cards + tenure
│       ├── PolicyMisalignment.jsx # Challenge #7 — dept spending + AI analysis
│       ├── DuplicativeFunding.tsx # Challenge #8 — overlap scoring
│       ├── ThresholdGaming.jsx # Challenge #9 — weighted risk scores
│       ├── AdverseMedia.jsx  # Challenge #10 — AI risk assessment
│       ├── Alerts.tsx        # Cross-challenge multi-flag intersections
│       ├── Investigations.tsx # OSINT/WEBINT deep investigations
│       ├── Chat.tsx          # Agentic AI with markdown tables + tool badges
│       ├── EntityCaseFile.jsx # Full entity dossier (flags, charts, loops, AI)
│       └── Methodology.tsx   # How the platform works
│
├── data/                    # NOT in git (10GB) — download from shared drive
├── start.sh                 # One-command local startup
├── docker-compose.yml       # Docker deployment
├── TO_DEMO.md               # Demo script + presentation guide
└── CLAUDE.md                # Full technical reference
```

---

## Key API Endpoints

```
GET  /api/stats                              Dashboard headline numbers
GET  /api/zombies?min_funding=100000         Zombie recipients (temporal analysis)
GET  /api/ghost-recipients?min_funding=500000 Ghost capacity (employee + program spending)
GET  /api/loops?min_hops=2&max_hops=6        Funding loops (board overlap enrichment)
GET  /api/sole-source?min_ratio=3             Sole-source (trend detection)
GET  /api/vendor-concentration?dimension=dept  HHI + CR-3 analysis
GET  /api/governance?min_boards=3             Multi-board directors (tenure)
GET  /api/policy-misalignment?limit=20        Dept spending + AI analysis
GET  /api/policy-misalignment/programs?dept=X  Program-level drill-down
GET  /api/duplicative-funding                 Dual-funded orgs (overlap scoring)
GET  /api/threshold-gaming?limit=50           Weighted risk scores
POST /api/adverse-media                       AI entity risk assessment
GET  /api/adverse-media/top-flagged           Top 5 cross-flagged entities
GET  /api/alerts?min_flags=2                  Cross-challenge intersections
POST /api/investigate                         OSINT/WEBINT deep investigation
GET  /api/entity/{bn}                         Full entity case file
POST /api/chat                                Agentic AI investigator (12 tools)
```

Full interactive API docs at **http://localhost:8000/docs**

---

## What the Numbers Mean

| Metric | Value | How It's Computed |
|--------|-------|-------------------|
| Registered charities | 91,129 | COUNT DISTINCT BN from CRA identification |
| Zombie recipients | 219 | ≥70% govt revenue + ≥$100K + stopped filing by 2022 |
| Funding loops | 5,808 | SCC-detected circular gift cycles in CRA T3010 |
| Multi-board directors | ~3,400 | Directors on 5+ distinct govt-funded charity boards (name-matched) |
| Federal grant records | 1,275,521 | Federal proactive disclosure dataset |
| AB sole-source contracts | 15,533 | Alberta no-bid procurement records |
| AB contract value | $18.2B | Total sole-source contract value |

**Phantom receipts** = `total_flow x hops` for same-year loops — an upper-bound estimate of tax receipt inflation. Labelled as such in the UI.

---

## Environment Variables

See `backend/.env.example`. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | For AI | Bedrock access key |
| `AWS_SECRET_ACCESS_KEY` | For AI | Bedrock secret key |
| `AWS_SESSION_TOKEN` | For AI | Session token (event-day credentials) |
| `AWS_REGION` | For AI | e.g. `us-west-2` |
| `BEDROCK_MODEL_ID` | Optional | Default: `us.anthropic.claude-sonnet-4-6` |
| `DB_CONNECTION_STRING` | Optional | PostgreSQL for dual-DB verification |
| `DATA_DIR` | Optional | Override data path (default: `../data`) |

---

## Hackathon Context

- **Event**: Agency 2026, Ottawa, April 29, 2026
- **Code freeze**: 2PM
- **Judging**: Impact of finding · Technical depth · AI integration · Presentation
- **Key narrative**: All 10 challenges implemented with agentic AI, cross-challenge intersection analysis, and real government data at 10GB scale
- **Data provenance**: CRA T3010, Federal Proactive Disclosure (51+ depts), Alberta Open Data — all public records

---

## License

Built for the Agency 2026 AI Accountability Hackathon. All data sourced from Canadian government open data portals.
