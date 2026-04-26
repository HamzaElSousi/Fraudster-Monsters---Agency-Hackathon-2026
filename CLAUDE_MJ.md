# CLAUDE_MJ.md — MJ's Context | Agency 2026 Hackathon
# Challenges 6 (Related Parties), 8 (Duplicative Funding), 10 (Adverse Media)

---

## Read This First

This file is MJ's personal context file. Hamza's CLAUDE.md covers challenges 1, 3, 4.
Do NOT modify CLAUDE.md — that is Hamza's file.
Before touching any code:
1. Read this file fully
2. Read backend/db_duckdb.py to understand existing query patterns
3. Read backend/main.py to understand existing route patterns
4. Read frontend/src/api.js to understand existing fetch patterns
5. Read frontend/src/App.jsx to understand routing and sidebar structure

---

## Project Overview

Two narrative streams, one codebase:
- **Hamza:** Challenges 1 (Zombies), 3 (Funding Loops), 4 (Sole Source)
- **MJ:** Challenges 6 (Related Parties), 8 (Duplicative Funding), 10 (Adverse Media)

The app is already running and functional with Hamza's challenges.
MJ adds new pages, new backend endpoints, and new DuckDB queries on top.

---

## Running the App

**Docker only — do not use start.sh (WSL-only)**

```bash
docker-compose up --build   # after any code change
docker-compose up           # subsequent runs if no code changed
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- All frontend API calls use relative paths through nginx proxy

---

## Critical Frontend Convention

All API calls must use relative paths — never hardcode localhost:8000.

```javascript
// CORRECT
const API_BASE = import.meta.env.VITE_API_URL || '';
fetch(`${API_BASE}/api/duplicative-funding`)

// WRONG — causes CORS errors
fetch('http://localhost:8000/api/duplicative-funding')
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python · FastAPI · DuckDB (embedded, reads JSONL directly) |
| Frontend | React 19 · Vite · React Router (JavaScript not TypeScript) |
| Visualization | Apache ECharts (installed) · D3 for network graphs |
| AI | Gemini API — key in backend/.env as GEMINI_API_KEY |
| Deployment | Docker + nginx — frontend :3000, backend :8000 |

---

## Data Available

```
data/
├── cra/       # CRA T3010 charity filings
├── fed/       # Federal grants and contributions
├── ab/        # Alberta grants, contracts, sole-source
└── general/   # Entity resolution — entity_golden_records.jsonl is here
```

---

## DuckDB Critical Rules

### Confirmed Table Names (verified against real running instance)

| Data | _read() call | Actual DuckDB table name |
|---|---|---|
| Entity golden records | `_read("general", "entity_golden_records")` | `general__entity_golden_records` |
| CRA directors | `_read("cra", "cra_directors")` | `cra__cra_directors` |
| CRA identification | `_read("cra", "cra_identification")` | `cra__cra_identification` |
| Govt funding by charity | `_read("cra", "govt_funding_by_charity")` | `cra__govt_funding_by_charity` |
| Federal grants | `_read("fed", "grants_contributions")` | `fed__grants_contributions` |
| Alberta sole source | `_read("ab", "ab_sole_source")` | `ab__ab_sole_source` |

**Pattern:** always double underscore between schema and table.
**Always use `_read()` — never hardcode table names directly.**

### union_by_name fix is already applied
entity_golden_records.jsonl has rows with varying schemas.
db_duckdb.py line 112 already has `union_by_name=true` applied. Do not remove it.

### Syntax differences from PostgreSQL

```python
# Arrays
# PostgreSQL: WHERE dataset_sources @> '{ab,fed}'::text[]
# DuckDB:
WHERE list_contains(dataset_sources, 'ab')
  AND list_contains(dataset_sources, 'fed')

# Type casting
# PostgreSQL: ::numeric
# DuckDB: TRY_CAST(x AS DOUBLE)

# JSON access (same syntax)
cra_profile->>'city'
TRY_CAST(fed_profile->>'total_grants' AS DOUBLE)
```

### Follow existing patterns exactly
- Use `_read("schema", "table")` to get table names
- Use `query(sql)` to execute — returns list[dict]
- Use `TRY_CAST` for ALL numeric fields
- Never use raw f-string user input in SQL — use parameters

---

## What MJ Is Building

### New Pages
1. **DuplicativeFunding.jsx** → `/duplicative-funding` — Challenge 8 sector explorer
2. **RelatedParties.jsx** → `/related-parties` — Challenge 6 director network
3. **AdverseMedia.jsx** → `/adverse-media` — Challenge 10 public record view
4. **RiskLeaderboard.jsx** → `/risk-leaderboard` — Combined risk across all 3
5. **DirectorProfile.jsx** → `/director/:name` — Per-director case file

### EntityCaseFile.jsx — Extend, Don't Replace
Hamza built this at `/entity/:bn`. MJ adds new sections for challenges 6, 8, 10.
Do NOT rebuild it — extend it.

### New Backend Files
- `backend/adverse_media.py` — Google News RSS + Gemini scoring
- `backend/risk_scorer.py` — Combined 0-100 risk score

---

## New API Endpoints (add to main.py)

```python
GET /api/duplicative-funding
    ?min_fed=1000000&min_ab=1000000&limit=50

GET /api/related-parties
    ?min_orgs=3&limit=50

GET /api/adverse-media/{bn}

GET /api/risk-leaderboard
    ?limit=20

GET /api/director/{name}

GET /api/sector-summary
```

---

## DuckDB Query Functions (add to db_duckdb.py)

### Challenge 8 — Duplicative Funding

```python
def get_duplicative_funding_live(min_fed=1000000, min_ab=1000000, limit=50):
    tbl = _read("general", "entity_golden_records")
    rows = query(f"""
        SELECT
            id,
            canonical_name,
            entity_type,
            dataset_sources,
            cra_profile->>'city' as city,
            cra_profile->>'province' as province,
            TRY_CAST(fed_profile->>'total_grants' AS DOUBLE) as fed_total,
            TRY_CAST(fed_profile->>'grant_count' AS INTEGER) as fed_grant_count,
            fed_profile->'top_departments' as fed_departments,
            TRY_CAST(ab_profile->>'total_grants' AS DOUBLE) as ab_total,
            TRY_CAST(ab_profile->>'payment_count' AS INTEGER) as ab_payment_count,
            ab_profile->'ministries' as ab_ministries,
            TRY_CAST(fed_profile->>'total_grants' AS DOUBLE) +
            TRY_CAST(ab_profile->>'total_grants' AS DOUBLE) as combined_gov_funding,
            ROUND(
                TRY_CAST(ab_profile->>'total_grants' AS DOUBLE) /
                NULLIF(
                    TRY_CAST(fed_profile->>'total_grants' AS DOUBLE) +
                    TRY_CAST(ab_profile->>'total_grants' AS DOUBLE), 0
                ) * 100
            , 1) as ab_pct,
            aliases,
            llm_authored
        FROM {tbl}
        WHERE list_contains(dataset_sources, 'ab')
          AND list_contains(dataset_sources, 'cra')
          AND list_contains(dataset_sources, 'fed')
          AND entity_type NOT IN ('government')
          AND canonical_name NOT ILIKE '%university%'
          AND canonical_name NOT ILIKE '%college%'
          AND canonical_name NOT ILIKE '%school division%'
          AND TRY_CAST(fed_profile->>'total_grants' AS DOUBLE) > {min_fed}
          AND TRY_CAST(ab_profile->>'total_grants' AS DOUBLE) > {min_ab}
        ORDER BY combined_gov_funding DESC
        LIMIT {limit}
    """)
    return rows
```

### Challenge 6 — Related Parties

```python
def get_related_parties_live(min_orgs=3, limit=50):
    directors_tbl = _read("cra", "cra_directors")
    entities_tbl = _read("general", "entity_golden_records")
    rows = query(f"""
        SELECT
            d.first_name,
            d.last_name,
            COUNT(DISTINCT e.id) as org_count,
            SUM(
                TRY_CAST(e.fed_profile->>'total_grants' AS DOUBLE) +
                TRY_CAST(e.ab_profile->>'total_grants' AS DOUBLE)
            ) as total_gov_funding,
            LIST(DISTINCT e.canonical_name) as organizations,
            LIST(DISTINCT CAST(e.id AS VARCHAR)) as entity_ids
        FROM {directors_tbl} d
        JOIN {entities_tbl} e ON e.bn_root = LEFT(d.bn, 9)
        WHERE list_contains(e.dataset_sources, 'ab')
          AND list_contains(e.dataset_sources, 'fed')
          AND e.entity_type NOT IN ('government')
          AND TRY_CAST(e.fed_profile->>'total_grants' AS DOUBLE) > 100000
          AND TRY_CAST(e.ab_profile->>'total_grants' AS DOUBLE) > 100000
        GROUP BY d.first_name, d.last_name
        HAVING COUNT(DISTINCT e.id) >= {min_orgs}
        ORDER BY total_gov_funding DESC
        LIMIT {limit}
    """)
    return rows
```

### Director Profile

```python
def get_director_profile_live(first_name: str, last_name: str):
    directors_tbl = _read("cra", "cra_directors")
    entities_tbl = _read("general", "entity_golden_records")
    rows = query(f"""
        SELECT
            e.canonical_name,
            e.entity_type,
            e.bn_root,
            d.position,
            TRY_CAST(e.fed_profile->>'total_grants' AS DOUBLE) as fed_total,
            TRY_CAST(e.ab_profile->>'total_grants' AS DOUBLE) as ab_total,
            TRY_CAST(e.fed_profile->>'total_grants' AS DOUBLE) +
            TRY_CAST(e.ab_profile->>'total_grants' AS DOUBLE) as combined_funding,
            e.dataset_sources
        FROM {directors_tbl} d
        JOIN {entities_tbl} e ON e.bn_root = LEFT(d.bn, 9)
        WHERE UPPER(d.first_name) = UPPER('{first_name}')
          AND UPPER(d.last_name) = UPPER('{last_name}')
        ORDER BY combined_funding DESC
    """)
    return rows
```

---

## Gemini API — adverse_media.py

```python
import os, json, httpx, urllib.parse
from xml.etree import ElementTree

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
)

async def search_google_news(org_name: str) -> list:
    query = f'"{org_name}" (fraud OR investigation OR sanction OR charges OR misconduct)'
    url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=en-CA&gl=CA&ceid=CA:en"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url)
    root = ElementTree.fromstring(r.content)
    return [
        {
            "headline": item.findtext("title"),
            "date": item.findtext("pubDate"),
            "source": item.findtext("source"),
            "link": item.findtext("link"),
        }
        for item in root.findall(".//item")[:5]
    ]

async def score_with_gemini(org_name: str, articles: list) -> dict:
    prompt = f"""
You are an investigative analyst for a government accountability tool.
Organization: {org_name}
Articles: {json.dumps(articles)}

Classify adverse media risk:
- RED: fraud, criminal investigation, regulatory enforcement, sanctions
- YELLOW: allegations, audits, complaints, concerning patterns
- GREEN: no adverse findings

Return ONLY valid JSON, no markdown:
{{
  "rating": "RED|YELLOW|GREEN",
  "summary": "2-3 sentence plain English summary",
  "key_articles": [{{"headline": "...", "date": "...", "source": "...", "severity": "high|medium|low"}}],
  "confidence": "high|medium|low"
}}
"""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(GEMINI_URL, json={"contents": [{"parts": [{"text": prompt}]}]})
    text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text.replace("```json", "").replace("```", "").strip())

async def get_adverse_media(org_name: str) -> dict:
    articles = await search_google_news(org_name)
    if not articles:
        return {"rating": "GREEN", "summary": "No adverse media found.",
                "key_articles": [], "confidence": "low"}
    return await score_with_gemini(org_name, articles)
```

---

## Risk Scoring — risk_scorer.py

```python
def compute_risk_score(entity: dict, director_data: dict, media_data: dict) -> dict:
    score = 0
    breakdown = {}

    # Challenge 8 — Funding Duplication (max 40)
    fed = entity.get("fed_total") or 0
    ab = entity.get("ab_total") or 0
    ab_pct = entity.get("ab_pct") or 0
    ch8 = 0
    if fed > 1_000_000 and ab > 1_000_000: ch8 += 10
    if fed > 10_000_000 and ab > 10_000_000: ch8 += 10
    if 40 <= ab_pct <= 60: ch8 += 10
    if len(entity.get("fed_departments") or []) >= 5: ch8 += 5
    if len(entity.get("ab_ministries") or []) >= 5: ch8 += 5
    breakdown["duplication"] = ch8
    score += ch8

    # Challenge 6 — Governance Overlap (max 35)
    ch6 = 0
    org_count = director_data.get("org_count") or 0
    if org_count >= 3: ch6 += 15
    if org_count >= 5: ch6 += 10
    if (director_data.get("total_gov_funding") or 0) > 100_000_000: ch6 += 10
    breakdown["governance"] = ch6
    score += ch6

    # Challenge 10 — Adverse Media (max 25)
    ch10 = 0
    rating = (media_data.get("rating") or "GREEN").upper()
    if rating == "RED": ch10 = 25
    elif rating == "YELLOW": ch10 = 10
    breakdown["adverse_media"] = ch10
    score += ch10

    return {
        "score": min(score, 100),
        "breakdown": breakdown,
        "rating": "HIGH" if score >= 60 else "MEDIUM" if score >= 30 else "LOW"
    }
```

---

## Key Validated Findings (Headline Stats)

Verified against real database:
- **2,840 orgs** receiving federal + Alberta + CRA funding simultaneously
- **$85.7B federal** + **$243.8B Alberta** = **$330.4B** true government funding
- **Newcomer/immigrant services** — highest duplication concentration sector
- **Calgary Homeless Foundation** ($611M): 47.7% fed / 52.3% AB — most evenly split
- **Homeward Trust Edmonton** ($757M): 71.5% fed / 28.5% AB
- **Nazrina Umarji**: governs 4 immigrant services orgs, $250M combined
- **MITACS**: $3.16B total — 99.3% federal, 0.7% Alberta

---

## UI/UX Conventions (Match Hamza's Style)

CSS variables already defined in index.css:
- `var(--status-critical)` — red, high risk
- `var(--status-medium)` — amber, suspicious
- `var(--status-low)` — green, normal
- `var(--accent-purple)` — primary accent
- `var(--text-muted)` — secondary text
- `var(--bg-card)` — card background
- `var(--border-primary)` — border color

Existing utility functions in api.js (use these, don't recreate):
- `Fe(n)` — dollar formatting e.g. "$1.2M"
- `$t(n)` — dollar formatting with billions
- `Ar(n)` — number formatting with commas

Existing CSS classes:
- `className="card"` — card container
- `className="data-table-container"` + `className="data-table"` — tables
- `className="badge critical|medium|low|info"` — status badges
- `className="loading-shimmer"` — skeleton loading
- `className="animate-in"` — page entrance animation

---

## Sidebar Addition (App.jsx)

Add after existing nav links:

```jsx
<div className="sidebar-section-label">Cross-Government Analysis</div>
<NavLink to="/duplicative-funding" className={({isActive}) => `nav-link ${isActive ? "active" : ""}`}>
  <span className="nav-link-icon">💸</span>Duplicative Funding
</NavLink>
<NavLink to="/related-parties" className={({isActive}) => `nav-link ${isActive ? "active" : ""}`}>
  <span className="nav-link-icon">🕸️</span>Related Parties
</NavLink>
<NavLink to="/adverse-media" className={({isActive}) => `nav-link ${isActive ? "active" : ""}`}>
  <span className="nav-link-icon">📰</span>Adverse Media
</NavLink>
<NavLink to="/risk-leaderboard" className={({isActive}) => `nav-link ${isActive ? "active" : ""}`}>
  <span className="nav-link-icon">⚠️</span>Risk Leaderboard
</NavLink>
```

Add routes in Routes section:
```jsx
<Route path="/duplicative-funding" element={<DuplicativeFunding />} />
<Route path="/related-parties" element={<RelatedParties />} />
<Route path="/adverse-media" element={<AdverseMedia />} />
<Route path="/risk-leaderboard" element={<RiskLeaderboard />} />
<Route path="/director/:name" element={<DirectorProfile />} />
```

---

## Pre-Computation (Night Before April 29)

Run adverse media pipeline before demo:
```bash
docker exec fraudster-monsters---agency-hackathon-2026-backend-1 \
  python3 precompute_adverse_media.py
```

Saves to `data/adverse_media_cache.json` and `data/risk_scores_cache.json`.
Backend serves from cache during demo — no live Gemini calls needed.

---

## Hackathon Constraints

- **Code freeze:** 2PM April 29, 2026
- **Judging:** Impact · Technical depth · AI integration · Presentation
- **Data:** All official Canadian government open data — nothing fabricated
- **Demo fallback:** If Gemini fails, show "Media scan pending" — never crash
- **Branch:** `feature/mj-challenges-6-8-10` → merge to master before demo
