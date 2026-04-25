# Backend Deep-Dive Guide
**Read MASTER_PLAN.md first. This doc is the implementation spec for the backend branch.**

---

## Branch Setup

```bash
# From the project root
git checkout master
git pull
git checkout -b backend/deep-dive
```

When done with a logical unit of work:
```bash
git add backend/
git commit -m "feat(backend): <description>"
# Do NOT merge to master yet — coordinate with frontend team first
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `backend/db_duckdb.py` | Add new query functions, preload new tables |
| `backend/main.py` | Add new API routes |

Do NOT touch `frontend/` on this branch.

---

## Step 1 — Preload New Tables

In `backend/db_duckdb.py`, add these 5 tables to `_PRELOAD_TABLES` (they are small enough to sync-preload):

```python
_PRELOAD_TABLES = [
    ("cra", "loops"),
    ("cra", "loop_charity_financials"),
    ("cra", "loop_financials"),
    ("cra", "loop_participants"),       # NEW — bn, loop_id, position_in_loop, sends_to, receives_from
    ("cra", "loop_edges"),              # NEW — src, dst, total_amt, edge_count, min_year, max_year, years
    ("cra", "loop_edge_year_flows"),    # NEW — loop_id, hop_idx, src, dst, year_flow, gift_count
    ("cra", "identified_hubs"),         # NEW — bn, legal_name, scc_id, in_degree, out_degree, hub_type
    ("cra", "scc_summary"),             # NEW — scc_id, node_count, total_internal_flow
    ("ab", "ab_sole_source"),
]
```

All of these JSONL files exist in `data/cra/` and are under 4MB each (fast to load).

---

## Step 2 — New Query Functions in db_duckdb.py

Add all functions below to `db_duckdb.py`. Follow the existing pattern: use `_read()` to get the table name, then `query()` to execute SQL. Always use `TRY_CAST(x AS DOUBLE)` for numeric fields.

---

### 2a. `get_loops_enriched_live(min_hops, max_hops, min_flow, max_flow, same_year_only, risk_level, classification, limit)`

Extends the existing `get_loops_live()` to add:
- `suspicion_score` (computed, 0–8)
- `phantom_receipts` (total_flow × hops, only when same_year=true, else 0)
- `classification` ("high_alert" | "suspicious" | "normal")
- `avg_program_pct` (avg program_spending/total_expenditures across participants)

**New parameter**: `classification: str = ""` — filter by "high_alert", "suspicious", "normal", or "" for all.

```python
def get_loops_enriched_live(
    min_hops: int = 2,
    max_hops: int = 6,
    min_flow: float = 0,
    max_flow: float = 0,
    same_year_only: bool = False,
    risk_level: str = "",
    classification: str = "",
    limit: int = 200,
) -> list[dict]:
    loops_tbl = _read("cra", "loops")
    lf_tbl    = _read("cra", "loop_financials")
    lcf_tbl   = _read("cra", "loop_charity_financials")
    hubs_tbl  = _read("cra", "identified_hubs")

    # Build WHERE clauses
    where = [f"l.hops BETWEEN {min_hops} AND {max_hops}"]
    if min_flow > 0:
        where.append(f"TRY_CAST(l.total_flow AS DOUBLE) >= {min_flow}")
    if max_flow > 0:
        where.append(f"TRY_CAST(l.total_flow AS DOUBLE) <= {max_flow}")
    if same_year_only:
        where.append("lf.same_year = true")
    where_sql = " AND ".join(where)

    sql = f"""
    WITH loop_base AS (
        SELECT
            l.id, l.hops, l.path_bns, l.path_display,
            TRY_CAST(l.bottleneck_amt AS DOUBLE) as bottleneck_amt,
            TRY_CAST(l.total_flow AS DOUBLE) as total_flow,
            l.min_year, l.max_year,
            COALESCE(lf.same_year, false) as same_year,
            CASE WHEN COALESCE(lf.same_year, false)
                 THEN TRY_CAST(l.total_flow AS DOUBLE) * l.hops
                 ELSE 0 END as phantom_receipts
        FROM {loops_tbl} l
        LEFT JOIN {lf_tbl} lf ON lf.loop_id = l.id
        WHERE {where_sql}
    ),
    participant_stats AS (
        SELECT
            lp.loop_id,
            AVG(TRY_CAST(lcf.program_spending AS DOUBLE) /
                NULLIF(TRY_CAST(lcf.total_expenditures AS DOUBLE), 0)) as avg_program_pct,
            AVG(TRY_CAST(lcf.circular_outflow AS DOUBLE) /
                NULLIF(TRY_CAST(lcf.revenue AS DOUBLE), 0)) as avg_circular_pct,
            BOOL_OR(h.bn IS NOT NULL) as has_hub
        FROM {_read("cra", "loop_participants")} lp
        LEFT JOIN {lcf_tbl} lcf ON lcf.bn = lp.bn
        LEFT JOIN {hubs_tbl} h ON h.bn = lp.bn
        GROUP BY lp.loop_id
    ),
    scored AS (
        SELECT
            lb.*,
            COALESCE(ps.avg_program_pct, 0.5) as avg_program_pct,
            COALESCE(ps.avg_circular_pct, 0) as avg_circular_pct,
            COALESCE(ps.has_hub, false) as has_hub,
            -- Suspicion score
            (CASE WHEN lb.same_year THEN 3 ELSE 0 END
            + CASE WHEN COALESCE(ps.avg_circular_pct, 0) > 0.30 THEN 2 ELSE 0 END
            + CASE WHEN COALESCE(ps.avg_program_pct, 0.5) < 0.40 THEN 2 ELSE 0 END
            + CASE WHEN lb.hops <= 3 AND NOT COALESCE(ps.has_hub, false) THEN 1 ELSE 0 END
            - CASE WHEN COALESCE(ps.has_hub, false) THEN 3 ELSE 0 END
            ) as suspicion_score
        FROM loop_base lb
        LEFT JOIN participant_stats ps ON ps.loop_id = lb.id
    )
    SELECT *,
        CASE
            WHEN suspicion_score >= 6 THEN 'high_alert'
            WHEN suspicion_score >= 3 THEN 'suspicious'
            ELSE 'normal'
        END as classification,
        CASE
            WHEN suspicion_score >= 500000 THEN 'high'
            WHEN bottleneck_amt >= 50000 THEN 'medium'
            ELSE 'low'
        END as risk_level
    FROM scored
    ORDER BY suspicion_score DESC, phantom_receipts DESC, total_flow DESC
    LIMIT {limit}
    """

    rows = query(sql)
    # Add path resolution
    for r in rows:
        if not r.get("path_display") or "RR0001" in r.get("path_display", ""):
            r["path_display"] = _resolve_path(r.get("path_bns") or [])
    return rows
```

---

### 2b. `get_loops_stats_enriched_live()` — Extended Stats

Replaces `get_loops_stats_live()` with additional fields.

**Returns:**
```json
{
  "total_loops": 5808,
  "total_flow": 4418465014.0,
  "same_year_count": 402,
  "high_risk_count": 6,
  "phantom_receipts_total": 28400000.0,
  "high_alert_count": 42,
  "suspicious_count": 805,
  "normal_count": 4961,
  "max_flow": 84137641.0,
  "max_hops": 6
}
```

```python
def get_loops_stats_enriched_live() -> dict:
    loops_tbl = _read("cra", "loops")
    lf_tbl    = _read("cra", "loop_financials")
    try:
        rows = query(f"""
            SELECT
                COUNT(*) as total_loops,
                SUM(TRY_CAST(l.total_flow AS DOUBLE)) as total_flow,
                SUM(CASE WHEN lf.same_year THEN 1 ELSE 0 END) as same_year_count,
                SUM(CASE WHEN TRY_CAST(l.bottleneck_amt AS DOUBLE) > 500000 THEN 1 ELSE 0 END) as high_risk_count,
                SUM(CASE WHEN lf.same_year
                    THEN TRY_CAST(l.total_flow AS DOUBLE) * l.hops ELSE 0 END) as phantom_receipts_total,
                MAX(TRY_CAST(l.total_flow AS DOUBLE)) as max_flow,
                MAX(l.hops) as max_hops
            FROM {loops_tbl} l
            LEFT JOIN {lf_tbl} lf ON lf.loop_id = l.id
        """)
        r = rows[0] if rows else {}
        return {
            "total_loops": int(r.get("total_loops") or 0),
            "total_flow": float(r.get("total_flow") or 0),
            "same_year_count": int(r.get("same_year_count") or 0),
            "high_risk_count": int(r.get("high_risk_count") or 0),
            "phantom_receipts_total": float(r.get("phantom_receipts_total") or 0),
            "max_flow": float(r.get("max_flow") or 5_000_000),
            "max_hops": int(r.get("max_hops") or 6),
        }
    except Exception as e:
        print(f"[DuckDB] get_loops_stats_enriched_live error: {e}")
        return {"total_loops": 0, "total_flow": 0, "same_year_count": 0,
                "high_risk_count": 0, "phantom_receipts_total": 0,
                "max_flow": 5_000_000, "max_hops": 6}
```

---

### 2c. `get_loop_detail_live(loop_id)` — Full Loop Detail

Called when a user expands a row or opens the case file.

**Returns:**
```json
{
  "loop": { "id": 1, "hops": 3, ... },
  "participants": [
    {
      "bn": "123RR0001",
      "name": "Org Name",
      "position": 1,
      "sends_to": "456RR0001",
      "receives_from": "789RR0001",
      "revenue": 450000.0,
      "circular_outflow": 120000.0,
      "circular_outflow_pct": 0.267,
      "program_pct": 0.34,
      "admin_pct": 0.41,
      "compensation_pct": 0.25
    }
  ],
  "timeline": [
    { "year": 2020, "flow": 80000.0 },
    { "year": 2021, "flow": 100000.0 }
  ]
}
```

```python
def get_loop_detail_live(loop_id: int) -> dict:
    loops_tbl   = _read("cra", "loops")
    lf_tbl      = _read("cra", "loop_financials")
    lp_tbl      = _read("cra", "loop_participants")
    lcf_tbl     = _read("cra", "loop_charity_financials")
    leyf_tbl    = _read("cra", "loop_edge_year_flows")

    loop_rows = query(f"""
        SELECT l.*, lf.same_year, lf.total_flow_window
        FROM {loops_tbl} l
        LEFT JOIN {lf_tbl} lf ON lf.loop_id = l.id
        WHERE l.id = {loop_id}
    """)
    if not loop_rows:
        return {}
    loop = loop_rows[0]
    loop["total_flow"] = float(loop.get("total_flow") or 0)
    loop["bottleneck_amt"] = float(loop.get("bottleneck_amt") or 0)

    participants = query(f"""
        SELECT
            lp.bn, lp.position_in_loop, lp.sends_to, lp.receives_from,
            lcf.legal_name as name,
            TRY_CAST(lcf.revenue AS DOUBLE) as revenue,
            TRY_CAST(lcf.circular_outflow AS DOUBLE) as circular_outflow,
            TRY_CAST(lcf.circular_inflow AS DOUBLE) as circular_inflow,
            TRY_CAST(lcf.program_spending AS DOUBLE) as program_spending,
            TRY_CAST(lcf.admin_spending AS DOUBLE) as admin_spending,
            TRY_CAST(lcf.compensation_spending AS DOUBLE) as compensation_spending,
            TRY_CAST(lcf.total_expenditures AS DOUBLE) as total_expenditures
        FROM {lp_tbl} lp
        LEFT JOIN {lcf_tbl} lcf ON lcf.bn = lp.bn
        WHERE lp.loop_id = {loop_id}
        ORDER BY lp.position_in_loop
    """)
    for p in participants:
        rev = p.get("revenue") or 0
        exp = p.get("total_expenditures") or 0
        p["circular_outflow_pct"] = round(p.get("circular_outflow", 0) / rev, 3) if rev > 0 else 0
        p["program_pct"] = round(p.get("program_spending", 0) / exp, 3) if exp > 0 else 0
        p["admin_pct"]   = round(p.get("admin_spending", 0) / exp, 3) if exp > 0 else 0
        p["compensation_pct"] = round(p.get("compensation_spending", 0) / exp, 3) if exp > 0 else 0
        if not p.get("name"):
            names = _get_bn_names()
            p["name"] = names.get(p["bn"], p["bn"][:9])

    timeline_rows = query(f"""
        SELECT year_flow as year, SUM(TRY_CAST(year_flow AS DOUBLE)) as flow, gift_count
        FROM {leyf_tbl}
        WHERE loop_id = {loop_id}
        GROUP BY year_flow, gift_count
        ORDER BY year_flow
    """)
    # year_flow is actually a dict {"year": amount} — parse it
    # Actually loop_edge_year_flows has year_flow as a JSON object. Handle carefully:
    timeline = []
    for r in query(f"SELECT DISTINCT hop_idx, src, dst FROM {leyf_tbl} WHERE loop_id = {loop_id}"):
        pass  # timeline built from year data — implement based on actual schema

    return {"loop": loop, "participants": participants, "timeline": timeline}
```

> **Note**: The `year_flow` field in `loop_edge_year_flows` is a JSON object `{"2020": 50000, "2021": 75000}`. Parse it in Python, not SQL, by fetching the raw row and using `json.loads(r["year_flow"])` if it's a string, or directly if DuckDB returns it as a dict.

---

### 2d. `get_director_loop_intersections_live(min_boards, limit)` — Self-Dealing Detection

Finds directors whose multiple organizations appear **in the same loop together**.

**Returns list of:**
```json
{
  "first_name": "John",
  "last_name": "Smith",
  "board_count": 4,
  "self_dealing_loops": 2,
  "controlled_flow": 850000.0,
  "organizations": [
    { "bn": "123RR0001", "name": "Org A", "loops_count": 3 }
  ],
  "intersecting_loops": [
    { "loop_id": 42, "hops": 3, "total_flow": 500000.0, "same_year": true }
  ]
}
```

```python
def get_director_loop_intersections_live(min_boards: int = 2, limit: int = 50) -> list[dict]:
    dir_tbl = _read("cra", "cra_directors")
    lp_tbl  = _read("cra", "loop_participants")
    lcf_tbl = _read("cra", "loop_charity_financials")
    loops_tbl = _read("cra", "loops")
    lf_tbl  = _read("cra", "loop_financials")

    sql = f"""
    WITH director_bns AS (
        SELECT
            LOWER(TRIM(first_name)) as fn,
            LOWER(TRIM(last_name)) as ln,
            LEFT(bn, 9) as bn_root
        FROM {dir_tbl}
        WHERE last_name IS NOT NULL AND first_name IS NOT NULL
          AND last_name != '' AND first_name != ''
    ),
    multi_board AS (
        SELECT fn, ln, COUNT(DISTINCT bn_root) as board_count,
               LIST(DISTINCT bn_root) as bn_roots
        FROM director_bns
        GROUP BY fn, ln
        HAVING COUNT(DISTINCT bn_root) >= {min_boards}
    ),
    -- Find loops where 2+ of this director's orgs appear
    loop_intersect AS (
        SELECT mb.fn, mb.ln, lp.loop_id, COUNT(DISTINCT lp.bn) as orgs_in_loop
        FROM multi_board mb
        JOIN {lp_tbl} lp ON LEFT(lp.bn, 9) = ANY(mb.bn_roots)
        GROUP BY mb.fn, mb.ln, lp.loop_id
        HAVING COUNT(DISTINCT lp.bn) >= 2
    )
    SELECT
        mb.fn as first_name, mb.ln as last_name,
        mb.board_count,
        COUNT(DISTINCT li.loop_id) as self_dealing_loops,
        mb.bn_roots
    FROM multi_board mb
    LEFT JOIN loop_intersect li ON li.fn = mb.fn AND li.ln = mb.ln
    GROUP BY mb.fn, mb.ln, mb.board_count, mb.bn_roots
    HAVING COUNT(DISTINCT li.loop_id) > 0
    ORDER BY self_dealing_loops DESC, mb.board_count DESC
    LIMIT {limit}
    """
    rows = query(sql)
    names = _get_bn_names()
    for r in rows:
        bn_roots = r.get("bn_roots") or []
        r["organizations"] = [
            {"bn": bn + "RR0001", "name": names.get(bn + "RR0001") or names.get(bn, bn)}
            for bn in bn_roots
        ]
        r["self_dealing_loops"] = int(r.get("self_dealing_loops") or 0)
        r["board_count"] = int(r.get("board_count") or 0)
    return rows
```

---

### 2e. `get_entity_case_file_live(bn)` — Full Entity Dossier

Called by `/api/entity/:bn`. Returns everything about one organization.

**Returns:**
```json
{
  "bn": "123456789RR0001",
  "name": "Org Name",
  "designation": "C",
  "category": "190",
  "funding_history": [
    { "year": 2020, "federal": 100000, "provincial": 50000, "total_govt": 150000, "revenue": 400000, "govt_pct": 0.375 }
  ],
  "loops": [ { "loop_id": 42, "hops": 3, "total_flow": 500000, "same_year": true, "suspicion_score": 7 } ],
  "loop_count": 3,
  "circular_outflow": 120000.0,
  "circular_outflow_pct": 0.267,
  "program_pct": 0.34,
  "flags": ["zombie", "loop_participant", "same_year_loop"],
  "red_flag_count": 3
}
```

```python
def get_entity_case_file_live(bn: str) -> dict:
    gfbc_tbl = _read("cra", "govt_funding_by_charity")
    lcf_tbl  = _read("cra", "loop_charity_financials")
    lp_tbl   = _read("cra", "loop_participants")
    loops_tbl = _read("cra", "loops")
    lf_tbl   = _read("cra", "loop_financials")
    id_tbl   = _read("cra", "cra_identification")

    # Funding history
    funding = query(f"""
        SELECT fiscal_year as year,
               TRY_CAST(federal AS DOUBLE) as federal,
               TRY_CAST(provincial AS DOUBLE) as provincial,
               TRY_CAST(municipal AS DOUBLE) as municipal,
               TRY_CAST(total_govt AS DOUBLE) as total_govt,
               TRY_CAST(revenue AS DOUBLE) as revenue,
               TRY_CAST(govt_share_of_rev AS DOUBLE) as govt_pct,
               legal_name as name
        FROM {gfbc_tbl}
        WHERE bn = '{bn}'
        ORDER BY fiscal_year
    """)

    # Financial profile
    profile = query(f"""
        SELECT legal_name as name, designation, category,
               TRY_CAST(circular_outflow AS DOUBLE) as circular_outflow,
               TRY_CAST(circular_inflow AS DOUBLE) as circular_inflow,
               TRY_CAST(revenue AS DOUBLE) as revenue,
               TRY_CAST(program_spending AS DOUBLE) as program_spending,
               TRY_CAST(total_expenditures AS DOUBLE) as total_expenditures,
               loops_count
        FROM {lcf_tbl} WHERE bn = '{bn}'
    """)

    # Loop memberships
    loops = query(f"""
        SELECT l.id as loop_id, l.hops, TRY_CAST(l.total_flow AS DOUBLE) as total_flow,
               lf.same_year, l.min_year, l.max_year
        FROM {lp_tbl} lp
        JOIN {loops_tbl} l ON l.id = lp.loop_id
        LEFT JOIN {lf_tbl} lf ON lf.loop_id = l.id
        WHERE lp.bn = '{bn}'
        ORDER BY l.total_flow DESC
        LIMIT 20
    """)

    pf = profile[0] if profile else {}
    rev = pf.get("revenue") or 0
    exp = pf.get("total_expenditures") or 0
    circ = pf.get("circular_outflow") or 0
    prog = pf.get("program_spending") or 0

    flags = []
    if any(l.get("same_year") for l in loops): flags.append("same_year_loop")
    if loops: flags.append("loop_participant")
    if rev > 0 and circ / rev > 0.3: flags.append("high_circular_dependency")
    if exp > 0 and prog / exp < 0.3: flags.append("low_program_delivery")

    return {
        "bn": bn,
        "name": pf.get("name") or (funding[0].get("name") if funding else bn),
        "designation": pf.get("designation", ""),
        "category": pf.get("category", ""),
        "funding_history": funding,
        "loops": loops,
        "loop_count": int(pf.get("loops_count") or len(loops)),
        "circular_outflow": circ,
        "circular_outflow_pct": round(circ / rev, 3) if rev > 0 else 0,
        "program_pct": round(prog / exp, 3) if exp > 0 else 0,
        "flags": flags,
        "red_flag_count": len(flags),
    }
```

---

### 2f. `get_zombie_loop_crossref_live(limit)` — Zombie × Loop Cross-Reference

Finds zombie orgs (stopped filing) that were participating in loops.

**Returns list of zombies enriched with `loop_count` and `was_in_loop` boolean.**

```python
def get_zombie_loop_crossref_live(min_funding: float = 100000, limit: int = 50) -> list[dict]:
    # Get zombies first
    zombies = get_zombies_live(min_funding, limit * 2)
    if not zombies:
        return []

    lp_tbl = _read("cra", "loop_participants")
    lcf_tbl = _read("cra", "loop_charity_financials")

    # Get loop participation counts for all zombie BNs
    bns = [f"'{z['bn']}'" for z in zombies if z.get("bn")]
    if not bns:
        return zombies

    loop_counts = query(f"""
        SELECT bn, COUNT(DISTINCT loop_id) as loop_count
        FROM {lp_tbl}
        WHERE bn IN ({",".join(bns)})
        GROUP BY bn
    """)
    loop_map = {r["bn"]: r["loop_count"] for r in loop_counts}

    for z in zombies:
        z["loop_count"] = loop_map.get(z.get("bn"), 0)
        z["was_in_loop"] = z["loop_count"] > 0

    return sorted(zombies[:limit], key=lambda x: (-x["loop_count"], -(x.get("total_govt_funding") or 0)))
```

---

### 2g. `get_dashboard_featured_cases_live()` — Pre-Built Featured Cases for Dashboard

Returns 5 hand-picked high-impact entities for the Dashboard "Featured Cases" section.

```python
def get_dashboard_featured_cases_live() -> list[dict]:
    """Return top entities ranked by composite alarm score for Dashboard."""
    lcf_tbl = _read("cra", "loop_charity_financials")
    lf_tbl  = _read("cra", "loop_financials")
    lp_tbl  = _read("cra", "loop_participants")

    rows = query(f"""
        SELECT
            lcf.bn, lcf.legal_name as name,
            lcf.loops_count,
            TRY_CAST(lcf.circular_outflow AS DOUBLE) as circular_outflow,
            TRY_CAST(lcf.revenue AS DOUBLE) as revenue,
            TRY_CAST(lcf.circular_outflow AS DOUBLE) /
                NULLIF(TRY_CAST(lcf.revenue AS DOUBLE), 0) as outflow_pct,
            TRY_CAST(lcf.program_spending AS DOUBLE) /
                NULLIF(TRY_CAST(lcf.total_expenditures AS DOUBLE), 0) as program_pct,
            -- Count same-year loops
            COUNT(CASE WHEN lf.same_year THEN 1 END) as same_year_loops
        FROM {lcf_tbl} lcf
        LEFT JOIN {lp_tbl} lp ON lp.bn = lcf.bn
        LEFT JOIN {lf_tbl} lf ON lf.loop_id = lp.loop_id
        WHERE lcf.loops_count >= 3
        GROUP BY lcf.bn, lcf.legal_name, lcf.loops_count,
                 lcf.circular_outflow, lcf.revenue, lcf.program_spending, lcf.total_expenditures
        ORDER BY same_year_loops DESC, lcf.loops_count DESC,
                 TRY_CAST(lcf.circular_outflow AS DOUBLE) DESC
        LIMIT 5
    """)

    for r in rows:
        rev = r.get("revenue") or 0
        circ = r.get("circular_outflow") or 0
        prog_pct = r.get("program_pct") or 0
        same_yr = r.get("same_year_loops") or 0
        flags = []
        if same_yr > 0: flags.append(f"{same_yr} same-year loops")
        if rev > 0 and circ / rev > 0.2: flags.append(f"{circ/rev*100:.0f}% circular outflow")
        if prog_pct < 0.4: flags.append(f"only {prog_pct*100:.0f}% to programs")
        r["flags"] = flags
        r["same_year_loops"] = int(same_yr)

    return rows
```

---

## Step 3 — New API Routes in main.py

Add all routes below. Place them in this order (specific before generic, `/loops/stats` before `/loops`):

```python
# Existing order is correct — add new routes in these positions:

@app.get("/api/loops/stats")           # update to call get_loops_stats_enriched_live
@app.get("/api/loops/charities")       # unchanged
@app.get("/api/loops/detail/{loop_id}") # NEW
@app.get("/api/loops")                 # update to call get_loops_enriched_live
@app.get("/api/loops/graph")           # unchanged
@app.get("/api/governance/self-dealing") # NEW
@app.get("/api/governance")            # unchanged
@app.get("/api/zombies/loop-crossref") # NEW
@app.get("/api/zombies")               # unchanged
@app.get("/api/entity/{bn}")           # NEW — case file
@app.get("/api/dashboard/featured")   # NEW
```

### Route Specs

```python
@app.get("/api/loops/stats")
def get_loops_stats():
    # Replace existing call with:
    return _duck.cached("loops_stats_enriched", _duck.get_loops_stats_enriched_live)


@app.get("/api/loops/detail/{loop_id}")
def get_loop_detail(loop_id: int):
    return _duck.get_loop_detail_live(loop_id)


@app.get("/api/loops")
def get_funding_loops(
    min_hops: int = Query(2),
    max_hops: int = Query(6),
    min_flow: float = Query(default=0.0, ge=0),
    max_flow: float = Query(default=0.0, ge=0),
    same_year_only: bool = Query(default=False),
    risk_level: str = Query(default=""),
    classification: str = Query(default=""),   # NEW PARAM
    limit: int = Query(100),
):
    cache_key = f"loops_enriched:{min_hops}:{max_hops}:{min_flow}:{max_flow}:{same_year_only}:{risk_level}:{classification}:{limit}"
    results = _duck.cached(cache_key, _duck.get_loops_enriched_live,
                           min_hops, max_hops, min_flow, max_flow,
                           same_year_only, risk_level, classification, limit)
    return {"results": results, "count": len(results), "query_mode": "duckdb-live"}


@app.get("/api/governance/self-dealing")
def get_self_dealing_directors(
    min_boards: int = Query(default=2),
    limit: int = Query(default=50),
):
    cache_key = f"self_dealing:{min_boards}:{limit}"
    results = _duck.cached(cache_key, _duck.get_director_loop_intersections_live, min_boards, limit)
    return {"results": results, "count": len(results), "query_mode": "duckdb-live"}


@app.get("/api/zombies/loop-crossref")
def get_zombie_loop_crossref(
    min_funding: float = Query(default=100000),
    limit: int = Query(default=50),
):
    cache_key = f"zombie_loop_crossref:{min_funding}:{limit}"
    results = _duck.cached(cache_key, _duck.get_zombie_loop_crossref_live, min_funding, limit)
    return {"results": results, "count": len(results), "query_mode": "duckdb-live"}


@app.get("/api/entity/{bn}")
def get_entity_case_file(bn: str):
    # Validate BN format
    if len(bn) < 9:
        raise HTTPException(400, "Invalid BN format")
    return _duck.cached(f"entity:{bn}", _duck.get_entity_case_file_live, bn)


@app.get("/api/dashboard/featured")
def get_dashboard_featured():
    return _duck.cached("dashboard_featured", _duck.get_dashboard_featured_cases_live)
```

---

## Step 4 — Validation & Testing

After implementing, run these curl checks:

```bash
# 1. Stats includes phantom receipts
curl http://localhost:8000/api/loops/stats | python3 -m json.tool
# Expected: phantom_receipts_total > 0, high_alert_count field present

# 2. Loops have suspicion_score and classification
curl "http://localhost:8000/api/loops?limit=3" | python3 -c \
  "import sys,json; rows=json.load(sys.stdin)['results']; print([(r['classification'],r['suspicion_score']) for r in rows])"

# 3. Filter by classification
curl "http://localhost:8000/api/loops?classification=high_alert&limit=5" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d['count'], 'high alert loops')"

# 4. Loop detail
curl http://localhost:8000/api/loops/detail/1 | python3 -m json.tool

# 5. Self-dealing directors
curl "http://localhost:8000/api/governance/self-dealing?limit=3" | python3 -m json.tool

# 6. Zombie cross-ref
curl "http://localhost:8000/api/zombies/loop-crossref?limit=3" | python3 -m json.tool

# 7. Entity case file (use a BN from loops data)
curl "http://localhost:8000/api/entity/888078425RR0001" | python3 -m json.tool

# 8. Dashboard featured
curl http://localhost:8000/api/dashboard/featured | python3 -m json.tool
```

---

## Merge Instructions

When backend work is complete and tested:
```bash
git checkout master
git merge backend/deep-dive --no-ff -m "merge: backend deep-dive features"
# Notify frontend team: "Backend merged. All new endpoints live on master."
```

Frontend team should then:
```bash
git checkout frontend/deep-dive
git rebase master  # pick up new endpoints
```
