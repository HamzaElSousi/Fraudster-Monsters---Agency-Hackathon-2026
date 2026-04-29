"""
DuckDB query engine — queries JSONL data files directly.
No PostgreSQL required. Set DATA_DIR env var to the extracted data directory.
"""

import os
import re
import json
import time
import threading
import duckdb

_conn = None
_loaded_tables: set[str] = set()
_conn_lock = threading.Lock()
# Per-table locks: prevents loading the same table twice, but different tables load concurrently
_table_locks: dict[str, threading.Lock] = {}
_table_locks_meta = threading.Lock()  # protects the _table_locks dict itself


def _get_table_lock(tname: str) -> threading.Lock:
    with _table_locks_meta:
        if tname not in _table_locks:
            _table_locks[tname] = threading.Lock()
        return _table_locks[tname]

# Sync-preloaded at startup (fast tables only — large ones already in hackathon.duckdb)
_PRELOAD_TABLES = [
    ("cra", "loops"),
    ("cra", "loop_charity_financials"),
    ("cra", "loop_financials"),
    ("cra", "loop_participants"),
    ("cra", "loop_edges"),
    ("cra", "loop_edge_year_flows"),
    ("cra", "identified_hubs"),
    ("cra", "scc_summary"),
    ("cra", "cra_directors"),
    ("cra", "cra_identification"),
    ("cra", "govt_funding_by_charity"),
    ("ab", "ab_sole_source"),
    ("general", "entity_golden_records"),
    ("fed", "grants_contributions"),
]

# Result cache: key → (timestamp, result)
_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()
_CACHE_TTL = 600  # 10 minutes


def cached(key: str, fn, *args):
    now = time.time()
    with _cache_lock:
        if key in _cache and now - _cache[key][0] < _CACHE_TTL:
            return _cache[key][1]
    result = fn(*args)
    with _cache_lock:
        _cache[key] = (now, result)
    return result


def _base() -> str:
    # Default: <repo_root>/data — works on any machine without DATA_DIR set
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.getenv("DATA_DIR", os.path.join(repo_root, "data"))


def get_conn() -> duckdb.DuckDBPyConnection:
    global _conn
    if _conn is None:
        db_path = os.environ.get("DUCKDB_PATH") or os.path.join(_base(), "hackathon.duckdb")
        _conn = duckdb.connect(db_path)
        _conn.execute("SET threads=4; SET memory_limit='3GB';")
    return _conn


def _path(schema: str, table: str) -> str:
    return os.path.join(_base(), schema, f"{table}.jsonl").replace("\\", "/")


def _available(schema: str, table: str) -> bool:
    p = _path(schema, table)
    return os.path.exists(p) and os.path.getsize(p) > 1000


def _tname(schema: str, table: str) -> str:
    return f"{schema}__{table}"


def _ensure_table(schema: str, table: str) -> str:
    """Load JSONL into a persistent DuckDB table if not already loaded. Returns table name."""
    tname = _tname(schema, table)
    if tname in _loaded_tables:
        return tname
    lock = _get_table_lock(tname)
    with lock:
        if tname in _loaded_tables:
            return tname
        with _conn_lock:
            db = get_conn()
            exists = db.execute(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = ?", [tname]
            ).fetchone()[0]
        if exists:
            _loaded_tables.add(tname)
            return tname
        p = _path(schema, table)
        if not os.path.exists(p):
            raise FileNotFoundError(f"JSONL not found: {p}")
        t0 = time.time()
        print(f"[DuckDB] Loading {tname} ...", flush=True)
        with _conn_lock:
            db = get_conn()
            db.execute(f"CREATE TABLE IF NOT EXISTS {tname} AS SELECT * FROM read_json_auto('{p}', format=newline_delimited, union_by_name=true)")
        _loaded_tables.add(tname)
        print(f"[DuckDB] {tname} ready ({time.time()-t0:.1f}s)", flush=True)
        return tname


def _read(schema: str, table: str) -> str:
    """Return table name if preloaded, else fall back to read_json_auto."""
    try:
        return _ensure_table(schema, table)
    except Exception:
        p = _path(schema, table)
        return f"read_json_auto('{p}', format=newline_delimited)"


def query(sql: str) -> list[dict]:
    try:
        with _conn_lock:
            db = get_conn()
            r = db.execute(sql)
            cols = [d[0] for d in r.description]
            return [dict(zip(cols, row)) for row in r.fetchall()]
    except Exception as e:
        print(f"[DuckDB] Query error: {e}")
        return []


def preload_tables_sync():
    """Sync-load fast tables before server accepts requests."""
    print("[DuckDB] Loading fast tables…", flush=True)
    for schema, table in _PRELOAD_TABLES:
        if not _available(schema, table):
            continue
        try:
            _ensure_table(schema, table)
        except Exception as e:
            print(f"[DuckDB] Preload failed for {schema}/{table}: {e}", flush=True)
    print("[DuckDB] Ready — serving requests", flush=True)


# ── Name cache for BN → charity name resolution ───────────────────────────────
_bn_name_cache: dict[str, str] = {}

def _get_bn_names() -> dict[str, str]:
    global _bn_name_cache
    if _bn_name_cache:
        return _bn_name_cache
    try:
        lcf = _read("cra", "loop_charity_financials")
        rows = query(f"SELECT bn, legal_name FROM {lcf}")
        _bn_name_cache = {r["bn"]: r["legal_name"] for r in rows if r.get("bn")}
    except Exception:
        pass
    return _bn_name_cache


def _resolve_path(path_bns: list | str) -> str:
    """Convert a list of BNs to a readable charity name path."""
    if isinstance(path_bns, str):
        # Already a string like "BN1→BN2→BN3"
        bns = [b.strip() for b in path_bns.replace("→", "→").split("→")]
    else:
        bns = path_bns or []
    names = _get_bn_names()
    resolved = []
    for bn in bns:
        name = names.get(bn) or names.get(bn[:9] + "RR0001") or bn[:9]
        resolved.append(name)
    return " → ".join(resolved)


# ── Zombies (Challenge #1) ────────────────────────────────────────────────────
def get_zombies_live(min_funding: float = 100000, limit: int = 50) -> list[dict]:
    """
    Zombie detection via govt_funding_by_charity.
    Identifies high-govt-dependency charities that stopped filing after 2022.
    """
    gov = _read("cra", "govt_funding_by_charity")
    ident = _read("cra", "cra_identification")

    sql = f"""
        WITH last_filing AS (
            SELECT bn, MAX(fiscal_year) as last_year
            FROM {ident}
            GROUP BY bn
        ),
        best_govt_year AS (
            SELECT
                g.bn,
                g.legal_name,
                g.designation,
                g.category,
                g.fiscal_year,
                TRY_CAST(g.govt_share_of_rev AS DOUBLE) as govt_share_pct,
                TRY_CAST(g.total_govt AS DOUBLE) as total_govt_funding,
                TRY_CAST(g.revenue AS DOUBLE) as revenue,
                ROW_NUMBER() OVER (
                    PARTITION BY g.bn
                    ORDER BY TRY_CAST(g.total_govt AS DOUBLE) DESC NULLS LAST
                ) as rn
            FROM {gov} g
            WHERE TRY_CAST(g.govt_share_of_rev AS DOUBLE) >= 70.0
              AND TRY_CAST(g.total_govt AS DOUBLE) >= {min_funding}
              AND g.legal_name NOT LIKE '%GOVERNMENT%'
              AND g.legal_name NOT LIKE '%PROVINCE%'
              AND g.legal_name NOT LIKE '%MINISTRY%'
        )
        SELECT
            b.bn,
            b.legal_name,
            b.category,
            b.designation,
            b.govt_share_pct,
            b.revenue,
            b.total_govt_funding,
            b.fiscal_year as last_funded_year,
            lf.last_year as last_filing_year,
            CASE
                WHEN lf.last_year <= 2021 THEN 'critical'
                WHEN lf.last_year <= 2022 THEN 'high'
                ELSE 'medium'
            END as risk_level
        FROM best_govt_year b
        JOIN last_filing lf ON lf.bn = b.bn
        WHERE b.rn = 1
          AND lf.last_year <= 2022
        ORDER BY b.total_govt_funding DESC
        LIMIT {limit}
    """
    rows = query(sql)
    for r in rows:
        r["id"] = abs(hash(r["bn"])) % 1_000_000
        r["canonical_name"] = r.pop("legal_name", "")
        r["primary_bn"] = r.get("bn", "")
        r["entity_type"] = "charity"
        r["registration_status"] = "Inactive (ceased filing)"
        r["status_date"] = f"{r.get('last_filing_year', 'unknown')}-12-31"
        r["fed_funding"] = float(r.get("total_govt_funding") or 0)
        r["ab_funding"] = 0.0
        r["total_public_funding"] = float(r.get("total_govt_funding") or 0)
        r["govt_revenue_pct"] = round(float(r.get("govt_share_pct") or 0), 1)
        r["last_filing_year"] = str(r.get("last_filing_year", ""))
        r["dataset_sources"] = ["cra"]
        r["addresses"] = []
    return rows


# ── Funding Loops (Challenge #3) ──────────────────────────────────────────────
def get_loops_live(
    min_hops: int = 2,
    max_hops: int = 6,
    min_flow: float = 0.0,
    max_flow: float = 0.0,      # 0 = no upper limit
    same_year_only: bool = False,
    risk_level: str = "",       # "high", "medium", "low", or ""
    limit: int = 100,
) -> list[dict]:
    loops_tbl = _read("cra", "loops")
    fin_tbl = _read("cra", "loop_financials")

    # Build optional WHERE clause fragments
    flow_filters = f"AND COALESCE(TRY_CAST(l.total_flow AS DOUBLE), 0) >= {min_flow}"
    if max_flow > 0:
        flow_filters += f"\n    AND COALESCE(TRY_CAST(l.total_flow AS DOUBLE), 0) <= {max_flow}"

    same_year_filter = "AND lf.same_year = true" if same_year_only else ""

    _VALID_RISK = {'high', 'medium', 'low'}
    risk_filter = f"WHERE risk_level = '{risk_level}'" if risk_level in _VALID_RISK else ""

    sql = f"""
        WITH loops_with_risk AS (
            SELECT
                l.id, l.hops, l.path_bns, l.path_display,
                l.bottleneck_amt, l.total_flow, l.min_year, l.max_year,
                lf.same_year, lf.bottleneck_window, lf.total_flow_window,
                CASE
                    WHEN TRY_CAST(l.bottleneck_amt AS DOUBLE) > 500000 THEN 'high'
                    WHEN TRY_CAST(l.bottleneck_amt AS DOUBLE) > 50000  THEN 'medium'
                    ELSE 'low'
                END as risk_level
            FROM {loops_tbl} l
            LEFT JOIN {fin_tbl} lf ON lf.loop_id = l.id
            WHERE l.hops BETWEEN {min_hops} AND {max_hops}
            {flow_filters}
            {same_year_filter}
        )
        SELECT * FROM loops_with_risk
        {risk_filter}
        ORDER BY COALESCE(TRY_CAST(total_flow AS DOUBLE), 0) DESC
        LIMIT {limit}
    """
    rows = query(sql)
    # Enrich path_display with charity names
    for r in rows:
        path_bns = r.get("path_bns") or []
        if path_bns:
            r["path_display"] = _resolve_path(path_bns)
        r["bottleneck_amt"] = float(r.get("bottleneck_amt") or 0)
        r["total_flow"] = float(r.get("total_flow") or 0)
        # risk_level already present from CTE; ensure it's a string
        r["risk_level"] = r.get("risk_level") or "low"
    return rows


def get_loops_stats_live() -> dict:
    try:
        loops_tbl = _read("cra", "loops")
        fin_tbl = _read("cra", "loop_financials")

        base = query(f"""
            SELECT
                COUNT(*) as total_loops,
                MAX(COALESCE(TRY_CAST(total_flow AS DOUBLE), 0)) as max_flow,
                SUM(COALESCE(TRY_CAST(total_flow AS DOUBLE), 0)) as sum_flow,
                MAX(hops) as max_hops,
                COUNT(CASE WHEN TRY_CAST(bottleneck_amt AS DOUBLE) > 500000 THEN 1 END) as high_risk_count
            FROM {loops_tbl}
        """)

        same_year_count = 0
        try:
            if _available("cra", "loop_financials"):
                sy = query(f"SELECT COUNT(*) as n FROM {fin_tbl} WHERE same_year = true")
                same_year_count = sy[0]["n"] if sy else 0
        except Exception:
            pass

        r = base[0] if base else {}
        return {
            "total_loops": int(r.get("total_loops") or 0),
            "max_flow": float(r.get("max_flow") or 0),
            "total_flow": float(r.get("sum_flow") or 0),
            "max_hops": int(r.get("max_hops") or 6),
            "high_risk_count": int(r.get("high_risk_count") or 0),
            "same_year_count": same_year_count,
        }
    except Exception as e:
        print(f"[DuckDB] loops stats error: {e}")
        return {"total_loops": 0, "max_flow": 0, "total_flow": 0, "max_hops": 6, "high_risk_count": 0, "same_year_count": 0}


def get_top_loop_charities_live(limit: int = 50) -> list[dict]:
    try:
        lcf_tbl = _read("cra", "loop_charity_financials")
        rows = query(f"""
            SELECT
                bn,
                legal_name as name,
                loops_count,
                TRY_CAST(circular_outflow AS DOUBLE) as circular_outflow,
                TRY_CAST(circular_inflow AS DOUBLE) as circular_inflow,
                TRY_CAST(revenue AS DOUBLE) as revenue,
                CASE
                    WHEN TRY_CAST(revenue AS DOUBLE) > 0
                    THEN TRY_CAST(circular_outflow AS DOUBLE) / TRY_CAST(revenue AS DOUBLE)
                    ELSE NULL
                END as outflow_pct,
                CASE
                    WHEN TRY_CAST(revenue AS DOUBLE) > 0
                         AND TRY_CAST(circular_outflow AS DOUBLE) / TRY_CAST(revenue AS DOUBLE) > 0.3
                    THEN 'high'
                    WHEN TRY_CAST(circular_outflow AS DOUBLE) > 50000 THEN 'medium'
                    ELSE 'low'
                END as risk
            FROM {lcf_tbl}
            WHERE loops_count IS NOT NULL
            ORDER BY loops_count DESC, TRY_CAST(circular_outflow AS DOUBLE) DESC
            LIMIT {limit}
        """)
        result = []
        for r in rows:
            result.append({
                "bn": r.get("bn"),
                "name": r.get("name") or r.get("bn", "Unknown"),
                "loops_count": int(r.get("loops_count") or 0),
                "circular_outflow": float(r.get("circular_outflow") or 0),
                "circular_inflow": float(r.get("circular_inflow") or 0),
                "revenue": float(r.get("revenue") or 0),
                "outflow_pct": float(r.get("outflow_pct") or 0),
                "risk": r.get("risk") or "low",
            })
        return result
    except Exception as e:
        print(f"[DuckDB] top charities error: {e}")
        return []


def get_loop_graph_live(limit: int = 50) -> dict:
    loops = _read("cra", "loops")
    lcf = _read("cra", "loop_charity_financials")

    sql_loops = f"""
        SELECT id, hops, path_bns, bottleneck_amt, total_flow
        FROM {loops}
        ORDER BY COALESCE(TRY_CAST(total_flow AS DOUBLE), 0) DESC
        LIMIT {limit}
    """
    loop_rows = query(sql_loops)

    # Collect unique 9-char BN roots from all loop paths
    bn9s = set()
    for l in loop_rows:
        for bn in (l.get("path_bns") or []):
            if bn:
                bn9s.add(str(bn)[:9])

    nodes = []
    links = []

    if bn9s:
        safe_bn9s = [b for b in bn9s if b and re.match(r'^[A-Za-z0-9]{9}$', str(b))]
        bn_list = "','".join(safe_bn9s[:300])
        node_sql = f"""
            SELECT
                LEFT(bn, 9) as bn,
                LEFT(bn, 9) as id,
                MAX(legal_name) as name,
                SUM(TRY_CAST(revenue AS DOUBLE)) as revenue,
                SUM(TRY_CAST(circular_outflow AS DOUBLE)) as circular_outflow,
                SUM(loops_count) as loops_count,
                CASE
                    WHEN SUM(TRY_CAST(circular_outflow AS DOUBLE)) > 0
                     AND SUM(TRY_CAST(revenue AS DOUBLE)) > 0
                     AND SUM(TRY_CAST(circular_outflow AS DOUBLE)) / SUM(TRY_CAST(revenue AS DOUBLE)) > 0.3
                        THEN 'high'
                    WHEN SUM(TRY_CAST(circular_outflow AS DOUBLE)) > 50000 THEN 'medium'
                    ELSE 'low'
                END as risk
            FROM {lcf}
            WHERE LEFT(bn, 9) IN ('{bn_list}')
            GROUP BY LEFT(bn, 9)
        """
        nodes = query(node_sql)
        # Add fallback stub nodes for BN roots not found in loop_charity_financials
        found_bn9s = {n["bn"] for n in nodes}
        stub_bn9s = [bn for bn in bn9s if bn not in found_bn9s]
        stub_name_map: dict[str, str] = {}
        if stub_bn9s:
            try:
                ident = _read("cra", "cra_identification")
                stub_bn_list = "','".join(stub_bn9s[:200])
                name_rows = query(f"""
                    SELECT LEFT(bn, 9) as bn9, MAX(legal_name) as name
                    FROM {ident}
                    WHERE LEFT(bn, 9) IN ('{stub_bn_list}')
                    GROUP BY LEFT(bn, 9)
                """)
                stub_name_map = {r["bn9"]: r["name"] for r in name_rows if r.get("name")}
            except Exception:
                pass
        for bn9 in stub_bn9s:
            nodes.append({
                "bn": bn9, "id": bn9,
                "name": stub_name_map.get(bn9, bn9 + "…"),
                "revenue": 0, "circular_outflow": 0,
                "loops_count": 1, "risk": "low",
            })

    for l in loop_rows:
        path = l.get("path_bns") or []
        path9 = [str(bn)[:9] for bn in path if bn]
        for i in range(len(path9) - 1):
            if path9[i] != path9[i + 1]:
                links.append({
                    "source": path9[i],
                    "target": path9[i + 1],
                    "flow": float(l.get("bottleneck_amt") or 0),
                    "loop_id": l.get("id"),
                })

    # Enrich loop rows
    for l in loop_rows:
        path_bns = l.get("path_bns") or []
        l["path_display"] = _resolve_path(path_bns)
        l["bottleneck_amt"] = float(l.get("bottleneck_amt") or 0)
        l["total_flow"] = float(l.get("total_flow") or 0)

    return {"nodes": nodes, "links": links, "loops": loop_rows}


# ── Governance Networks (Challenge #6) ───────────────────────────────────────
def get_governance_live(min_boards: int = 3, limit: int = 50) -> list[dict]:
    dirs = _read("cra", "cra_directors")
    gov = _read("cra", "govt_funding_by_charity")

    # Step 1: Get multi-board directors — restricted to govt-funded charities only.
    # This eliminates common-name false positives from the 91K+ total charity universe.
    sql_directors = f"""
        WITH director_boards AS (
            SELECT
                last_name, first_name,
                LEFT(bn, 9) as bn_root,
                MAX(position) as position
            FROM {dirs}
            WHERE last_name IS NOT NULL AND first_name IS NOT NULL
              AND last_name != '' AND first_name != ''
              AND LENGTH(last_name) > 1 AND LENGTH(first_name) > 1
              AND LEFT(bn, 9) IN (
                  SELECT DISTINCT LEFT(bn, 9)
                  FROM {gov}
                  WHERE TRY_CAST(total_govt AS DOUBLE) > 0
              )
            GROUP BY last_name, first_name, LEFT(bn, 9)
        )
        SELECT
            last_name, first_name,
            COUNT(DISTINCT bn_root) as board_count,
            LIST(DISTINCT position ORDER BY position) as positions,
            LIST(DISTINCT bn_root ORDER BY bn_root) as bn_roots
        FROM director_boards
        GROUP BY last_name, first_name
        HAVING COUNT(DISTINCT bn_root) >= {min_boards}
        ORDER BY board_count DESC
        LIMIT {limit}
    """
    directors = query(sql_directors)

    # Step 2: For each director, get their orgs with funding
    results = []
    # Build a BN-to-name+funding lookup
    funding_sql = f"""
        SELECT bn, legal_name, MAX(TRY_CAST(total_govt AS DOUBLE)) as total_govt
        FROM {gov}
        WHERE legal_name NOT LIKE '%GOVERNMENT%'
          AND legal_name NOT LIKE '%PROVINCE%'
        GROUP BY bn, legal_name
    """
    funding_rows = query(funding_sql)
    funding_map = {r["bn"][:9]: r for r in funding_rows}

    for d in directors:
        bn_roots = d.get("bn_roots") or []
        orgs = []
        total_funding = 0.0
        for bn_root in bn_roots[:10]:
            info = funding_map.get(bn_root[:9])
            org_funding = float(info["total_govt"] or 0) if info else 0
            total_funding += org_funding
            orgs.append({
                "bn_root": bn_root[:9],
                "name": info["legal_name"] if info else bn_root[:9],
                "entity_type": "charity",
                "fed_funding": str(int(org_funding)),
                "cra_status": "Registered",
            })

        risk_flags = []
        if d["board_count"] >= 5:
            risk_flags.append(f"Sits on {d['board_count']} funded charity boards simultaneously")
        if total_funding > 1_000_000:
            risk_flags.append(f"Controls ${total_funding:,.0f} in tracked public funding")
        if d["board_count"] >= 7:
            risk_flags.append("Governance concentration exceeds norms for accountability")

        results.append({
            "last_name": d["last_name"],
            "first_name": d["first_name"],
            "board_count": d["board_count"],
            "positions": d.get("positions") or [],
            "organizations": orgs,
            "total_controlled_funding": total_funding,
            "risk_flags": risk_flags,
        })

    return results


# ── Duplicative Funding (Challenge #8) ───────────────────────────────────────

def get_duplicative_funding_live(min_fed: float = 1_000_000, min_ab: float = 1_000_000, limit: int = 200) -> list[dict]:
    """Orgs receiving federal + Alberta + CRA funding simultaneously."""
    tbl = _read("general", "entity_golden_records")
    rows = query(f"""
        SELECT
            id,
            bn_root,
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
    for r in rows:
        r["fed_total"] = float(r.get("fed_total") or 0)
        r["ab_total"] = float(r.get("ab_total") or 0)
        r["combined_gov_funding"] = float(r.get("combined_gov_funding") or 0)
        r["ab_pct"] = float(r.get("ab_pct") or 0)
    return rows


def get_duplicative_funding_stats_live() -> dict:
    """Aggregate headline numbers for the duplicative funding page — no hardcoding."""
    tbl = _read("general", "entity_golden_records")
    rows = query(f"""
        SELECT
            COUNT(*) as total_orgs,
            SUM(TRY_CAST(fed_profile->>'total_grants' AS DOUBLE)) as total_fed,
            SUM(TRY_CAST(ab_profile->>'total_grants' AS DOUBLE)) as total_ab,
            SUM(
                TRY_CAST(fed_profile->>'total_grants' AS DOUBLE) +
                TRY_CAST(ab_profile->>'total_grants' AS DOUBLE)
            ) as total_combined
        FROM {tbl}
        WHERE list_contains(dataset_sources, 'ab')
          AND list_contains(dataset_sources, 'cra')
          AND list_contains(dataset_sources, 'fed')
          AND entity_type NOT IN ('government')
          AND canonical_name NOT ILIKE '%university%'
          AND canonical_name NOT ILIKE '%college%'
          AND canonical_name NOT ILIKE '%school division%'
          AND TRY_CAST(fed_profile->>'total_grants' AS DOUBLE) > 0
          AND TRY_CAST(ab_profile->>'total_grants' AS DOUBLE) > 0
    """)
    r = rows[0] if rows else {}
    return {
        "total_orgs": int(r.get("total_orgs") or 0),
        "total_fed": float(r.get("total_fed") or 0),
        "total_ab": float(r.get("total_ab") or 0),
        "total_combined": float(r.get("total_combined") or 0),
    }


def get_related_parties_live(min_orgs: int = 3, limit: int = 50) -> list[dict]:
    """Directors sitting on multiple orgs that each receive fed + AB funding (Challenge #6 cross-gov).
    Returns organizations and bn_roots as parallel lists ordered by canonical_name so index i = same org."""
    directors_tbl = _read("cra", "cra_directors")
    entities_tbl = _read("general", "entity_golden_records")
    rows = query(f"""
        WITH org_data AS (
            SELECT DISTINCT
                d.first_name,
                d.last_name,
                e.canonical_name,
                e.bn_root,
                TRY_CAST(e.fed_profile->>'total_grants' AS DOUBLE) +
                TRY_CAST(e.ab_profile->>'total_grants' AS DOUBLE) as combined
            FROM {directors_tbl} d
            JOIN {entities_tbl} e ON e.bn_root = LEFT(d.bn, 9)
            WHERE list_contains(e.dataset_sources, 'ab')
              AND list_contains(e.dataset_sources, 'fed')
              AND e.entity_type NOT IN ('government')
              AND TRY_CAST(e.fed_profile->>'total_grants' AS DOUBLE) > 100000
              AND TRY_CAST(e.ab_profile->>'total_grants' AS DOUBLE) > 100000
        )
        SELECT
            first_name,
            last_name,
            COUNT(*) as org_count,
            SUM(combined) as total_gov_funding,
            LIST(canonical_name ORDER BY canonical_name) as organizations,
            LIST(bn_root ORDER BY canonical_name) as bn_roots
        FROM org_data
        GROUP BY first_name, last_name
        HAVING COUNT(*) >= {min_orgs}
        ORDER BY total_gov_funding DESC
        LIMIT {limit}
    """)
    for r in rows:
        r["total_gov_funding"] = float(r.get("total_gov_funding") or 0)
    return rows


# ── Sole Source / Amendment Creep (Challenge #4) ─────────────────────────────
def get_sole_source_live(min_ratio: float = 3.0, limit: int = 50) -> list[dict]:
    """
    Find sole-source vendors near the competitive threshold and repeat patterns.
    Since ab_sole_source has one row per contract (not amendment history),
    we detect:
    - Contract splitting: same vendor, multiple small contracts near $50K threshold
    - Vendor concentration: high total sole-source spending on one vendor
    """
    ss = _read("ab", "ab_sole_source")

    sql = f"""
        WITH vendor_ministry AS (
            SELECT
                vendor,
                ministry,
                COUNT(*) as contract_count,
                SUM(TRY_CAST(amount AS DOUBLE)) as total_amount,
                MIN(TRY_CAST(amount AS DOUBLE)) as min_contract,
                MAX(TRY_CAST(amount AS DOUBLE)) as max_contract,
                LIST(DISTINCT permitted_situations ORDER BY permitted_situations) as justifications,
                LIST(DISTINCT display_fiscal_year ORDER BY display_fiscal_year) as fiscal_years,
                MIN(CAST(start_date AS VARCHAR)) as contract_date,
                MAX(CAST(end_date AS VARCHAR)) as latest_end_date
            FROM {ss}
            WHERE TRY_CAST(amount AS DOUBLE) > 0
              AND vendor IS NOT NULL AND vendor != ''
            GROUP BY vendor, ministry
            HAVING COUNT(*) >= 2
               OR SUM(TRY_CAST(amount AS DOUBLE)) > 100000
        ),
        near_threshold AS (
            SELECT
                vendor, ministry,
                COUNT(*) as near_threshold_count,
                LIST(TRY_CAST(amount AS DOUBLE)) as near_amounts
            FROM {ss}
            WHERE TRY_CAST(amount AS DOUBLE) BETWEEN 40000 AND 49999
            GROUP BY vendor, ministry
        )
        SELECT
            vm.vendor,
            vm.ministry,
            vm.contract_count,
            vm.min_contract as original_amount,
            vm.total_amount as amended_amount,
            ROUND(vm.total_amount / NULLIF(vm.min_contract, 0), 1) as amendment_ratio,
            vm.justifications,
            vm.fiscal_years,
            vm.contract_date,
            vm.latest_end_date,
            COALESCE(nt.near_threshold_count, 0) as near_threshold_count,
            CASE
                WHEN ROUND(vm.total_amount / NULLIF(vm.min_contract, 0), 1) >= 10 THEN 'critical'
                WHEN ROUND(vm.total_amount / NULLIF(vm.min_contract, 0), 1) >= 5 THEN 'high'
                ELSE 'medium'
            END as risk_level
        FROM vendor_ministry vm
        LEFT JOIN near_threshold nt ON nt.vendor = vm.vendor AND nt.ministry = vm.ministry
        WHERE ROUND(vm.total_amount / NULLIF(vm.min_contract, 0), 1) >= {min_ratio}
           OR COALESCE(nt.near_threshold_count, 0) >= 2
        ORDER BY vm.total_amount DESC
        LIMIT {limit}
    """
    rows = query(sql)

    for i, r in enumerate(rows):
        r["id"] = i + 1
        r["department"] = r.pop("ministry", "")
        r["province"] = "AB"
        r["amendment_count"] = r.pop("contract_count", 0)
        justifications = r.pop("justifications", []) or []
        r["justification"] = "; ".join(justifications)[:100] if justifications else "Sole source"

        flags = []
        near_thresh = r.pop("near_threshold_count", 0) or 0
        ratio = float(r.get("amendment_ratio") or 1)
        orig = float(r.get("original_amount") or 0)

        if near_thresh >= 2:
            flags.append(f"{near_thresh} contracts between $40K–$49.9K — potential splitting below $50K threshold")
        if orig >= 40000 and orig < 50000:
            flags.append(f"Smallest contract ${orig:,.0f} — near $50K competitive threshold")
        if ratio >= 10:
            flags.append(f"{ratio:.1f}× total growth vs smallest contract — extreme concentration")
        elif ratio >= 5:
            flags.append(f"{ratio:.1f}× total growth — significant sole-source concentration")
        if r.get("amendment_count", 0) >= 5:
            flags.append(f"{r['amendment_count']} separate contracts — repeat no-bid awards")
        r["risk_flags"] = flags

    return rows


def get_sole_source_stats_live() -> dict:
    ss = _read("ab", "ab_sole_source")
    total_sql = f"""
        SELECT
            COUNT(*) as total_contracts,
            SUM(TRY_CAST(amount AS DOUBLE)) as total_value,
            COUNT(CASE WHEN TRY_CAST(amount AS DOUBLE) BETWEEN 40000 AND 49999 THEN 1 END) as near_threshold
        FROM {ss}
        WHERE TRY_CAST(amount AS DOUBLE) > 0
    """
    rows = query(total_sql)
    if not rows:
        return {}
    r = rows[0]
    total_contracts = int(r.get("total_contracts") or 0)
    total_value = float(r.get("total_value") or 0)

    ratio_sql = f"""
        WITH vendor_totals AS (
            SELECT vendor, ministry,
                COUNT(*) as contract_count,
                SUM(TRY_CAST(amount AS DOUBLE)) as total_amount,
                MIN(TRY_CAST(amount AS DOUBLE)) as min_contract
            FROM {ss}
            WHERE TRY_CAST(amount AS DOUBLE) >= 1000
              AND vendor IS NOT NULL AND vendor != ''
            GROUP BY vendor, ministry
            HAVING COUNT(*) >= 2 AND MIN(TRY_CAST(amount AS DOUBLE)) >= 1000
        )
        SELECT
            COUNT(CASE WHEN total_amount / min_contract >= 5 THEN 1 END) as over_5x,
            COUNT(CASE WHEN total_amount / min_contract >= 10 THEN 1 END) as over_10x,
            ROUND(AVG(LEAST(total_amount / min_contract, 1000)), 1) as avg_ratio
        FROM vendor_totals
    """
    ratio_rows = query(ratio_sql)
    ratio_r = ratio_rows[0] if ratio_rows else {}

    top_sql = f"""
        WITH vendor_totals AS (
            SELECT vendor, ministry,
                COUNT(*) as contract_count,
                SUM(TRY_CAST(amount AS DOUBLE)) as total_amount,
                MIN(TRY_CAST(amount AS DOUBLE)) as min_contract
            FROM {ss}
            WHERE TRY_CAST(amount AS DOUBLE) >= 1000
              AND vendor IS NOT NULL AND vendor != ''
            GROUP BY vendor, ministry
            HAVING COUNT(*) >= 2 AND MIN(TRY_CAST(amount AS DOUBLE)) >= 1000
        )
        SELECT vendor, ministry, total_amount, min_contract,
               ROUND(total_amount / min_contract, 1) as growth_ratio,
               contract_count
        FROM vendor_totals
        WHERE total_amount >= 1000000
        ORDER BY total_amount DESC
        LIMIT 1
    """
    top_rows = query(top_sql)
    top_r = top_rows[0] if top_rows else {}

    return {
        "total_sole_source_contracts": total_contracts,
        "total_original_value": total_value,
        "total_amended_value": total_value,
        "avg_amendment_ratio": float(ratio_r.get("avg_ratio") or 1.0),
        "contracts_over_5x": int(ratio_r.get("over_5x") or 0),
        "contracts_over_10x": int(ratio_r.get("over_10x") or 0),
        "contracts_near_threshold": int(r.get("near_threshold") or 0),
        "total_at_risk": total_value,
        "top_offender_vendor": top_r.get("vendor") or "",
        "top_offender_ministry": top_r.get("ministry") or "",
        "top_offender_min_contract": float(top_r.get("min_contract") or 0),
        "top_offender_total": float(top_r.get("total_amount") or 0),
        "top_offender_growth": float(top_r.get("growth_ratio") or 0),
        "top_offender_contracts": int(top_r.get("contract_count") or 0),
    }


# ── Multi-Flag Alerts (cross-challenge) ──────────────────────────────────────
def get_alerts_live(min_flags: int = 2, limit: int = 20) -> list[dict]:
    """Cross-challenge intersection using Python-side joins to avoid DuckDB type issues."""
    gov = _read("cra", "govt_funding_by_charity")
    ident = _read("cra", "cra_identification")
    loops = _read("cra", "loops")
    dirs = _read("cra", "cra_directors")

    # Step 1: Get zombie BNs — must match zombies page definition:
    # 70%+ govt revenue, min $100K, stopped filing (last year across ALL program accounts <= 2022)
    zombie_sql = f"""
        WITH last_filing AS (
            -- Group by 9-char root so multi-account orgs use their MOST RECENT filing
            SELECT LEFT(bn, 9) as bn9, MAX(fiscal_year) as last_year
            FROM {ident}
            GROUP BY LEFT(bn, 9)
        ),
        best_govt_year AS (
            SELECT
                LEFT(g.bn, 9) as bn9,
                g.legal_name,
                TRY_CAST(g.total_govt AS DOUBLE) as total_govt_funding,
                TRY_CAST(g.govt_share_of_rev AS DOUBLE) as govt_share_pct,
                ROW_NUMBER() OVER (
                    PARTITION BY LEFT(g.bn, 9)
                    ORDER BY TRY_CAST(g.total_govt AS DOUBLE) DESC NULLS LAST
                ) as rn
            FROM {gov} g
            WHERE g.legal_name NOT LIKE '%GOVERNMENT%'
              AND g.legal_name NOT LIKE '%PROVINCE%'
              AND g.legal_name NOT LIKE '%MINISTRY%'
              AND TRY_CAST(g.govt_share_of_rev AS DOUBLE) >= 70.0
              AND TRY_CAST(g.total_govt AS DOUBLE) >= 100000
        )
        SELECT
            b.bn9 as bn,
            b.legal_name,
            b.total_govt_funding,
            b.govt_share_pct,
            lf.last_year as last_filing_year
        FROM best_govt_year b
        JOIN last_filing lf ON lf.bn9 = b.bn9
        WHERE b.rn = 1
          AND lf.last_year <= 2022
        ORDER BY b.total_govt_funding DESC
        LIMIT 1000
    """
    zombies = query(zombie_sql)
    if not zombies:
        return []

    # Step 2: Get loop BNs as a Python set (9-char prefixes)
    loop_bns_set: set[str] = set()
    try:
        loop_rows = query(f"SELECT path_bns FROM {loops} LIMIT 10000")
        for row in loop_rows:
            path = row.get("path_bns") or []
            if isinstance(path, list):
                loop_bns_set.update(bn[:9] for bn in path if bn)
            elif isinstance(path, str):
                loop_bns_set.update(bn.strip()[:9] for bn in path.split(',') if bn.strip())
    except Exception as e:
        print(f"[DuckDB] alerts loop_bns error: {e}")

    # Step 3: Get multi-board director BNs as a Python set
    # Only include directors with 3+ boards (to match get_governance_live definition)
    gov_bns_set: set[str] = set()
    try:
        gov_rows = query(f"""
            SELECT DISTINCT LEFT(bn, 9) as bn_root
            FROM {dirs}
            WHERE last_name IS NOT NULL AND first_name IS NOT NULL
              AND LENGTH(last_name) > 1 AND LENGTH(first_name) > 1
            GROUP BY last_name, first_name, LEFT(bn, 9)
            HAVING COUNT(DISTINCT LEFT(bn, 9)) >= 3
        """)
        gov_bns_set = {r["bn_root"][:9] for r in gov_rows if r.get("bn_root")}
    except Exception as e:
        print(f"[DuckDB] alerts gov_bns error: {e}")

    # Step 4: Python-side join and flag counting; deduplicate by 9-char BN prefix
    seen_bn9: set[str] = set()
    results = []
    for z in zombies:
        bn9 = (z.get("bn") or "")[:9]
        if bn9 in seen_bn9:
            continue
        seen_bn9.add(bn9)

        zombie_flag = 1
        loop_flag = 1 if bn9 in loop_bns_set else 0
        governance_flag = 1 if bn9 in gov_bns_set else 0
        alarm_count = zombie_flag + loop_flag + governance_flag

        if alarm_count < min_flags:
            continue

        flags = ["zombie"]
        if loop_flag:
            flags.append("loop")
        if governance_flag:
            flags.append("governance")

        results.append({
            "bn": bn9,
            "canonical_name": z.get("legal_name", ""),
            "total_govt_funding": float(z.get("total_govt_funding") or 0),
            "govt_share_pct": round(float(z.get("govt_share_pct") or 0), 1),
            "last_filing_year": str(z.get("last_filing_year", "")),
            "zombie_flag": zombie_flag,
            "loop_flag": loop_flag,
            "governance_flag": governance_flag,
            "alarm_count": alarm_count,
            "flags": flags,
            "risk_summary": (
                f"{round(float(z.get('govt_share_pct') or 0), 1)}% govt revenue | "
                f"ceased filing {z.get('last_filing_year', 'unknown')} | "
                + " + ".join(flags)
            ),
        })

    results.sort(key=lambda x: (-x["alarm_count"], -x["total_govt_funding"]))
    return results[:limit]


# ── Stats ─────────────────────────────────────────────────────────────────────
def get_stats_live() -> dict:
    try:
        loops_count = query(f"SELECT COUNT(*) as n FROM {_read('cra', 'loops')}")
        loop_n = loops_count[0]["n"] if loops_count else 0

        # Count (last_name, first_name) pairs on 5+ distinct GOVERNMENT-FUNDED charity boards.
        # Using 5+ boards (vs 3+) dramatically reduces common-name false positives: the probability
        # of two unrelated people sharing a name AND appearing on 5+ separate funded boards is very low.
        # Governance page still defaults to 3+ for browsing; this stat is the high-confidence headline.
        dirs = query(f"""
            SELECT COUNT(*) as n FROM (
                SELECT last_name, first_name
                FROM (
                    SELECT DISTINCT d.last_name, d.first_name, LEFT(d.bn, 9) as bn_root
                    FROM {_read('cra', 'cra_directors')} d
                    WHERE d.last_name IS NOT NULL AND d.first_name IS NOT NULL
                      AND d.last_name != '' AND d.first_name != ''
                      AND LENGTH(d.last_name) > 1 AND LENGTH(d.first_name) > 1
                      AND LEFT(d.bn, 9) IN (
                          SELECT DISTINCT LEFT(bn, 9)
                          FROM {_read('cra', 'govt_funding_by_charity')}
                          WHERE TRY_CAST(total_govt AS DOUBLE) > 0
                      )
                ) t
                GROUP BY last_name, first_name
                HAVING COUNT(DISTINCT bn_root) >= 5
            ) final
        """)
        dir_n = dirs[0]["n"] if dirs else 0

        charity_n = query(f"SELECT COUNT(DISTINCT bn) as n FROM {_read('cra', 'cra_identification')}")
        charity_count = charity_n[0]["n"] if charity_n else 0

        # Charities with at least $1 in recorded government funding — the true scope of what we analyze
        gov_funded_n = query(f"""
            SELECT COUNT(DISTINCT bn) as n FROM {_read('cra', 'govt_funding_by_charity')}
            WHERE TRY_CAST(total_govt AS DOUBLE) > 0
        """)
        gov_funded_count = gov_funded_n[0]["n"] if gov_funded_n else 0

        sole_n = query(f"SELECT COUNT(*) as n FROM {_read('ab', 'ab_sole_source')}")
        sole_count = sole_n[0]["n"] if sole_n else 0

        # Total dollar value of Alberta sole-source contracts
        ab_value_r = query(f"""
            SELECT SUM(TRY_CAST(amount AS DOUBLE)) as total
            FROM {_read('ab', 'ab_sole_source')}
            WHERE TRY_CAST(amount AS DOUBLE) > 0
        """)
        ab_contract_value = float(ab_value_r[0]["total"] or 0) if ab_value_r else 0.0

        fed_n = 0
        if _available("fed", "grants_contributions"):
            r = query(f"SELECT COUNT(*) as n FROM {_read('fed', 'grants_contributions')}")
            if r:
                fed_n = r[0]["n"]

        # Compute zombie count + at-risk funding — same definition as get_zombies_live:
        # high govt dependency (>=70% of revenue) + stopped filing by 2022 + min $100K received
        gov_tbl = _read("cra", "govt_funding_by_charity")
        ident_tbl = _read("cra", "cra_identification")
        zombie_r = query(f"""
            WITH best AS (
                SELECT g.bn, TRY_CAST(g.total_govt AS DOUBLE) as total_govt,
                       ROW_NUMBER() OVER (PARTITION BY g.bn ORDER BY TRY_CAST(g.total_govt AS DOUBLE) DESC NULLS LAST) as rn
                FROM {gov_tbl} g
                WHERE TRY_CAST(g.govt_share_of_rev AS DOUBLE) >= 70.0
                  AND TRY_CAST(g.total_govt AS DOUBLE) >= 100000
                  AND g.legal_name NOT LIKE '%GOVERNMENT%'
                  AND g.legal_name NOT LIKE '%PROVINCE%'
                  AND g.legal_name NOT LIKE '%MINISTRY%'
            ),
            lf AS (SELECT bn, MAX(fiscal_year) as last_year FROM {ident_tbl} GROUP BY bn)
            SELECT COUNT(*) as n, SUM(b.total_govt) as at_risk
            FROM best b JOIN lf ON lf.bn = b.bn
            WHERE b.rn = 1 AND lf.last_year <= 2022
        """)
        zombie_n = int(zombie_r[0]["n"]) if zombie_r else 0
        at_risk = float(zombie_r[0]["at_risk"] or 0) if zombie_r else 0.0

        # Compute total tracked public funding from govt_funding_by_charity
        # (best year per charity to avoid double-counting multi-year rows)
        funding_r = query(f"""
            SELECT SUM(total_govt) as total FROM (
                SELECT bn, MAX(TRY_CAST(total_govt AS DOUBLE)) as total_govt
                FROM {gov_tbl}
                WHERE TRY_CAST(total_govt AS DOUBLE) > 0
                GROUP BY bn
            )
        """)
        total_public = float(funding_r[0]["total"] or 0) if funding_r else 0.0

        return {
            "total_entities": gov_funded_count,   # charities with recorded govt funding
            "total_funding_loops": loop_n,
            "total_fed_grants": fed_n,
            "total_ab_grants": sole_count,         # count of AB sole-source records
            "total_ab_contract_value": ab_contract_value,  # dollar value of AB contracts
            "total_sole_source": sole_count,
            "total_charities": charity_count,
            "zombie_count": zombie_n,
            "multi_board_directors": dir_n,
            "total_public_funding": total_public,
            "at_risk_funding": at_risk,
        }
    except Exception as e:
        print(f"[DuckDB] stats error: {e}")
        return {}


def is_available() -> bool:
    return (
        _available("cra", "loops") and
        _available("cra", "cra_directors") and
        _available("ab", "ab_sole_source") and
        _available("cra", "govt_funding_by_charity")
    )


# ── Deep-Dive: Enriched Loops (Challenge #3 extended) ────────────────────────

def get_loops_enriched_live(
    min_hops: int = 2,
    max_hops: int = 6,
    min_flow: float = 0.0,
    max_flow: float = 0.0,
    same_year_only: bool = False,
    risk_level: str = "",
    classification: str = "",
    limit: int = 200,
) -> list[dict]:
    """Loops with suspicion_score, phantom_receipts, classification (high_alert/suspicious/normal)."""
    loops_tbl = _read("cra", "loops")
    lf_tbl    = _read("cra", "loop_financials")

    where_parts = [f"l.hops BETWEEN {min_hops} AND {max_hops}"]
    if min_flow > 0:
        where_parts.append(f"TRY_CAST(l.total_flow AS DOUBLE) >= {min_flow}")
    if max_flow > 0:
        where_parts.append(f"TRY_CAST(l.total_flow AS DOUBLE) <= {max_flow}")
    if same_year_only:
        where_parts.append("COALESCE(lf.same_year, false) = true")
    where_sql = " AND ".join(where_parts)

    _VALID_CLASS = {"high_alert", "suspicious", "normal"}
    _class_vals = [c for c in classification.split(",") if c in _VALID_CLASS]
    class_filter = f"AND classification IN ({', '.join(repr(c) for c in _class_vals)})" if _class_vals else ""

    try:
        lcf_tbl  = _read("cra", "loop_charity_financials")
        lp_tbl   = _read("cra", "loop_participants")
        hubs_tbl = _read("cra", "identified_hubs")

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
            FROM {lp_tbl} lp
            LEFT JOIN {lcf_tbl} lcf ON lcf.bn = lp.bn
            LEFT JOIN {hubs_tbl} h ON h.bn = lp.bn
            GROUP BY lp.loop_id
        ),
        scored AS (
            SELECT
                lb.*,
                COALESCE(ps.avg_program_pct, 0.5)  as avg_program_pct,
                COALESCE(ps.avg_circular_pct, 0)    as avg_circular_pct,
                COALESCE(ps.has_hub, false)          as has_hub,
                (CASE WHEN lb.same_year THEN 3 ELSE 0 END
                 + CASE WHEN COALESCE(ps.avg_circular_pct, 0) > 0.30 THEN 2 ELSE 0 END
                 + CASE WHEN COALESCE(ps.avg_program_pct, 0.5) < 0.40 THEN 2 ELSE 0 END
                 + CASE WHEN lb.hops <= 3 AND NOT COALESCE(ps.has_hub, false) THEN 1 ELSE 0 END
                 - CASE WHEN COALESCE(ps.has_hub, false) THEN 3 ELSE 0 END
                ) as suspicion_score
            FROM loop_base lb
            LEFT JOIN participant_stats ps ON ps.loop_id = lb.id
        ),
        classified AS (
            SELECT *,
                CASE
                    WHEN suspicion_score >= 6 THEN 'high_alert'
                    WHEN suspicion_score >= 3 THEN 'suspicious'
                    ELSE 'normal'
                END as classification,
                CASE
                    WHEN suspicion_score >= 6 THEN 'high'
                    WHEN suspicion_score >= 3 THEN 'medium'
                    ELSE 'low'
                END as risk_level
            FROM scored
        )
        SELECT * FROM classified
        WHERE 1=1 {class_filter}
        ORDER BY suspicion_score DESC, phantom_receipts DESC, total_flow DESC
        LIMIT {limit}
        """
        rows = query(sql)

    except Exception as e:
        print(f"[DuckDB] get_loops_enriched_live falling back to basic: {e}")
        rows = get_loops_live(min_hops, max_hops, min_flow, max_flow, same_year_only, risk_level, limit)
        for r in rows:
            sy = bool(r.get("same_year"))
            r["suspicion_score"] = 3 if sy else 0
            r["phantom_receipts"] = float(r.get("total_flow", 0)) * int(r.get("hops", 2)) if sy else 0
            r["classification"] = "suspicious" if sy else "normal"
            r["avg_program_pct"] = 0.0
        return rows

    for r in rows:
        path_bns = r.get("path_bns") or []
        if path_bns:
            r["path_display"] = _resolve_path(path_bns)
        r["bottleneck_amt"] = float(r.get("bottleneck_amt") or 0)
        r["total_flow"]     = float(r.get("total_flow") or 0)
        r["phantom_receipts"] = float(r.get("phantom_receipts") or 0)
        r["suspicion_score"]  = int(r.get("suspicion_score") or 0)
        r["risk_level"]       = r.get("risk_level") or "low"
    return rows


def get_loops_stats_enriched_live() -> dict:
    """Extended loop stats including phantom_receipts_total and classification counts."""
    loops_tbl = _read("cra", "loops")
    lf_tbl    = _read("cra", "loop_financials")

    try:
        lcf_tbl  = _read("cra", "loop_charity_financials")
        lp_tbl   = _read("cra", "loop_participants")
        hubs_tbl = _read("cra", "identified_hubs")
        has_scoring_tables = True
    except Exception:
        has_scoring_tables = False

    try:
        if has_scoring_tables:
            rows = query(f"""
            WITH participant_stats AS (
                SELECT
                    lp.loop_id,
                    AVG(TRY_CAST(lcf.program_spending AS DOUBLE) /
                        NULLIF(TRY_CAST(lcf.total_expenditures AS DOUBLE), 0)) as avg_program_pct,
                    AVG(TRY_CAST(lcf.circular_outflow AS DOUBLE) /
                        NULLIF(TRY_CAST(lcf.revenue AS DOUBLE), 0)) as avg_circular_pct,
                    BOOL_OR(h.bn IS NOT NULL) as has_hub
                FROM {lp_tbl} lp
                LEFT JOIN {lcf_tbl} lcf ON lcf.bn = lp.bn
                LEFT JOIN {hubs_tbl} h ON h.bn = lp.bn
                GROUP BY lp.loop_id
            ),
            scored AS (
                SELECT
                    l.hops,
                    TRY_CAST(l.total_flow AS DOUBLE)      as total_flow,
                    TRY_CAST(l.bottleneck_amt AS DOUBLE)  as bottleneck_amt,
                    COALESCE(lf.same_year, false)          as same_year,
                    (CASE WHEN COALESCE(lf.same_year, false) THEN 3 ELSE 0 END
                     + CASE WHEN COALESCE(ps.avg_circular_pct, 0) > 0.30 THEN 2 ELSE 0 END
                     + CASE WHEN COALESCE(ps.avg_program_pct, 0.5) < 0.40 THEN 2 ELSE 0 END
                     + CASE WHEN l.hops <= 3 AND NOT COALESCE(ps.has_hub, false) THEN 1 ELSE 0 END
                     - CASE WHEN COALESCE(ps.has_hub, false) THEN 3 ELSE 0 END
                    ) as suspicion_score
                FROM {loops_tbl} l
                LEFT JOIN {lf_tbl} lf ON lf.loop_id = l.id
                LEFT JOIN participant_stats ps ON ps.loop_id = l.id
            )
            SELECT
                COUNT(*)                                                            as total_loops,
                SUM(total_flow)                                                     as total_flow,
                SUM(CASE WHEN same_year THEN 1 ELSE 0 END)                        as same_year_count,
                SUM(CASE WHEN bottleneck_amt > 500000 THEN 1 ELSE 0 END)          as high_risk_count,
                SUM(CASE WHEN same_year THEN total_flow * hops ELSE 0 END)        as phantom_receipts_total,
                MAX(total_flow)                                                     as max_flow,
                MAX(hops)                                                           as max_hops,
                SUM(CASE WHEN suspicion_score >= 6 THEN 1 ELSE 0 END)             as high_alert_count,
                SUM(CASE WHEN suspicion_score >= 3 AND suspicion_score < 6
                         THEN 1 ELSE 0 END)                                        as suspicious_count,
                SUM(CASE WHEN suspicion_score < 3 THEN 1 ELSE 0 END)              as normal_count
            FROM scored
            """)
        else:
            rows = query(f"""
            SELECT
                COUNT(*) as total_loops,
                SUM(TRY_CAST(l.total_flow AS DOUBLE)) as total_flow,
                SUM(CASE WHEN lf.same_year THEN 1 ELSE 0 END) as same_year_count,
                SUM(CASE WHEN TRY_CAST(l.bottleneck_amt AS DOUBLE) > 500000 THEN 1 ELSE 0 END) as high_risk_count,
                SUM(CASE WHEN lf.same_year
                         THEN TRY_CAST(l.total_flow AS DOUBLE) * l.hops ELSE 0 END) as phantom_receipts_total,
                MAX(TRY_CAST(l.total_flow AS DOUBLE)) as max_flow,
                MAX(l.hops) as max_hops,
                SUM(CASE WHEN lf.same_year THEN 1 ELSE 0 END) as high_alert_count,
                0 as suspicious_count,
                SUM(CASE WHEN NOT COALESCE(lf.same_year, false) THEN 1 ELSE 0 END) as normal_count
            FROM {loops_tbl} l
            LEFT JOIN {lf_tbl} lf ON lf.loop_id = l.id
            """)

        r = rows[0] if rows else {}
        return {
            "total_loops":           int(r.get("total_loops") or 0),
            "total_flow":            float(r.get("total_flow") or 0),
            "same_year_count":       int(r.get("same_year_count") or 0),
            "high_risk_count":       int(r.get("high_risk_count") or 0),
            "phantom_receipts_total": float(r.get("phantom_receipts_total") or 0),
            "max_flow":              float(r.get("max_flow") or 5_000_000),
            "max_hops":              int(r.get("max_hops") or 6),
            "high_alert_count":      int(r.get("high_alert_count") or 0),
            "suspicious_count":      int(r.get("suspicious_count") or 0),
            "normal_count":          int(r.get("normal_count") or 0),
        }
    except Exception as e:
        print(f"[DuckDB] get_loops_stats_enriched_live error: {e}")
        return {
            "total_loops": 0, "total_flow": 0, "same_year_count": 0,
            "high_risk_count": 0, "phantom_receipts_total": 0,
            "max_flow": 5_000_000, "max_hops": 6,
            "high_alert_count": 0, "suspicious_count": 0, "normal_count": 0,
        }


def get_loop_detail_live(loop_id: int) -> dict:
    """Full loop detail: participants with spend breakdown + year-over-year timeline."""
    loops_tbl = _read("cra", "loops")
    lf_tbl    = _read("cra", "loop_financials")

    loop_rows = query(f"""
        SELECT l.*, lf.same_year, lf.total_flow_window
        FROM {loops_tbl} l
        LEFT JOIN {lf_tbl} lf ON lf.loop_id = l.id
        WHERE l.id = {int(loop_id)}
    """)
    if not loop_rows:
        return {}
    loop = loop_rows[0]
    loop["total_flow"]     = float(loop.get("total_flow") or 0)
    loop["bottleneck_amt"] = float(loop.get("bottleneck_amt") or 0)
    loop["path_display"]   = _resolve_path(loop.get("path_bns") or [])

    participants = []
    timeline = []
    try:
        lp_tbl   = _read("cra", "loop_participants")
        lcf_tbl  = _read("cra", "loop_charity_financials")

        participants = query(f"""
            SELECT
                lp.bn, lp.position_in_loop, lp.sends_to, lp.receives_from,
                lcf.legal_name as name,
                TRY_CAST(lcf.revenue AS DOUBLE)               as revenue,
                TRY_CAST(lcf.circular_outflow AS DOUBLE)      as circular_outflow,
                TRY_CAST(lcf.circular_inflow AS DOUBLE)       as circular_inflow,
                TRY_CAST(lcf.program_spending AS DOUBLE)      as program_spending,
                TRY_CAST(lcf.admin_spending AS DOUBLE)        as admin_spending,
                TRY_CAST(lcf.compensation_spending AS DOUBLE) as compensation_spending,
                TRY_CAST(lcf.total_expenditures AS DOUBLE)   as total_expenditures
            FROM {lp_tbl} lp
            LEFT JOIN {lcf_tbl} lcf ON lcf.bn = lp.bn
            WHERE lp.loop_id = {int(loop_id)}
            ORDER BY lp.position_in_loop
        """)
        names = _get_bn_names()
        for p in participants:
            rev = p.get("revenue") or 0
            exp = p.get("total_expenditures") or 0
            circ = p.get("circular_outflow") or 0
            prog = p.get("program_spending") or 0
            adm  = p.get("admin_spending") or 0
            comp = p.get("compensation_spending") or 0
            p["circular_outflow_pct"] = round(circ / rev, 3) if rev > 0 else 0
            p["program_pct"]           = round(prog / exp, 3) if exp > 0 else 0
            p["admin_pct"]             = round(adm  / exp, 3) if exp > 0 else 0
            p["compensation_pct"]      = round(comp / exp, 3) if exp > 0 else 0
            if not p.get("name"):
                p["name"] = names.get(p["bn"], p["bn"][:9])
    except Exception as e:
        print(f"[DuckDB] get_loop_detail_live participants error: {e}")

    try:
        leyf_tbl = _read("cra", "loop_edge_year_flows")
        raw_flows = query(f"""
            SELECT year_flow, gift_count
            FROM {leyf_tbl}
            WHERE loop_id = {int(loop_id)}
        """)
        by_year: dict[int, float] = {}
        for rf in raw_flows:
            yf = rf.get("year_flow")
            if isinstance(yf, dict):
                for yr_str, amt in yf.items():
                    try:
                        by_year[int(yr_str)] = by_year.get(int(yr_str), 0) + float(amt)
                    except Exception:
                        pass
            elif isinstance(yf, str):
                try:
                    import json as _json
                    yf_dict = _json.loads(yf)
                    for yr_str, amt in yf_dict.items():
                        by_year[int(yr_str)] = by_year.get(int(yr_str), 0) + float(amt)
                except Exception:
                    pass
        timeline = [{"year": y, "flow": v} for y, v in sorted(by_year.items())]
    except Exception as e:
        print(f"[DuckDB] get_loop_detail_live timeline error: {e}")

    return {"loop": loop, "participants": participants, "timeline": timeline}


# ── Deep-Dive: Director Self-Dealing (Challenge #6 extended) ─────────────────

def get_director_loop_intersections_live(min_boards: int = 2, limit: int = 50) -> list[dict]:
    """Directors whose multiple organizations appear together in the same funding loop."""
    dir_tbl   = _read("cra", "cra_directors")
    lp_tbl    = _read("cra", "loop_participants")
    loops_tbl = _read("cra", "loops")
    lf_tbl    = _read("cra", "loop_financials")

    try:
        sql = f"""
        WITH director_bns AS (
            SELECT
                LOWER(TRIM(first_name)) as fn,
                LOWER(TRIM(last_name))  as ln,
                LEFT(bn, 9)             as bn_root,
                COALESCE(position, '')  as position
            FROM {dir_tbl}
            WHERE last_name IS NOT NULL AND first_name IS NOT NULL
              AND last_name != '' AND first_name != ''
              AND LENGTH(last_name) > 1 AND LENGTH(first_name) > 1
        ),
        multi_board AS (
            SELECT fn, ln,
                   COUNT(DISTINCT bn_root) as board_count,
                   LIST(DISTINCT bn_root ORDER BY bn_root) as bn_roots,
                   LIST(DISTINCT position ORDER BY position) as positions
            FROM director_bns
            GROUP BY fn, ln
            HAVING COUNT(DISTINCT bn_root) >= {int(min_boards)}
        ),
        loop_intersect AS (
            SELECT mb.fn, mb.ln, lp.loop_id,
                   COUNT(DISTINCT LEFT(lp.bn, 9)) as orgs_in_loop,
                   TRY_CAST(l.total_flow AS DOUBLE) as loop_flow,
                   COALESCE(lf.same_year, false) as same_year
            FROM multi_board mb
            JOIN {lp_tbl} lp ON list_contains(mb.bn_roots, LEFT(lp.bn, 9))
            JOIN {loops_tbl} l ON l.id = lp.loop_id
            LEFT JOIN {lf_tbl} lf ON lf.loop_id = lp.loop_id
            GROUP BY mb.fn, mb.ln, lp.loop_id, l.total_flow, lf.same_year
            HAVING COUNT(DISTINCT LEFT(lp.bn, 9)) >= 1
        )
        SELECT
            mb.fn as first_name, mb.ln as last_name,
            mb.board_count,
            mb.positions,
            COUNT(DISTINCT li.loop_id)  as self_dealing_loops,
            COALESCE(SUM(li.loop_flow), 0) as controlled_flow,
            mb.bn_roots
        FROM multi_board mb
        LEFT JOIN loop_intersect li ON li.fn = mb.fn AND li.ln = mb.ln
        GROUP BY mb.fn, mb.ln, mb.board_count, mb.bn_roots, mb.positions
        HAVING COUNT(DISTINCT li.loop_id) > 0
        ORDER BY self_dealing_loops DESC, mb.board_count DESC
        LIMIT {int(limit)}
        """
        rows = query(sql)
        names = _get_bn_names()
        for r in rows:
            bn_roots = r.get("bn_roots") or []
            r["organizations"] = [
                {
                    "bn":   bn + "RR0001",
                    "name": names.get(bn + "RR0001") or names.get(bn, bn),
                }
                for bn in bn_roots
            ]
            r["positions"]          = [p for p in (r.get("positions") or []) if p]
            r["self_dealing_loops"] = int(r.get("self_dealing_loops") or 0)
            r["board_count"]        = int(r.get("board_count") or 0)
            r["controlled_flow"]    = float(r.get("controlled_flow") or 0)
        return rows
    except Exception as e:
        print(f"[DuckDB] get_director_loop_intersections_live error: {e}")
        return []


# ── Deep-Dive: Entity Case File ────────────────────────────────────────────────

def get_entity_case_file_live(bn: str) -> dict:
    """Full accountability dossier for one organization."""
    import re as _re
    bn = _re.sub(r"[^A-Za-z0-9]", "", bn)  # sanitize — prevent SQL injection
    # Loop tables store 15-char BNs (888078425RR0001); alerts/zombies return 9-char roots.
    # Always match on the 9-char prefix so both navigation paths resolve correctly.
    bn9 = bn[:9]

    gfbc_tbl  = _read("cra", "govt_funding_by_charity")
    lcf_tbl   = _read("cra", "loop_charity_financials")
    lp_tbl    = _read("cra", "loop_participants")
    loops_tbl = _read("cra", "loops")
    lf_tbl    = _read("cra", "loop_financials")

    funding = query(f"""
        SELECT fiscal_year as year,
               SUM(TRY_CAST(federal AS DOUBLE))       as federal,
               SUM(TRY_CAST(provincial AS DOUBLE))    as provincial,
               SUM(TRY_CAST(municipal AS DOUBLE))     as municipal,
               SUM(TRY_CAST(total_govt AS DOUBLE))    as total_govt,
               SUM(TRY_CAST(revenue AS DOUBLE))       as revenue,
               CASE WHEN SUM(TRY_CAST(revenue AS DOUBLE)) > 0
                    THEN ROUND(SUM(TRY_CAST(total_govt AS DOUBLE)) /
                               SUM(TRY_CAST(revenue AS DOUBLE)) * 100, 2)
                    ELSE 0 END                         as govt_pct,
               MAX(legal_name) as name
        FROM {gfbc_tbl}
        WHERE LEFT(bn, 9) = '{bn9}'
        GROUP BY fiscal_year
        ORDER BY fiscal_year
    """)

    profile = query(f"""
        WITH per_bn AS (
            SELECT bn,
                   MAX(legal_name)                                 as legal_name,
                   MAX(designation)                                as designation,
                   MAX(category)                                   as category,
                   MAX(TRY_CAST(circular_outflow AS DOUBLE))       as circular_outflow,
                   MAX(TRY_CAST(circular_inflow AS DOUBLE))        as circular_inflow,
                   MAX(TRY_CAST(revenue AS DOUBLE))                as revenue,
                   MAX(TRY_CAST(program_spending AS DOUBLE))       as program_spending,
                   MAX(TRY_CAST(total_expenditures AS DOUBLE))     as total_expenditures,
                   MAX(TRY_CAST(loops_count AS INTEGER))           as loops_count
            FROM {lcf_tbl}
            WHERE LEFT(bn, 9) = '{bn9}'
            GROUP BY bn
        )
        SELECT MAX(legal_name) as name, MAX(designation) as designation, MAX(category) as category,
               SUM(circular_outflow)     as circular_outflow,
               SUM(circular_inflow)      as circular_inflow,
               SUM(revenue)              as revenue,
               SUM(program_spending)     as program_spending,
               SUM(total_expenditures)   as total_expenditures,
               SUM(loops_count)          as loops_count
        FROM per_bn
    """)

    loops = query(f"""
        SELECT l.id as loop_id, l.hops,
               TRY_CAST(l.total_flow AS DOUBLE) as total_flow,
               lf.same_year, l.min_year, l.max_year
        FROM {lp_tbl} lp
        JOIN {loops_tbl} l ON l.id = lp.loop_id
        LEFT JOIN {lf_tbl} lf ON lf.loop_id = l.id
        WHERE LEFT(lp.bn, 9) = '{bn9}'
        ORDER BY l.total_flow DESC
        LIMIT 20
    """)

    pf   = profile[0] if profile else {}
    rev  = float(pf.get("revenue") or 0)
    exp  = float(pf.get("total_expenditures") or 0)
    circ = float(pf.get("circular_outflow") or 0)
    prog = float(pf.get("program_spending") or 0)

    # Use COUNT DISTINCT from loop_participants — more accurate than lcf.loops_count sum
    loop_count_rows = query(f"""
        SELECT COUNT(DISTINCT loop_id) as cnt FROM {lp_tbl}
        WHERE LEFT(bn, 9) = '{bn9}'
    """)
    distinct_loop_count = int((loop_count_rows[0].get("cnt") or 0) if loop_count_rows else 0)

    # circular_outflow in lcf is cumulative across years; ratio is only coherent when <= 1.0
    circ_pct = round(circ / rev, 3) if rev > 0 and circ / rev <= 1.0 else 0

    # Zombie status
    ident_tbl = _read("cra", "cra_identification")
    zombie_rows = query(f"""
        WITH last_filing AS (
            SELECT LEFT(bn, 9) as bn9, MAX(fiscal_year) as last_year
            FROM {ident_tbl}
            GROUP BY LEFT(bn, 9)
        ),
        best_govt AS (
            SELECT LEFT(bn, 9) as bn9,
                   MAX(TRY_CAST(total_govt AS DOUBLE)) as total_govt,
                   MAX(TRY_CAST(govt_share_of_rev AS DOUBLE)) as govt_share
            FROM {gfbc_tbl}
            GROUP BY LEFT(bn, 9)
        )
        SELECT bg.total_govt, bg.govt_share, lf.last_year
        FROM best_govt bg
        JOIN last_filing lf ON lf.bn9 = bg.bn9
        WHERE bg.bn9 = '{bn9}'
    """)
    zombie_r = zombie_rows[0] if zombie_rows else {}
    govt_share_val = float(zombie_r.get("govt_share") or 0)
    total_govt_val = float(zombie_r.get("total_govt") or 0)
    last_year_val = int(zombie_r.get("last_year") or 9999)
    is_zombie = govt_share_val >= 70.0 and total_govt_val >= 100000 and last_year_val <= 2022
    zombie_status = {
        "is_zombie": is_zombie,
        "last_filing_year": last_year_val if last_year_val < 9999 else None,
        "govt_share_pct": round(govt_share_val, 1),
        "total_govt_funding": total_govt_val,
    }

    # Directors for this entity + their board counts
    dirs_tbl = _read("cra", "cra_directors")
    directors = query(f"""
        WITH entity_dirs AS (
            SELECT DISTINCT last_name, first_name, MAX(position) as position
            FROM {dirs_tbl}
            WHERE LEFT(bn, 9) = '{bn9}'
              AND last_name IS NOT NULL AND last_name != ''
              AND first_name IS NOT NULL AND first_name != ''
            GROUP BY last_name, first_name
        ),
        all_boards AS (
            SELECT last_name, first_name, COUNT(DISTINCT LEFT(bn, 9)) as board_count
            FROM {dirs_tbl}
            WHERE last_name IS NOT NULL AND last_name != ''
              AND first_name IS NOT NULL AND first_name != ''
              AND LENGTH(last_name) > 1 AND LENGTH(first_name) > 1
            GROUP BY last_name, first_name
        )
        SELECT ed.last_name, ed.first_name, ed.position,
               COALESCE(ab.board_count, 1) as board_count
        FROM entity_dirs ed
        LEFT JOIN all_boards ab ON ab.last_name = ed.last_name AND ab.first_name = ed.first_name
        ORDER BY board_count DESC
        LIMIT 15
    """)

    # Federal grants matched by business number
    federal_grants = []
    try:
        fed_tbl = _read("fed", "grants_contributions")
        fed_rows = query(f"""
            SELECT
                COALESCE(owner_org_title, owner_org) as department,
                TRY_CAST(EXTRACT(YEAR FROM TRY_CAST(agreement_start_date AS TIMESTAMP)) AS INTEGER) as fiscal_year,
                SUM(TRY_CAST(agreement_value AS DOUBLE)) as amount,
                MAX(prog_name_en) as program
            FROM {fed_tbl}
            WHERE TRY_CAST(agreement_value AS DOUBLE) > 0
              AND LEFT(COALESCE(recipient_business_number, ''), 9) = '{bn9}'
            GROUP BY COALESCE(owner_org_title, owner_org),
                     TRY_CAST(EXTRACT(YEAR FROM TRY_CAST(agreement_start_date AS TIMESTAMP)) AS INTEGER)
            ORDER BY amount DESC
            LIMIT 10
        """)
        federal_grants = fed_rows if fed_rows else []
    except Exception:
        federal_grants = []

    # Loop partners (co-participants in same loops)
    loop_partners = []
    try:
        partner_rows = query(f"""
            SELECT DISTINCT LEFT(p2.bn, 9) as partner_bn,
                   MAX(COALESCE(lcf.legal_name, LEFT(p2.bn, 9))) as partner_name
            FROM {lp_tbl} p1
            JOIN {lp_tbl} p2 ON p1.loop_id = p2.loop_id
            LEFT JOIN {lcf_tbl} lcf ON LEFT(lcf.bn, 9) = LEFT(p2.bn, 9)
            WHERE LEFT(p1.bn, 9) = '{bn9}'
              AND LEFT(p2.bn, 9) != '{bn9}'
            GROUP BY LEFT(p2.bn, 9)
            ORDER BY partner_name
            LIMIT 10
        """)
        loop_partners = partner_rows if partner_rows else []
    except Exception:
        loop_partners = []

    flags = []
    if loops or distinct_loop_count > 0:       flags.append("loop_participant")
    if any(l.get("same_year") for l in loops): flags.append("same_year_loop")
    if circ_pct > 0 and circ_pct > 0.3:       flags.append("high_circular_dependency")
    if exp > 0 and prog / exp < 0.3:           flags.append("low_program_delivery")

    name = pf.get("name") or (funding[0].get("name") if funding else bn)

    return {
        "bn":                  bn,
        "name":                name,
        "designation":         pf.get("designation", ""),
        "category":            pf.get("category", ""),
        "funding_history":     funding,
        "loops":               loops,
        "loop_count":          distinct_loop_count or len(loops),
        "circular_outflow":    circ,
        "circular_outflow_pct": circ_pct,
        "program_pct":         round(prog / exp, 3) if exp > 0 else 0,
        "flags":               flags,
        "red_flag_count":      len(flags),
        "zombie_status":       zombie_status,
        "directors":           directors,
        "federal_grants":      federal_grants,
        "loop_partners":       loop_partners,
    }


# ── Deep-Dive: Zombie × Loop Cross-Reference (Challenge #1 extended) ──────────

def get_zombie_loop_crossref_live(min_funding: float = 100000, limit: int = 50) -> list[dict]:
    """Zombie orgs enriched with loop participation counts."""
    zombies = get_zombies_live(min_funding, limit * 2)
    if not zombies:
        return []

    bns = [f"'{z['bn']}'" for z in zombies if z.get("bn")]
    if not bns:
        return zombies[:limit]

    try:
        lp_tbl = _read("cra", "loop_participants")
        loop_counts = query(f"""
            SELECT LEFT(bn, 9) as bn9, COUNT(DISTINCT loop_id) as loop_count
            FROM {lp_tbl}
            WHERE LEFT(bn, 9) IN ({','.join(bns)})
            GROUP BY LEFT(bn, 9)
        """)
        loop_map = {r["bn9"]: int(r["loop_count"]) for r in loop_counts}
    except Exception as e:
        print(f"[DuckDB] zombie crossref loop counts error: {e}")
        loop_map = {}

    for z in zombies:
        bn9 = (z.get("bn") or "")[:9]
        lc = loop_map.get(bn9, 0)
        z["loop_count"]  = lc
        z["was_in_loop"] = lc > 0

    return sorted(zombies[:limit], key=lambda x: (-x["loop_count"], -(x.get("total_govt_funding") or 0)))


# ── Deep-Dive: Dashboard Featured Cases ───────────────────────────────────────

def get_dashboard_featured_cases_live() -> list[dict]:
    """Top 5 high-impact entities for Dashboard 'Start Here' cards."""
    try:
        lcf_tbl = _read("cra", "loop_charity_financials")
        lf_tbl  = _read("cra", "loop_financials")
        lp_tbl  = _read("cra", "loop_participants")

        rows = query(f"""
            SELECT
                lcf.bn,
                lcf.legal_name as name,
                lcf.loops_count,
                TRY_CAST(lcf.circular_outflow AS DOUBLE)   as circular_outflow,
                TRY_CAST(lcf.revenue AS DOUBLE)            as revenue,
                TRY_CAST(lcf.program_spending AS DOUBLE) /
                    NULLIF(TRY_CAST(lcf.total_expenditures AS DOUBLE), 0) as program_pct,
                COUNT(CASE WHEN lf.same_year THEN 1 END)   as same_year_loops
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
            rev      = float(r.get("revenue") or 0)
            circ     = float(r.get("circular_outflow") or 0)
            prog_pct = float(r.get("program_pct") or 0)
            same_yr  = int(r.get("same_year_loops") or 0)
            flags = []
            if same_yr > 0:
                flags.append(f"{same_yr} same-year loop{'s' if same_yr != 1 else ''}")
            if rev > 0 and circ / rev > 0.2:
                flags.append(f"{circ/rev*100:.0f}% circular outflow")
            if 0 < prog_pct < 0.4:
                flags.append(f"only {prog_pct*100:.0f}% to programs")
            r["flags"]          = flags
            r["same_year_loops"] = same_yr
            r["circular_outflow"] = circ

        return rows
    except Exception as e:
        print(f"[DuckDB] get_dashboard_featured_cases_live error: {e}")


def get_flagged_orgs_live(limit: int = 100, filter_flag: str = "all", sort_by: str = "risk_score") -> list[dict]:
    """
    Returns risk-scored orgs for the homepage flagged feed.
    Uses preloaded CRA tables only — avoids entity_golden_records STRUCT accessor issues.
    Python-side scoring via risk_scorer.calculate_score().
    """
    from risk_scorer import calculate_score, get_triggered_flags

    govt_tbl = _read("cra", "govt_funding_by_charity")
    id_tbl   = _read("cra", "cra_identification")
    loop_tbl = _read("cra", "loop_participants")
    dirs_tbl = _read("cra", "cra_directors")

    try:
        # Step 1: zombie + loop signals — fast, no self-join
        rows = query(f"""
            WITH
            zombie_data AS (
                SELECT LEFT(bn, 9)                                         as bn9,
                       ANY_VALUE(legal_name)                               as canonical_name,
                       MAX(TRY_CAST(govt_share_of_rev AS DOUBLE)) / 100.0 as govt_share,
                       MAX(TRY_CAST(total_govt AS DOUBLE))                 as total_govt
                FROM {govt_tbl}
                WHERE TRY_CAST(total_govt AS DOUBLE) > 0
                  AND legal_name IS NOT NULL AND legal_name != ''
                GROUP BY LEFT(bn, 9)
            ),
            last_filing AS (
                SELECT LEFT(bn, 9) as bn9, MAX(fiscal_year) as last_year
                FROM {id_tbl}
                GROUP BY LEFT(bn, 9)
            ),
            loop_data AS (
                SELECT LEFT(bn, 9) as bn9, COUNT(DISTINCT loop_id) as loop_count
                FROM {loop_tbl}
                GROUP BY LEFT(bn, 9)
            )
            SELECT
                z.bn9                           as bn_root,
                z.canonical_name,
                COALESCE(z.govt_share, 0)       as govt_share,
                COALESCE(f.last_year, 9999)     as last_year,
                COALESCE(z.total_govt, 0)       as total_govt,
                COALESCE(l.loop_count, 0)       as loop_count,
                0                               as max_director_boards,
                COALESCE(z.total_govt, 0)       as fed_total,
                0.0                             as ab_total,
                COALESCE(z.total_govt, 0)       as combined_funding
            FROM zombie_data z
            JOIN last_filing f ON f.bn9 = z.bn9
            LEFT JOIN loop_data l ON l.bn9 = z.bn9
            WHERE (
                COALESCE(z.govt_share, 0) >= 0.5
                OR COALESCE(l.loop_count, 0) > 0
            )
            LIMIT {min(limit * 3, 600)}
        """)
    except Exception as e:
        print(f"[DuckDB] get_flagged_orgs_live query error: {e}")
        return []

    if not rows:
        print("[DuckDB] get_flagged_orgs_live: main query returned 0 rows")
        return []

    # Step 2: governance signal — efficient GROUP BY, no self-join
    gov_map: dict[str, int] = {}
    try:
        gov_rows = query(f"""
            WITH dedup AS (
                SELECT last_name, first_name, LEFT(bn, 9) as bn9
                FROM {dirs_tbl}
                WHERE last_name IS NOT NULL AND first_name IS NOT NULL
                  AND last_name != '' AND first_name != ''
                  AND LENGTH(last_name) > 1 AND LENGTH(first_name) > 1
                GROUP BY last_name, first_name, LEFT(bn, 9)
            ),
            multi AS (
                SELECT last_name, first_name, COUNT(DISTINCT bn9) as board_count
                FROM dedup
                GROUP BY last_name, first_name
                HAVING COUNT(DISTINCT bn9) >= 3
            )
            SELECT d.bn9, MAX(m.board_count) as max_boards
            FROM dedup d
            JOIN multi m ON m.last_name = d.last_name AND m.first_name = d.first_name
            GROUP BY d.bn9
        """)
        gov_map = {r["bn9"]: int(r["max_boards"] or 0) for r in gov_rows if r.get("bn9")}
    except Exception as e:
        print(f"[DuckDB] get_flagged_orgs_live governance query error: {e}")

    # Score each org
    scored = []
    for r in rows:
        r.setdefault("city", "")
        r.setdefault("province", "")
        r["fed_total"]   = float(r.get("fed_total") or 0)
        r["ab_total"]    = float(r.get("ab_total") or 0)
        r["combined_funding"] = float(r.get("combined_funding") or 0)
        r["govt_share"]  = float(r.get("govt_share") or 0)
        r["total_govt"]  = float(r.get("total_govt") or 0)
        r["loop_count"]  = int(r.get("loop_count") or 0)
        r["max_director_boards"] = gov_map.get(r.get("bn_root", ""), 0)
        r["last_year"]   = int(r.get("last_year") or 9999)
        r["last_funded"] = r["last_year"] if r["last_year"] < 9999 else None

        result = calculate_score(r)
        r["risk_score"]    = result["score"]
        r["tier"]          = result["tier"]
        r["risk_breakdown"] = result["breakdown"]
        r["flags"]         = get_triggered_flags(r, result["breakdown"])
        scored.append(r)

    # Filter
    if filter_flag and filter_flag != "all":
        scored = [r for r in scored if filter_flag in r["flags"]]

    # Sort
    if sort_by == "funding_amount":
        scored.sort(key=lambda r: r["combined_funding"], reverse=True)
    elif sort_by == "recent":
        scored.sort(key=lambda r: r["last_year"] if r["last_year"] < 9999 else 0, reverse=True)
    else:
        scored.sort(key=lambda r: r["risk_score"], reverse=True)

    return scored[:limit]
