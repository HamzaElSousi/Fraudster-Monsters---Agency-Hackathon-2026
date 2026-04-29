# AuditLens — Step-by-Step Startup Guide & Master Checklist

---

## STEP-BY-STEP: Starting the Project from Zero

### Step 1 — Clone / Init the Repo
```bash
mkdir auditlens && cd auditlens
git init
git remote add origin <your-github-repo-url>
```

Create the folder structure:
```bash
mkdir -p frontend backend data
touch .env .env.example .gitignore docker-compose.yml
echo "data/*.duckdb" >> .gitignore
echo ".env" >> .gitignore
```

### Step 2 — Copy .env
```bash
cp .env.example .env
# Open .env and fill in:
# - GEMINI_API_KEY (your free Gemini key for now)
# - POSTGRES_URL (already in CLAUDE.md)
# - ADMIN_KEY (any secret string)
```

### Step 3 — Scaffold the Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Verify Postgres connection works
python -c "import psycopg2; conn = psycopg2.connect('YOUR_POSTGRES_URL'); print('Connected!'); conn.close()"
```

### Step 4 — Explore the Schema (CRITICAL — do this before writing SQL)
```bash
# Open index.html from the hackathon repo in your browser
# This is the schema browser — verify every table name and column before writing queries
# Check KNOWN-DATA-ISSUES.md for documented data problems
```

### Step 5 — Test DuckDB Pull
```bash
cd backend
python -c "
import duckdb
conn = duckdb.connect(':memory:')
conn.execute('INSTALL postgres; LOAD postgres;')
# Test pulling a small table first
result = conn.execute(\"SELECT COUNT(*) FROM postgres_scan('YOUR_POSTGRES_URL', 'general', 'entity_golden_records')\").fetchone()
print(f'Golden records: {result[0]:,}')
conn.close()
"
```

### Step 6 — Scaffold the Frontend
```bash
cd ../frontend
npm create vite@latest . -- --template react-ts
npm install
npm install react-router-dom recharts d3 axios lucide-react
npm install -D @types/d3 tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm run dev   # verify it starts at localhost:5173
```

### Step 7 — Start with Docker
```bash
cd ..   # back to auditlens root
docker compose up --build
# Watch backend logs — wait for "DuckDB ready"
# Frontend: http://localhost:3000
# Backend docs: http://localhost:8000/docs
```

### Step 8 — Verify Everything Works
```bash
# Test backend health
curl http://localhost:8000/api/health

# Test stats endpoint
curl http://localhost:8000/api/stats

# Test search
curl "http://localhost:8000/api/search?q=community"

# Test a specific org (use a BN from your DuckDB data)
curl http://localhost:8000/api/org/123456789/profile
```

---

## MASTER CHECKLIST

### 🗂️ PROJECT SETUP
- [ ] Repo created and pushed to GitHub
- [ ] `.env.example` committed, `.env` gitignored
- [ ] `GEMINI_API_KEY` filled in `.env`
- [ ] `POSTGRES_URL` filled in `.env`
- [ ] Folder structure: `frontend/`, `backend/`, `data/`, `docker-compose.yml`
- [ ] `docker compose up` runs without errors
- [ ] Both frontend and backend containers start successfully

### 🔍 SCHEMA EXPLORATION (Partner — do this FIRST)
- [ ] `index.html` schema browser opened and reviewed
- [ ] `KNOWN-DATA-ISSUES.md` read fully
- [ ] Exact table names confirmed for: `entity_golden_records`, CRA loop tables, T3010 financials, directors, fed grants, AB grants, AB contracts
- [ ] Exact column names confirmed for each table
- [ ] Business Number format documented (with/without suffix, which tables have which)
- [ ] DuckDB test pull of `entity_golden_records` works
- [ ] DuckDB test pull of CRA loop/SCC tables works
- [ ] DuckDB test pull of FED grants works
- [ ] DuckDB test pull of AB grants works

### 🐍 BACKEND
- [ ] `main.py` with FastAPI app and CORS configured
- [ ] `db/duckdb_store.py` — pulls all required tables from Postgres into DuckDB on startup
- [ ] DuckDB file persists to `/app/data/auditlens.duckdb`
- [ ] `GET /api/health` — returns status + duckdb_loaded flag
- [ ] `GET /api/stats` — live counts: zombie, loop, duplicate, flagged orgs, total funding
- [ ] `GET /api/flagged-orgs` — returns top 50 risk-scored orgs with filter + sort support
- [ ] `GET /api/search` — supports BN exact, BN full, org name fuzzy, keyword search
- [ ] `GET /api/org/{bn}/profile` — org identity, risk score, tier, flags summary
- [ ] `GET /api/org/{bn}/funding` — timeline data by year and source
- [ ] `GET /api/org/{bn}/flags` — all 4 flags with criteria + data points
- [ ] `GET /api/org/{bn}/loop-map` — nodes + edges JSON for D3 graph
- [ ] `GET /api/org/{bn}/ai-brief` — Gemini brief generation works
- [ ] `GET /api/org/{bn}/export-pdf` — PDF downloads correctly
- [ ] `POST /api/admin/refresh` — re-triggers DuckDB pull (password protected)
- [ ] Risk scorer calculates 0-100 score with transparent breakdown
- [ ] All endpoints return correct Pydantic response shapes
- [ ] Error handling: 404 for unknown BN, 500 with message for DB errors
- [ ] All endpoints tested via `/docs` (Swagger UI)

### 🧮 SQL QUERIES (Partner)
- [ ] `zombie_check.sql` — joins T3010 filings gap with last grant date, calculates govt funding %
- [ ] `loop_check.sql` — queries CRA pre-computed loop/SCC tables for org presence
- [ ] `duplicate_check.sql` — finds same golden-record entity in both FED and AB same year
- [ ] `governance_check.sql` — director cross-reference: who else do they direct
- [ ] `flagged_orgs.sql` — scores and ranks all orgs, filters by flag type
- [ ] `search.sql` — multi-mode search with BN exact, fuzzy name, keyword
- [ ] `stats.sql` — homepage aggregate counts
- [ ] All queries tested with real BNs from the data
- [ ] NULL handling verified in all queries (especially purpose_code, province)

### 🤖 AI INTEGRATION
- [ ] `ai_service.py` with `PROVIDER` env var switching (gemini / anthropic)
- [ ] Gemini integration tested — brief generates correctly
- [ ] Prompt includes: org name, BN, province, total funding, last funded, all flag data
- [ ] Brief is 3-4 sentences + recommended action
- [ ] `ANTHROPIC_API_KEY` slot ready in `.env.example` for hackathon day swap
- [ ] Swap comment documented in `ai_service.py` (clear instructions for day-of)

### 🎨 FRONTEND — COMPONENTS
- [ ] `RiskBadge.tsx` — colored 0-100 score with tier label (Critical/High/Medium/Low)
- [ ] `FlagBadge.tsx` — emoji + label badges for each flag type
- [ ] `StatCard.tsx` — big number + label for homepage stats bar
- [ ] `OrgCard.tsx` — card for flagged feed and search results
- [ ] `SearchBar.tsx` — with mode detection tooltip and search tips
- [ ] `LoadingSkeleton.tsx` — skeleton placeholders for all loading states
- [ ] `EmptyState.tsx` — empty/no results message
- [ ] `Header.tsx` — logo + nav + inline search (on non-homepage pages)
- [ ] `ProblemStrip.tsx` — 4-challenge explanation strip
- [ ] `StatsBar.tsx` — live stats from /api/stats
- [ ] `FundingBarChart.tsx` — Recharts stacked bar by year + source
- [ ] `LoopNetworkGraph.tsx` — D3 force-directed graph with cycle highlighting
- [ ] `AIBrief.tsx` — brief panel with loading state + regenerate button
- [ ] All 6 CaseFile tab components built

### 🎨 FRONTEND — PAGES
- [ ] `HomePage.tsx` — hero + problem strip + stats bar + search + flagged feed
- [ ] `SearchPage.tsx` — search results with filter/sort
- [ ] `CaseFilePage.tsx` — full case file with all 6 tabs
- [ ] `MethodologyPage.tsx` — criteria explanation, data sources, AI explanation
- [ ] Routing configured in `App.tsx` (react-router-dom)
- [ ] All pages responsive (at minimum works at 1280px+ width)

### 🎨 FRONTEND — DESIGN
- [ ] CSS variables applied: all colors from the palette in CLAUDE.md
- [ ] Fonts loaded: Syne (display), Inter (body), IBM Plex Mono (data)
- [ ] Dark navy background throughout
- [ ] Amber accent on CTA buttons and highlights
- [ ] Risk tier colors correct (red/orange/yellow/green)
- [ ] Flag colors correct (zombie=red, loop=purple, duplicate=blue, governance=orange)
- [ ] Federal = blue, Provincial/AB = green in all charts
- [ ] Chart headlines above every chart explaining what it shows
- [ ] Loading skeletons on all async data
- [ ] Error states handled gracefully (not blank screens)
- [ ] "How AuditLens Works" 3-step visual on homepage
- [ ] Problem statement strip clearly visible on homepage

### 🎨 FRONTEND — SEARCH UX
- [ ] Search bar on homepage is large and prominent
- [ ] Search tips shown below bar: [By Name] [By BN] [By Province + topic]
- [ ] Debounced at 300ms
- [ ] Results appear inline below search bar
- [ ] Query type detected and labeled ("Searching by Business Number...")
- [ ] Empty state message shown when no results
- [ ] Clicking result navigates to case file

### 📄 CASE FILE UX
- [ ] AI brief always visible at top (not buried in a tab)
- [ ] Recommended action shown at bottom of AI brief
- [ ] Regenerate button on AI brief works
- [ ] Case status selector: Open / Under Review / Escalated / Closed / Cleared
- [ ] Flag/Note/Escalate/PDF buttons all visible in header
- [ ] All 6 tabs navigate correctly
- [ ] Loop map renders with D3 — nodes clickable (open that org's case file)
- [ ] Loop map shows "No loops detected" message when applicable
- [ ] Risk Flags tab shows criteria with data points (not just "triggered/not triggered")
- [ ] Case notes save to localStorage keyed by BN (persist on page reload)
- [ ] PDF export downloads a real PDF (not blank)

### 🐳 DOCKER
- [ ] `backend/Dockerfile` builds successfully
- [ ] `frontend/Dockerfile` builds successfully
- [ ] `docker-compose.yml` starts both services
- [ ] Backend health check passes before frontend starts
- [ ] Data volume mounts correctly (DuckDB persists)
- [ ] Hot reload works in both containers (for dev)
- [ ] `.env` file loaded correctly by both containers

### 🚀 DEPLOYMENT (Hackathon Day)
- [ ] Decide GCP vs AWS based on available credentials
- [ ] Backend deployed and `/api/health` returns 200
- [ ] DuckDB pull completes on deployed backend
- [ ] Frontend deployed with correct `VITE_API_URL` pointing to deployed backend
- [ ] End-to-end search test works on deployed version
- [ ] AI brief generates on deployed version
- [ ] `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` set in deployed env vars
- [ ] Public URL tested and shared with team

### 🎤 DEMO READINESS
- [ ] Demo script rehearsed (see CLAUDE.md section 13)
- [ ] 3 compelling real organizations identified from the data for the demo
  - [ ] One clear zombie (high funding → dissolved quickly)
  - [ ] One with a visible loop (good for the D3 graph)
  - [ ] One with duplicate federal + provincial funding
- [ ] These org BNs bookmarked / noted for demo use
- [ ] Methodology page ready to show if judges ask "how does scoring work"
- [ ] Team aligned on who presents which part

### 🔄 DAY-OF SWAP (Gemini → Claude)
- [ ] Set `AI_PROVIDER=anthropic` in deployed environment
- [ ] Set `ANTHROPIC_API_KEY=<hackathon day key>` in deployed environment
- [ ] Restart backend container / redeploy
- [ ] Test AI brief generates with Claude
- [ ] Verify brief quality is good (may need minor prompt tweaks)

---

## QUICK REFERENCE: Important BNs to Test With

Run this query in DuckDB after pull to find good demo candidates:
```sql
-- Find potential zombies for demo
SELECT
    canonical_name,
    bn,
    total_funding_federal + total_funding_ab AS total_public_funding
FROM entity_golden_records
ORDER BY total_public_funding DESC
LIMIT 100;
-- Then cross-check against CRA filings gap
```

---

## QUICK REFERENCE: API Base URLs

| Environment | Frontend | Backend |
|---|---|---|
| Local dev | http://localhost:3000 | http://localhost:8000 |
| GCP Cloud Run | (assigned on deploy) | (assigned on deploy) |
| AWS | (assigned on deploy) | (assigned on deploy) |
