# CLAUDE.md — FraudsterMonsters: AI-Powered Public Funds Accountability Engine
> **Hackathon:** Agency 2026 — AI For Accountability | **Date:** April 29, 2026
> **Team:** MJ (Frontend/React/TypeScript) + Partner (Backend/Python/Data)
> **Stack:** React + TypeScript + Vite | Python + FastAPI | DuckDB | Gemini API (→ Claude on day)
> **Deploy:** GCP Cloud Run or AWS App Runner (decided on hackathon day)

---

## 1. PROJECT OVERVIEW

### The Problem We Are Solving
Canadian government auditors investigate funding fraud, waste, and misuse **manually** — cross-referencing CRA charity filings, federal grants, and provincial contracts one system at a time. A single investigation takes **weeks**. Meanwhile billions of dollars flow to:
- **Zombie organizations** that dissolve shortly after receiving public funding
- **Circular charity loops** where money moves between related entities inflating revenue with no program output
- **Duplicate-funded recipients** receiving money from both federal and provincial governments for identical purposes
- **Governance networks** where the same individuals control multiple funded organizations

**FraudsterMonsters replaces 3 weeks of manual auditor research with a 3-minute AI-generated investigation case file.**

### What the Product Does
A government auditor arrives at FraudsterMonsters and either:
1. **Searches** for a specific organization by name, Business Number, or keyword
2. **Browses** the AI-ranked feed of highest-risk flagged organizations

They click any organization and receive a **complete investigation case file** containing:
- An AI-written investigation brief synthesizing all red flags
- Funding timeline visualization
- Transparent red flag breakdown (what triggered, why, what data)
- Circular funding loop network map
- Duplicate funding evidence
- Governance/director network
- Case management tools: flag, add notes, escalate, export PDF

### The Four Challenges We Address (as one unified workflow)
| Challenge | How It Connects |
|---|---|
| **#1 Zombie Recipients** | Did this funded org actually survive? Core signal. |
| **#3 Funding Loops** | Is charity money laundering through circular transfers? |
| **#8 Duplicative Funding** | Is federal AND provincial money going to the same thing? |
| **#6 Related Parties** | Who controls this org — and do they control others? |

These are not separate tabs. They are **four lenses on one organization** — all surface inside a single case file.

---

## 2. DATA ARCHITECTURE

### Source Database
- **Host:** Render PostgreSQL (read-only replica)
- **Connection:** `postgresql://database_database_w2a1_user:JvqVh0msmuBrwgING68S52H0sz3wEEXI@dpg-d7auudv5r7bs738iqh70-b.replica-cyan.oregon-postgres.render.com/database_database_w2a1`
- **Schemas:** `cra` (charity filings), `fed` (federal grants), `ab` (Alberta data), `general` (entity resolution)
- **Total rows:** ~23M across all schemas

### Why DuckDB (Not Direct Postgres Queries)
Running analytical queries (loop detection, cross-schema joins, aggregations) directly against a shared 23M-row Postgres replica will be slow and unreliable during a live demo. DuckDB solves this:

```
Render PostgreSQL (source of truth, read-only)
        ↓  pulled once at backend startup (~2-3 min)
DuckDB in-memory database (analytical query engine)
        ↓  sub-second queries on all pulled data
FastAPI endpoints
        ↓
React frontend
```

**This is real data queried in real time — DuckDB is a faster query layer, not hardcoded data.**

### What Gets Pulled Into DuckDB at Startup
The backend pulls only the tables/columns needed for the four challenges:

```python
TABLES_TO_PULL = {
    # Entity resolution golden records — the spine of everything
    "general.entity_golden_records": "SELECT * FROM general.entity_golden_records",

    # CRA pre-computed loop/SCC tables (already computed by hackathon org)
    "cra.loop_detection": "SELECT * FROM cra.loop_detection",           # adjust table name per schema
    "cra.scc_components": "SELECT * FROM cra.scc_components",           # adjust table name per schema
    "cra.t3010_financials": """
        SELECT bn, charity_name, fiscal_year, total_revenue,
               government_funding, total_expenditures, filing_status
        FROM cra.t3010_financials
    """,
    "cra.directors": "SELECT bn, director_name, fiscal_year FROM cra.directors",

    # Federal grants
    "fed.grants": """
        SELECT recipient_bn, recipient_name, department, amount,
               fiscal_year, purpose_code, province
        FROM fed.grants_contributions
    """,

    # Alberta grants + contracts + sole source
    "ab.grants": """
        SELECT recipient_name, recipient_bn, amount, fiscal_year,
               purpose, ministry
        FROM ab.ab_grants
    """,
    "ab.contracts": "SELECT * FROM ab.ab_contracts",
    "ab.sole_source": "SELECT * FROM ab.ab_sole_source",
}
```

**Important:** Run `index.html` from the hackathon repo to verify exact table and column names before finalizing these queries.

### DuckDB Refresh
- Pull runs automatically on FastAPI startup
- `POST /api/admin/refresh` endpoint re-triggers the pull (password protected)
- Estimated pull time: 2–4 minutes depending on network
- DuckDB file saved to `/app/data/auditlens.duckdb` so it persists across container restarts (volume mount in Docker)

---

## 3. RISK SCORING SYSTEM

Every organization in the flagged feed has a **risk score from 0–100**. This is calculated transparently from four weighted components. The UI shows auditors exactly why an org scored what it did.

### Scoring Criteria (Be Explicit — Show on UI)

#### 🧟 Zombie Score (max 40 pts)
| Condition | Points |
|---|---|
| Government funding > 70% of total revenue | +15 |
| Government funding > 90% of total revenue | +20 (replaces above) |
| CRA filings ceased within 12 months of last grant | +20 |
| CRA filings ceased within 6 months of last grant | +30 (replaces above) |
| Total funding received > $500K | +5 bonus |
| Total funding received > $1M | +10 bonus (replaces above) |

#### 🔄 Loop Score (max 25 pts)
| Condition | Points |
|---|---|
| Appears in any CRA pre-computed loop/SCC | +10 |
| Loop involves > $100K total | +10 |
| Loop involves > $500K total | +20 (replaces above) |
| Loop chain length > 3 orgs | +5 bonus |

#### 💰 Duplicate Score (max 20 pts)
| Condition | Points |
|---|---|
| Funded by both FED and AB in same fiscal year | +10 |
| Same purpose category (matched by purpose_code) | +5 bonus |
| Total duplicate amount > $250K | +5 bonus |

#### 👥 Governance Score (max 15 pts)
| Condition | Points |
|---|---|
| Director appears on 3+ other funded org boards | +8 |
| Director appears on 5+ other funded org boards | +15 (replaces above) |
| Two or more directors shared with another flagged org | +5 bonus |

**Final score = sum of all component scores, capped at 100.**

### Risk Tiers (shown as colored badges in UI)
| Score | Tier | Color | Badge |
|---|---|---|---|
| 80–100 | Critical | Red `#DC2626` | 🔴 CRITICAL |
| 60–79 | High | Orange `#EA580C` | 🟠 HIGH |
| 40–59 | Medium | Yellow `#CA8A04` | 🟡 MEDIUM |
| 0–39 | Low | Green `#16A34A` | 🟢 LOW |

---

## 4. SEARCH FUNCTIONALITY

The search bar is the primary entry point for auditors who know what they're looking for. It must support multiple search modes because auditors work from different starting points.

### Search Modes (auto-detected by input pattern)

| Input Pattern | Mode | Example |
|---|---|---|
| 9 digits only | Business Number (BN) exact match | `123456789` |
| 9 digits + RR/RC/RP + 4 digits | Full BN with account suffix | `123456789RR0001` |
| All uppercase words | Organization name search | `SUNRISE COMMUNITY SERVICES` |
| Mixed case text | Fuzzy org name search | `Sunrise community` |
| Province abbreviation + keyword | Geographic + keyword search | `AB housing` or `Alberta housing` |
| Keyword only | Cross-field keyword search | `reconciliation` or `housing` |

### Search Implementation
```python
# Backend: /api/search?q=<query>&limit=20
# Auto-detect query type and route accordingly

def detect_query_type(q: str) -> str:
    q_clean = q.strip().replace("-", "").replace(" ", "")
    if re.match(r'^\d{9}(RR|RC|RP)\d{4}$', q_clean.upper()):
        return "bn_full"
    if re.match(r'^\d{9}$', q_clean):
        return "bn_root"
    if re.match(r'^[A-Z\s]+$', q.strip()):
        return "name_exact"
    return "fuzzy"
```

DuckDB supports `ILIKE` and fuzzy matching via `jaro_winkler_similarity()` — use this for name searches.

### Search Result Card (each result shows)
- Organization name (bold)
- Business Number
- Province | Sector
- Risk score badge (colored)
- Active flags as emoji badges: 🧟 🔄 💰 👥
- Last funding year
- "Open Case File →" button

### Search UX Details
- Debounced at 300ms (don't fire on every keystroke)
- Shows results inline below search bar (no page navigation until click)
- "Showing results for: [query]" label
- Empty state: "No organizations found. Try searching by Business Number or a broader term."
- Loading state: animated skeleton cards

---

## 5. FRONTEND SPECIFICATION

### Design Philosophy
**"Government-grade trust meets modern clarity"**

This is a tool for serious professional use — auditors in federal and provincial government. The aesthetic must convey authority, precision, and trustworthiness. NOT a startup dashboard. NOT purple gradients. Think:
- Dark navy primary palette (conveys authority, government seriousness)
- Sharp amber/gold accent (flags, warnings, risk indicators — distinct from typical red/green dashboards)
- Clean tabular data presentation with strong typographic hierarchy
- Every chart and visualization has a plain-English headline above it explaining what it shows

**The UI tells a story, not just shows data. Every screen answers: "What does this mean for the auditor?"**

### Color Palette (CSS Variables)
```css
:root {
  /* Primary */
  --color-bg: #0A0F1E;          /* Deep navy — main background */
  --color-surface: #111827;     /* Card/panel background */
  --color-surface-raised: #1F2937; /* Elevated cards */
  --color-border: #374151;      /* Borders */

  /* Text */
  --color-text-primary: #F9FAFB;    /* Main text */
  --color-text-secondary: #9CA3AF;  /* Secondary/meta text */
  --color-text-muted: #6B7280;      /* Muted labels */

  /* Accent */
  --color-accent: #F59E0B;        /* Amber — primary accent, CTA buttons */
  --color-accent-hover: #D97706;  /* Amber hover */

  /* Risk Colors */
  --color-critical: #DC2626;    /* Red — critical risk */
  --color-high: #EA580C;        /* Orange — high risk */
  --color-medium: #CA8A04;      /* Yellow — medium risk */
  --color-low: #16A34A;         /* Green — low risk */

  /* Semantic */
  --color-zombie: #EF4444;      /* Zombie flag */
  --color-loop: #8B5CF6;        /* Loop flag (purple — circular) */
  --color-duplicate: #3B82F6;   /* Duplicate flag (blue) */
  --color-governance: #F97316;  /* Governance flag (orange) */

  /* Chart colors */
  --chart-federal: #3B82F6;     /* Federal funding */
  --chart-provincial: #10B981;  /* Provincial/AB funding */
  --chart-cra: #F59E0B;         /* CRA/charity */
}
```

### Typography
```css
/* Import in index.html */
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Syne:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');

--font-display: 'Syne', sans-serif;    /* Headlines, org names, big numbers */
--font-body: 'Inter', sans-serif;      /* Body text, descriptions, labels */
--font-mono: 'IBM Plex Mono', monospace; /* Business Numbers, risk scores, data values */
```

### Page Structure & Routes
```
/                   → Homepage (Mission Control)
/search?q=          → Search results page
/org/:bn            → Organization Case File
/about              → Methodology & criteria explanation
```

---

### Page 1: Homepage (`/`)

**Purpose:** Orient the auditor. Show the scale of the problem. Let them start investigating immediately.

**Layout (top to bottom):**

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER                                                         │
│  FraudsterMonsters logo (left) | "Methodology" link (right)            │
├─────────────────────────────────────────────────────────────────┤
│  HERO SECTION                                                   │
│                                                                 │
│  "Public money.                                                 │
│   Accountable to the public."                                   │
│                                                                 │
│  [subtitle: "FraudsterMonsters surfaces funding anomalies across        │
│   23M+ government records — giving auditors an AI-generated     │
│   investigation brief in seconds, not weeks."]                  │
│                                                                 │
│  ┌────────────────────────────────────────────────────┐         │
│  │ 🔍 Search by organization name, Business Number,   │         │
│  │    province, or keyword...                [Search] │         │
│  └────────────────────────────────────────────────────┘         │
│                                                                 │
│  Search tips: [By Name] [By BN: 9 digits] [By Province + topic]│
├─────────────────────────────────────────────────────────────────┤
│  PROBLEM STATEMENT STRIP (amber background)                     │
│                                                                 │
│  THE PROBLEM WE'RE SOLVING                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ ZOMBIE   │  │ CIRCULAR │  │DUPLICATE │  │GOVERNANCE│       │
│  │ ORGS     │  │ LOOPS    │  │ FUNDING  │  │ NETWORKS │       │
│  │          │  │          │  │          │  │          │       │
│  │Orgs that │  │Charity $ │  │Same work │  │Directors │       │
│  │received  │  │circling  │  │funded by │  │controlling│      │
│  │funding & │  │between   │  │federal + │  │multiple  │       │
│  │dissolved │  │related   │  │provincial│  │funded    │       │
│  │shortly   │  │entities  │  │govt with │  │orgs —    │       │
│  │after     │  │no program│  │no        │  │conflicts │       │
│  │          │  │output    │  │awareness │  │of        │       │
│  │          │  │          │  │          │  │interest  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  "Without a tool like FraudsterMonsters, investigating one organization │
│   takes an auditor 2–3 weeks of manual cross-referencing.       │
│   We reduce that to under 3 minutes."                           │
├─────────────────────────────────────────────────────────────────┤
│  LIVE STATS BAR (pulled from DuckDB on load)                    │
│                                                                 │
│  [142 Zombie Recipients]  [23 Funding Loops]                    │
│  [$4.1B in flagged grants] [847 Duplicate-funded orgs]          │
│                                                                 │
│  "Across 23M+ records spanning CRA, federal, and Alberta data"  │
├─────────────────────────────────────────────────────────────────┤
│  HOW IT WORKS (3-step visual)                                   │
│                                                                 │
│  [1. Search or browse] → [2. AI scores & flags] →              │
│  [3. Review case file] → [4. Escalate or export]               │
├─────────────────────────────────────────────────────────────────┤
│  FLAGGED ORGANIZATIONS FEED                                     │
│  "Today's Highest-Risk Recipients"  [Filter ▼] [Sort ▼]        │
│                                                                 │
│  Filter options: All | 🧟 Zombie | 🔄 Loop | 💰 Duplicate | 👥 Gov│
│  Sort options: Risk Score | Funding Amount | Most Recent        │
│                                                                 │
│  [Org Card]  [Org Card]  [Org Card]  ...                        │
│                                                                 │
│  [Load More]                                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Org Card in the feed:**
```
┌───────────────────────────────────────────────────┐
│  🔴 87   SUNRISE COMMUNITY SERVICES ALBERTA       │
│  BN: 123456789  |  Alberta  |  Social Services    │
│                                                   │
│  🧟 Zombie  🔄 Loop  💰 Duplicate                 │
│                                                   │
│  Last funded: 2023 — $2.3M federal + $890K AB     │
│                              [Open Case File →]   │
└───────────────────────────────────────────────────┘
```

---

### Page 2: Organization Case File (`/org/:bn`)

**Purpose:** Give the auditor everything they need to make an investigation decision.

**Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Feed                                                 │
│                                                                 │
│  CASE FILE HEADER                                               │
│  ┌─────────────────────────────────────────────┐               │
│  │  SUNRISE COMMUNITY SERVICES ALBERTA         │               │
│  │  BN: 123456789RR0001  |  AB  |  Non-profit  │               │
│  │                                             │               │
│  │  Risk Score: [87] 🔴 CRITICAL               │               │
│  │  Flags: 🧟 Zombie  🔄 Loop  💰 Duplicate    │               │
│  │                                             │               │
│  │  Case Status: [● OPEN ▼]                    │               │
│  │  [📌 Flag] [📝 Note] [⬆ Escalate] [📄 PDF]  │               │
│  └─────────────────────────────────────────────┘               │
├─────────────────────────────────────────────────────────────────┤
│  AI INVESTIGATION BRIEF (always visible, above tabs)            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  🤖 AI Investigation Brief                              │   │
│  │                                                         │   │
│  │  "Sunrise Community Services Alberta received $2.3M in  │   │
│  │   federal grants and $890K from the Alberta government  │   │
│  │   between 2021 and 2023. CRA T3010 filings ceased in    │   │
│  │   Q2 2024 — approximately 8 months after the final      │   │
│  │   grant payment, which constituted 94% of total revenue.│   │
│  │   The organization also appears in a 3-entity circular  │   │
│  │   gifting loop totalling $1.2M with Northern Community  │   │
│  │   Trust and Alberta Rural Foundation. Recommended for   │   │
│  │   immediate formal audit referral."                     │   │
│  │                                                         │   │
│  │  Recommended Action: Formal audit referral              │   │
│  │                                    [↺ Regenerate]       │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  TABS                                                           │
│  [Funding History] [Risk Flags] [Loop Map] [Duplicates]         │
│  [Governance]      [Case Notes]                                 │
├─────────────────────────────────────────────────────────────────┤
│  TAB CONTENT (see each tab spec below)                          │
└─────────────────────────────────────────────────────────────────┘
```

**Tab 1 — Funding History**
- Headline: "Total public funding received by year and source"
- Stacked bar chart (Recharts): X=fiscal year, Y=dollar amount, stacked bars = Federal (blue) / Alberta (green)
- Below chart: data table with columns: Year | Source | Department | Amount | Purpose
- Stat callouts: "Total received: $X.XM" | "Years active: X" | "Last funding year: XXXX"

**Tab 2 — Risk Flags**
- For each of the 4 flags: a card with:
  - Flag name + icon + color
  - Status: ✅ TRIGGERED / — NOT TRIGGERED
  - Criteria met (each criterion listed as a bullet with green/red indicator)
  - The actual data point that triggered it ("CRA filing ceased: March 2024. Last grant received: July 2023. Gap: 8 months.")
  - Points contributed to risk score
- This tab is the "why we flagged this" explanation. Auditors must be able to defend a referral — this gives them the evidence.

**Tab 3 — Loop Map**
- Headline: "Circular funding network involving this organization"
- D3 force-directed graph:
  - Nodes = organizations (circle, sized by total funding)
  - Edges = money transfers (arrows with dollar amounts)
  - Red highlighted edges = the circular path
  - Current org node pulsing/highlighted
  - Click any node → opens that org's case file
- Below graph: loop summary table: Org A → Org B → Org C → Org A | Total: $X | Years: XXXX–XXXX
- If no loop: "No circular funding patterns detected for this organization."

**Tab 4 — Duplicate Funding**
- Headline: "Federal and provincial funding for the same purpose"
- Side-by-side comparison table:
  | Year | Federal Source | Federal Amount | AB Source | AB Amount | Purpose Match |
  |---|---|---|---|---|---|
- Total duplicate overlap callout: "$X.XM potentially duplicated across X years"
- If no duplicate: "No overlapping federal/provincial funding detected."

**Tab 5 — Governance**
- Headline: "Directors and their connections to other funded organizations"
- Director list: each director as a card with name, years on board, link to other orgs they direct
- Mini network showing connection to other flagged orgs (if applicable)
- "X directors share board seats with Y other publicly-funded organizations"

**Tab 6 — Case Notes**
- Free text area: "Add investigation notes..."
- Save button (saves to localStorage keyed by BN — persists in browser)
- Case status selector: Open → Under Review → Escalated → Closed → Cleared
- Assigned analyst field
- Timeline of status changes
- "Export Full Case File as PDF" button (triggers PDF generation endpoint)

---

### Component Library

All components live in `frontend/src/components/`:

```
components/
├── ui/
│   ├── RiskBadge.tsx         # Colored score badge (0-100 + tier label)
│   ├── FlagBadge.tsx         # Emoji + label flag badge (zombie/loop/etc)
│   ├── StatCard.tsx          # Big number + label + optional trend
│   ├── OrgCard.tsx           # Card used in flagged feed + search results
│   ├── SearchBar.tsx         # Main search with mode detection
│   ├── LoadingSkeleton.tsx   # Skeleton placeholders while loading
│   └── EmptyState.tsx        # Empty/no results state
├── charts/
│   ├── FundingBarChart.tsx   # Stacked bar: funding by year + source
│   ├── RiskBreakdownBar.tsx  # Horizontal bars: each flag's contribution
│   └── LoopNetworkGraph.tsx  # D3 force-directed loop visualization
├── case-file/
│   ├── CaseFileHeader.tsx    # Org name, BN, risk score, action buttons
│   ├── AIBrief.tsx           # AI brief panel with streaming + regenerate
│   ├── FundingTab.tsx
│   ├── RiskFlagsTab.tsx
│   ├── LoopMapTab.tsx
│   ├── DuplicatesTab.tsx
│   ├── GovernanceTab.tsx
│   └── CaseNotesTab.tsx
├── layout/
│   ├── Header.tsx            # Top nav with logo + search
│   ├── ProblemStrip.tsx      # The 4-challenge explanation strip
│   └── StatsBar.tsx          # Live stats from /api/stats
└── pages/
    ├── HomePage.tsx
    ├── SearchPage.tsx
    ├── CaseFilePage.tsx
    └── MethodologyPage.tsx
```

---

## 6. BACKEND SPECIFICATION

### FastAPI Application Structure
```
backend/
├── main.py                  # FastAPI app, startup event, CORS config
├── db/
│   ├── postgres.py          # Postgres connection (psycopg2, used only at startup)
│   ├── duckdb_store.py      # DuckDB init, pull from Postgres, query interface
│   └── queries/
│       ├── stats.sql        # Homepage live counts
│       ├── flagged_orgs.sql # Top risk-scored orgs
│       ├── org_profile.sql  # Single org identity + basics
│       ├── org_funding.sql  # Funding timeline by year + source
│       ├── zombie_check.sql # Zombie flag evaluation
│       ├── loop_check.sql   # Loop flag evaluation
│       ├── duplicate_check.sql # Duplicate funding detection
│       ├── governance_check.sql # Director network
│       └── search.sql       # Multi-mode search query
├── services/
│   ├── risk_scorer.py       # Combines 4 flag scores into 0-100 risk score
│   ├── ai_service.py        # Gemini / Claude API integration
│   └── pdf_service.py       # PDF export generation (reportlab or weasyprint)
├── routers/
│   ├── stats.py
│   ├── search.py
│   ├── orgs.py              # All /org/{bn}/* endpoints
│   └── admin.py             # /admin/refresh endpoint
├── models/
│   ├── org.py               # Pydantic models for org data
│   ├── flags.py             # Pydantic models for flag results
│   └── responses.py         # API response shapes
└── requirements.txt
```

### All API Endpoints

```
GET  /api/health
     → { status: "ok", duckdb_loaded: true, row_counts: {...} }

GET  /api/stats
     → { zombie_count, loop_count, duplicate_count, flagged_orgs_count,
         total_flagged_funding, data_freshness_timestamp }

GET  /api/flagged-orgs?limit=50&offset=0&filter=all&sort=risk_score
     → { orgs: [OrgCard], total: number }
     filter options: all | zombie | loop | duplicate | governance
     sort options: risk_score | funding_amount | recent

GET  /api/search?q=<query>&limit=20
     → { results: [OrgCard], query_type: "bn_root"|"fuzzy"|..., total: number }

GET  /api/org/{bn}/profile
     → { bn, canonical_name, aliases, province, sector, risk_score,
         risk_tier, flags: [FlagSummary], cra_status, first_funded, last_funded,
         total_funding_federal, total_funding_ab, total_funding_cra }

GET  /api/org/{bn}/funding
     → { timeline: [{ year, federal_amount, ab_amount, cra_amount, departments }],
         total_federal, total_ab, total_cra, total_all }

GET  /api/org/{bn}/flags
     → {
         zombie: { triggered, score, criteria: [{name, met, data_point}] },
         loop: { triggered, score, loops: [LoopDetail], criteria: [...] },
         duplicate: { triggered, score, overlaps: [DuplicateDetail], criteria: [...] },
         governance: { triggered, score, directors: [DirectorDetail], criteria: [...] }
       }

GET  /api/org/{bn}/loop-map
     → { nodes: [{id, name, size, is_current}], edges: [{source, target, amount, year, is_cycle}] }

GET  /api/org/{bn}/ai-brief
     → streaming text response (Server-Sent Events)
     Claude/Gemini prompt constructed from org profile + all flags data

GET  /api/org/{bn}/export-pdf
     → PDF file download (application/pdf)

POST /api/admin/refresh
     → triggers DuckDB re-pull from Postgres
     Body: { admin_key: string }
```

### AI Service (ai_service.py)

```python
# Current: Gemini (free API key for testing)
# Hackathon day: swap GEMINI_API_KEY for ANTHROPIC_API_KEY and switch provider

import os
import google.generativeai as genai  # pip install google-generativeai
# from anthropic import Anthropic      # uncomment on hackathon day

PROVIDER = os.getenv("AI_PROVIDER", "gemini")  # "gemini" or "anthropic"

def build_brief_prompt(org_profile: dict, flags: dict) -> str:
    return f"""You are a senior Canadian government auditor assistant.
Analyze the following organization and write a concise investigation brief (3-4 sentences max).
Focus on the most serious red flags. End with a recommended action.

Organization: {org_profile['canonical_name']}
Business Number: {org_profile['bn']}
Province: {org_profile['province']}
Total Public Funding: ${org_profile['total_funding_all']:,.0f}
Last Funded: {org_profile['last_funded']}
Risk Score: {org_profile['risk_score']}/100

Zombie Flag: {'TRIGGERED' if flags['zombie']['triggered'] else 'not triggered'}
{chr(10).join([f"- {c['name']}: {c['data_point']}" for c in flags['zombie']['criteria'] if c['met']])}

Loop Flag: {'TRIGGERED' if flags['loop']['triggered'] else 'not triggered'}
{f"Loops found: {len(flags['loop']['loops'])}" if flags['loop']['triggered'] else ""}

Duplicate Flag: {'TRIGGERED' if flags['duplicate']['triggered'] else 'not triggered'}
{f"Overlap: ${sum(o['overlap_amount'] for o in flags['duplicate']['overlaps']):,.0f}" if flags['duplicate']['triggered'] else ""}

Governance Flag: {'TRIGGERED' if flags['governance']['triggered'] else 'not triggered'}

Write the investigation brief now. Be direct and factual. No preamble."""

async def generate_brief(org_profile: dict, flags: dict):
    prompt = build_brief_prompt(org_profile, flags)

    if PROVIDER == "gemini":
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        return response.text

    elif PROVIDER == "anthropic":
        # Swap in on hackathon day
        from anthropic import Anthropic
        client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text
```

---

## 7. DOCKER SETUP

### Directory Structure
```
auditlens/
├── docker-compose.yml
├── .env                     # Never committed — copy from .env.example
├── .env.example
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   └── ...
└── data/                    # DuckDB persistent volume (gitignored)
    └── .gitkeep
```

### `.env.example`
```env
# Database
POSTGRES_URL=postgresql://database_database_w2a1_user:JvqVh0msmuBrwgING68S52H0sz3wEEXI@dpg-d7auudv5r7bs738iqh70-b.replica-cyan.oregon-postgres.render.com/database_database_w2a1

# AI Provider — use "gemini" for testing, "anthropic" on hackathon day
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key_here
ANTHROPIC_API_KEY=                    # fill in on hackathon day

# Admin
ADMIN_KEY=change_this_to_a_secret

# App
VITE_API_URL=http://localhost:8000
```

### `docker-compose.yml`
```yaml
version: "3.9"

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    env_file:
      - .env
    volumes:
      - ./data:/app/data          # DuckDB file persists here
      - ./backend:/app            # Hot reload in dev
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://localhost:8000
    depends_on:
      backend:
        condition: service_healthy
    volumes:
      - ./frontend/src:/app/src    # Hot reload in dev
    restart: unless-stopped
```

### `backend/Dockerfile`
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system deps for DuckDB + psycopg2
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create data directory for DuckDB
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

### `backend/requirements.txt`
```
fastapi==0.111.0
uvicorn[standard]==0.30.1
duckdb==0.10.3
psycopg2-binary==2.9.9
google-generativeai==0.7.2
anthropic==0.28.0
pydantic==2.7.1
python-dotenv==1.0.1
reportlab==4.2.2
httpx==0.27.0
```

### `frontend/Dockerfile`
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
```

### Start Everything
```bash
# First time setup
cp .env.example .env
# Fill in your GEMINI_API_KEY in .env

# Start all services
docker compose up --build

# Or detached (background)
docker compose up --build -d

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Stop everything
docker compose down

# Stop and remove volumes (fresh start, DuckDB will re-pull)
docker compose down -v
```

**After startup:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- DuckDB pull runs automatically at backend startup (~2-3 min)
- Watch backend logs for "DuckDB ready — X rows loaded"

---

## 8. DEPLOYMENT (Hackathon Day)

### Option A: GCP Cloud Run

```bash
# Build and push images
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Backend
cd backend
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/auditlens-backend
gcloud run deploy auditlens-backend \
  --image gcr.io/YOUR_PROJECT_ID/auditlens-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars POSTGRES_URL="...",AI_PROVIDER="anthropic",ANTHROPIC_API_KEY="..." \
  --memory 2Gi \
  --cpu 2

# Frontend — update VITE_API_URL to backend Cloud Run URL first
cd ../frontend
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/auditlens-frontend
gcloud run deploy auditlens-frontend \
  --image gcr.io/YOUR_PROJECT_ID/auditlens-frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### Option B: AWS

```bash
# Backend: AWS App Runner or ECS Fargate
# Frontend: AWS Amplify or S3 + CloudFront

# Build frontend for production
cd frontend && npm run build
# dist/ folder → deploy to Amplify or S3

# Backend → App Runner via ECR push (similar to GCP steps above)
```

### Pre-Deploy Checklist
- [ ] Switch `AI_PROVIDER=anthropic` in env vars
- [ ] Add `ANTHROPIC_API_KEY` to cloud env vars
- [ ] Update `VITE_API_URL` in frontend to point to deployed backend URL
- [ ] Test `/api/health` endpoint responds on deployed backend
- [ ] Test search with a known BN works end-to-end
- [ ] Test AI brief generates correctly

---

## 9. KEY IMPLEMENTATION NOTES

### DuckDB Pull Strategy
```python
# backend/db/duckdb_store.py

import duckdb
import psycopg2
import os

DB_PATH = "/app/data/auditlens.duckdb"

def init_duckdb():
    """Pull required data from Postgres into DuckDB on startup."""
    conn = duckdb.connect(DB_PATH)

    # Install postgres extension
    conn.execute("INSTALL postgres; LOAD postgres;")

    pg_url = os.getenv("POSTGRES_URL")

    # Pull each table — adjust query to actual schema after running index.html
    tables = {
        "entity_golden_records": f"""
            CREATE OR REPLACE TABLE entity_golden_records AS
            SELECT * FROM postgres_scan('{pg_url}', 'general', 'entity_golden_records')
        """,
        # Add other tables here
    }

    for name, query in tables.items():
        print(f"Pulling {name}...")
        conn.execute(query)
        count = conn.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        print(f"  ✓ {name}: {count:,} rows")

    conn.close()
    print("DuckDB ready.")
```

### Risk Scorer
```python
# backend/services/risk_scorer.py

def calculate_risk_score(zombie: dict, loop: dict, duplicate: dict, governance: dict) -> dict:
    score = 0
    breakdown = {}

    # Zombie (max 40)
    z = 0
    if zombie.get("govt_funding_pct", 0) > 90: z += 20
    elif zombie.get("govt_funding_pct", 0) > 70: z += 15
    if zombie.get("months_to_dissolution") is not None:
        if zombie["months_to_dissolution"] <= 6: z += 30
        elif zombie["months_to_dissolution"] <= 12: z += 20
    if zombie.get("total_funding", 0) > 1_000_000: z += 10
    elif zombie.get("total_funding", 0) > 500_000: z += 5
    breakdown["zombie"] = min(z, 40)

    # Loop (max 25)
    l = 0
    if loop.get("in_loop"):
        l += 10
        if loop.get("loop_total", 0) > 500_000: l += 20
        elif loop.get("loop_total", 0) > 100_000: l += 10
        if loop.get("loop_length", 0) > 3: l += 5
    breakdown["loop"] = min(l, 25)

    # Duplicate (max 20)
    d = 0
    if duplicate.get("has_duplicate"):
        d += 10
        if duplicate.get("purpose_match"): d += 5
        if duplicate.get("overlap_amount", 0) > 250_000: d += 5
    breakdown["duplicate"] = min(d, 20)

    # Governance (max 15)
    g = 0
    if governance.get("max_director_boards", 0) >= 5: g += 15
    elif governance.get("max_director_boards", 0) >= 3: g += 8
    if governance.get("shared_directors_with_flagged"): g += 5
    breakdown["governance"] = min(g, 15)

    total = sum(breakdown.values())
    tier = "critical" if total >= 80 else "high" if total >= 60 else "medium" if total >= 40 else "low"

    return {"score": total, "tier": tier, "breakdown": breakdown}
```

### Loop Map Data Format
```python
# Expected format for /api/org/{bn}/loop-map

{
  "nodes": [
    { "id": "123456789", "name": "Sunrise Community Services", "size": 2300000, "is_current": true },
    { "id": "987654321", "name": "Northern Community Trust", "size": 890000, "is_current": false },
    { "id": "555555555", "name": "Alberta Rural Foundation", "size": 450000, "is_current": false }
  ],
  "edges": [
    { "source": "123456789", "target": "987654321", "amount": 450000, "year": 2022, "is_cycle": true },
    { "source": "987654321", "target": "555555555", "amount": 380000, "year": 2022, "is_cycle": true },
    { "source": "555555555", "target": "123456789", "amount": 290000, "year": 2023, "is_cycle": true }
  ],
  "has_loop": true,
  "loop_total": 1120000,
  "loop_length": 3
}
```

---

## 10. FRONTEND TECH STACK

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "recharts": "^2.12.0",
    "d3": "^7.9.0",
    "axios": "^1.7.0",
    "lucide-react": "^0.383.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/d3": "^7.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^3.4.0"
  }
}
```

**Note on Tailwind:** Use only core utility classes (no JIT compiler needed for the demo build).

---

## 11. METHODOLOGY PAGE

This page is important for judges. It explains:
1. **Data sources** — CRA T3010, Federal G&C, Alberta Open Data, Entity Resolution layer
2. **How risk scoring works** — exact criteria for each flag (tables from Section 3 above)
3. **What AI does** — prompt construction, what data goes in, what comes out
4. **Limitations** — what FraudsterMonsters does NOT claim (it surfaces risk signals, not guilt)
5. **How to read a case file** — brief guide for new auditors

---

## 12. DIVISION OF RESPONSIBILITIES

### MJ (Frontend + Integration)
- React app scaffold with Vite + TypeScript
- All page layouts and routing
- SearchBar component with mode detection
- OrgCard, RiskBadge, FlagBadge components
- FundingBarChart (Recharts)
- LoopNetworkGraph (D3)
- CaseFile page with all 6 tabs
- AIBrief component with streaming
- CaseNotes with localStorage persistence
- Docker Compose + frontend Dockerfile
- Deployment (frontend service)

### Partner (Backend + Data)
- Postgres connection + DuckDB pull script
- Verify exact table/column names via `index.html` schema browser
- FastAPI app with all endpoints
- Risk scorer service
- All SQL queries (zombie, loop, duplicate, governance, search)
- AI service (Gemini → Claude swap)
- PDF export
- Backend Dockerfile
- Deployment (backend service)

---

## 13. DEMO SCRIPT (60 seconds)

> "We built FraudsterMonsters — an AI investigation engine for government auditors.
>
> The problem: auditors today cross-reference CRA charity filings, federal grants, and provincial contracts manually. One investigation takes weeks.
>
> Watch. I type in an organization name. [type]
>
> Instantly, FraudsterMonsters pulls live data across 23 million government records, scores this organization across four risk dimensions — zombie signals, circular funding loops, duplicate federal-provincial funding, and governance networks — and generates an AI investigation brief.
>
> [scroll to brief] This is what a senior analyst would write after two weeks of research. We generate it in seconds.
>
> [click Loop Map tab] Here's the circular funding network — $1.2 million flowing between three organizations and returning to the origin.
>
> [click Case Notes] The auditor adds notes, escalates the case, and exports a PDF to take to their manager.
>
> This doesn't just show data. It replaces weeks of work."

---

## APPENDIX: KNOWN DATA ISSUES

Before finalizing SQL queries, review `KNOWN-DATA-ISSUES.md` in the hackathon repo. Key things to watch:
- Business Number format inconsistencies across schemas (some have RR suffix, some don't)
- `general.entity_golden_records` is the canonical source — always join through it
- CRA loop detection tables are pre-computed — verify exact table names via `index.html`
- Alberta data has fiscal year vs calendar year inconsistencies
- Some federal grant purpose codes are blank — handle NULLs in duplicate detection query
