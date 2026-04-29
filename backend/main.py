"""
Follow The Money — Backend API
AI-powered investigative dashboard for Canadian government accountability.
Agency 2026 Ottawa Hackathon
"""

import os
import csv
import io
import json
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load .env from project root, then backend-specific (backend overrides root)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)

import db_duckdb as _duck
DUCKDB_MODE = _duck.is_available()

# PostgreSQL probe results (populated at startup)
_pg_connected = False
_pg_tables: list[str] = []


# ── Database Connection (PostgreSQL fallback) ────────────────────────────────
def get_db_connection():
    if DUCKDB_MODE:
        return None
    import psycopg2
    conn_str = os.getenv("DB_CONNECTION_STRING")
    if not conn_str:
        return None
    try:
        return psycopg2.connect(conn_str, connect_timeout=5)
    except Exception as e:
        print(f"[PG] Connection failed: {e}")
        return None


def query_db(sql, params=None):
    conn = get_db_connection()
    if conn is None:
        return None
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    finally:
        conn.close()


def _no_data():
    return {"error": "No data source configured", "results": [], "count": 0}


def _pg_entity_search(q: str, limit: int = 10) -> list[dict]:
    """Search entity_golden_records for cross-dataset entity matches (PG only)."""
    if not _pg_connected:
        return []
    conn_str = os.getenv("DB_CONNECTION_STRING", "")
    if not conn_str or "PASSWORD" in conn_str:
        return []
    try:
        import psycopg2
        conn = psycopg2.connect(conn_str, connect_timeout=5)
        cur = conn.cursor()
        cur.execute("""
            SELECT canonical_name, bn_root, entity_type,
                   dataset_sources, source_link_count, confidence
            FROM general.entity_golden_records
            WHERE canonical_name ILIKE %s OR bn_root ILIKE %s
            ORDER BY confidence DESC NULLS LAST, source_link_count DESC
            LIMIT %s
        """, (f'%{q}%', f'%{q}%', limit))
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        conn.close()
        return [
            {
                "canonical_name": r["canonical_name"],
                "name":           r["canonical_name"],
                "bn":             r["bn_root"],
                "entity_type":    r["entity_type"] or "organization",
                "dataset_sources": r["dataset_sources"] or [],
                "source_link_count": r["source_link_count"] or 0,
                "confidence":     float(r["confidence"] or 0),
            }
            for r in rows
        ]
    except Exception as e:
        print(f"[PG entity search error] {e}")
        return []


# ── App Setup ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pg_connected, _pg_tables
    if DUCKDB_MODE:
        print(f"[START] DuckDB mode — loading tables from {_duck._base()}")
        # Run synchronous preload in a thread so the event loop stays responsive,
        # but DO NOT yield until it's done — this prevents any request from being
        # served before all tables are ready.
        await asyncio.to_thread(_duck.preload_tables_sync)
    else:
        pg = os.getenv("DB_CONNECTION_STRING", "")
        if pg:
            print("[START] PostgreSQL mode — using shared DB")
        else:
            print("[START] WARNING: no data source configured")
    # Non-blocking PostgreSQL probe (always, even in DuckDB mode — cross-reference value)
    conn_str = os.getenv("DB_CONNECTION_STRING", "")
    if conn_str and "PASSWORD" not in conn_str:
        try:
            import psycopg2 as _pg2
            pg_conn = await asyncio.to_thread(
                lambda: _pg2.connect(conn_str, connect_timeout=8)
            )
            cur = pg_conn.cursor()
            cur.execute("SELECT table_schema || '.' || table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name")
            _pg_tables = [row[0] for row in cur.fetchall()]
            pg_conn.close()
            _pg_connected = True
            print(f"[START] PostgreSQL connected — {len(_pg_tables)} tables: {_pg_tables[:5]}...")
        except Exception as e:
            print(f"[START] PostgreSQL probe failed: {e}")
            _pg_connected = False
            _pg_tables = []
    yield
    print("Shutting down...")

app = FastAPI(
    title="Follow The Money API",
    description="AI-powered government accountability analysis",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


#---Verify DuckDB availability and preload tables on startup---
@app.get("/api/debug/tables")
def get_tables():
    return _duck.query("SHOW TABLES")

@app.get("/api/debug/golden-records")
def debug_golden_records():
    return _duck.query("SELECT * FROM general__entity_golden_records LIMIT 2")

# ── Dashboard Stats ──────────────────────────────────────────────────────────
@app.get("/api/stats")
def get_stats():
    if DUCKDB_MODE:
        # Always return DuckDB result — never fall through to PG fallback, which uses
        # different query definitions (old threshold, no govt-funded filter) and produces
        # inconsistent numbers.
        return _duck.cached("stats", _duck.get_stats_live) or {}

    results = {}
    queries = {
        "total_entities": "SELECT COUNT(*) as count FROM general.entity_golden_records",
        "total_funding_loops": "SELECT COUNT(*) as count FROM cra.loops",
        "total_fed_grants": "SELECT COUNT(*) as count FROM fed.grants_contributions",
        "total_ab_grants": "SELECT COUNT(*) as count FROM ab.ab_grants",
        "total_sole_source": "SELECT COUNT(*) as count FROM ab.ab_sole_source",
        "total_charities": "SELECT COUNT(DISTINCT bn) as count FROM cra.cra_identification",
    }
    for key, sql in queries.items():
        row = query_db(sql)
        results[key] = row[0]["count"] if row else 0

    zombie_sql = """
        SELECT COUNT(*) as count FROM general.entity_golden_records gr
        WHERE gr.cra_profile IS NOT NULL
          AND gr.cra_profile->>'registration_status' IN ('Revoked', 'Annulled')
          AND (
            COALESCE((gr.fed_profile->>'total_funding')::numeric, 0) > 100000
            OR COALESCE((gr.ab_profile->>'total_funding')::numeric, 0) > 100000
          )
    """
    row = query_db(zombie_sql)
    results["zombie_count"] = row[0]["count"] if row else 0

    gov_sql = """
        SELECT COUNT(*) as count FROM (
            SELECT d.last_name, d.first_name, COUNT(DISTINCT LEFT(d.bn, 9)) as boards
            FROM cra.cra_directors d
            WHERE d.last_name IS NOT NULL AND d.first_name IS NOT NULL
              AND LENGTH(d.last_name) > 1 AND LENGTH(d.first_name) > 1
              AND LEFT(d.bn, 9) IN (
                  SELECT DISTINCT LEFT(bn, 9) FROM cra.govt_funding_by_charity
                  WHERE COALESCE(total_govt::numeric, 0) > 0
              )
            GROUP BY d.last_name, d.first_name
            HAVING COUNT(DISTINCT LEFT(d.bn, 9)) >= 5
        ) multi_board
    """
    row = query_db(gov_sql)
    results["multi_board_directors"] = row[0]["count"] if row else 0

    return results or _no_data()


# ── Zombie Recipients ────────────────────────────────────────────────────────
@app.get("/api/zombies/loop-crossref")
def get_zombie_loop_crossref(
    min_funding: float = Query(default=100000),
    limit: int = Query(default=50),
):
    """Zombie recipients enriched with loop participation counts."""
    cache_key = f"zombie_loop_crossref:{min_funding}:{limit}"
    results = _duck.cached(cache_key, _duck.get_zombie_loop_crossref_live, min_funding, limit)
    return {"results": results, "count": len(results), "query_mode": "duckdb-live"}


@app.get("/api/zombies")
def get_zombies(
    min_funding: float = Query(100000),
    limit: int = Query(50),
):
    if DUCKDB_MODE:
        results = _duck.cached(f"zombies:{min_funding}:{limit}", _duck.get_zombies_live, min_funding, limit)
        return {"results": results, "count": len(results), "query_mode": "duckdb-live"}

    sql = """
        SELECT
            gr.id,
            gr.canonical_name,
            gr.bn_root as primary_bn,
            gr.entity_type,
            gr.cra_profile->>'registration_status' as registration_status,
            gr.cra_profile->>'effective_date' as status_date,
            gr.cra_profile->>'designation' as designation,
            gr.cra_profile->>'category' as category,
            COALESCE((gr.fed_profile->>'total_funding')::numeric, 0) as fed_funding,
            COALESCE((gr.ab_profile->>'total_funding')::numeric, 0) as ab_funding,
            COALESCE((gr.fed_profile->>'total_funding')::numeric, 0) +
                COALESCE((gr.ab_profile->>'total_funding')::numeric, 0) as total_public_funding,
            gr.cra_profile->>'latest_filing_year' as last_filing_year,
            gr.dataset_sources,
            gr.addresses
        FROM general.entity_golden_records gr
        WHERE gr.cra_profile IS NOT NULL
          AND gr.cra_profile->>'registration_status' IN ('Revoked', 'Annulled', 'Voluntary Revocation')
          AND (
            COALESCE((gr.fed_profile->>'total_funding')::numeric, 0) +
            COALESCE((gr.ab_profile->>'total_funding')::numeric, 0)
          ) > %s
        ORDER BY (
            COALESCE((gr.fed_profile->>'total_funding')::numeric, 0) +
            COALESCE((gr.ab_profile->>'total_funding')::numeric, 0)
        ) DESC
        LIMIT %s
    """
    results = query_db(sql, (min_funding, limit))
    if results is None:
        return _no_data()
    return {"results": results, "count": len(results), "query_mode": "live"}


# ── Funding Loops ─────────────────────────────────────────────────────────────
@app.get("/api/loops/stats")
def get_loops_stats():
    return _duck.cached("loops_stats_enriched", _duck.get_loops_stats_enriched_live)


@app.get("/api/loops/charities")
def get_loop_charities(limit: int = Query(default=50, le=200)):
    return _duck.get_top_loop_charities_live(limit)


@app.get("/api/loops/detail/{loop_id}")
def get_loop_detail(loop_id: int):
    return _duck.get_loop_detail_live(loop_id)


@app.get("/api/loops")
def get_funding_loops(
    min_hops: int = Query(2, ge=2, le=20),
    max_hops: int = Query(6, ge=2, le=20),
    min_flow: float = Query(default=0.0, ge=0),
    max_flow: float = Query(default=0.0, ge=0),
    same_year_only: bool = Query(default=False),
    risk_level: str = Query(default="", max_length=20),
    classification: str = Query(default="", max_length=50),
    limit: int = Query(100, ge=1, le=500),
):
    if DUCKDB_MODE:
        cache_key = f"loops_enriched:{min_hops}:{max_hops}:{min_flow}:{max_flow}:{same_year_only}:{risk_level}:{classification}:{limit}"
        results = _duck.cached(
            cache_key,
            _duck.get_loops_enriched_live,
            min_hops, max_hops, min_flow, max_flow, same_year_only, risk_level, classification, limit,
        )
        return {"results": results, "count": len(results), "query_mode": "duckdb-live"}

    sql = """
        SELECT
            l.id, l.hops, l.path_bns, l.path_display,
            l.bottleneck_amt, l.total_flow, l.min_year, l.max_year,
            lf.bottleneck_window, lf.total_flow_window, lf.same_year
        FROM cra.loops l
        LEFT JOIN cra.loop_financials lf ON lf.loop_id = l.id
        WHERE l.hops BETWEEN %s AND %s
        ORDER BY l.bottleneck_amt DESC NULLS LAST
        LIMIT %s
    """
    results = query_db(sql, (min_hops, max_hops, limit))
    if results is None:
        return _no_data()
    return {"results": results, "count": len(results), "query_mode": "live"}


@app.get("/api/loops/graph")
def get_loop_graph(limit: int = Query(50)):
    if DUCKDB_MODE:
        return _duck.cached(f"loop_graph:{limit}", _duck.get_loop_graph_live, limit)

    sql = """
        WITH top_loops AS (
            SELECT id, path_bns, bottleneck_amt, total_flow, hops
            FROM cra.loops
            ORDER BY bottleneck_amt DESC NULLS LAST
            LIMIT %s
        ),
        involved_bns AS (
            SELECT DISTINCT unnest(path_bns) as bn FROM top_loops
        ),
        node_info AS (
            SELECT
                i.bn, i.legal_name, lcf.revenue, lcf.circular_outflow, lcf.loops_count
            FROM involved_bns ib
            JOIN LATERAL (
                SELECT bn, legal_name FROM cra.cra_identification
                WHERE LEFT(bn, 9) = LEFT(ib.bn, 9)
                ORDER BY fiscal_year DESC LIMIT 1
            ) i ON true
            LEFT JOIN cra.loop_charity_financials lcf ON lcf.bn = ib.bn
        )
        SELECT json_build_object(
            'nodes', (SELECT json_agg(json_build_object(
                'id', bn, 'name', legal_name, 'revenue', revenue,
                'circular_outflow', circular_outflow, 'loops_count', loops_count
            )) FROM node_info),
            'links', (SELECT json_agg(json_build_object(
                'source', path_bns[i], 'target', path_bns[i+1],
                'flow', bottleneck_amt, 'loop_id', id
            )) FROM top_loops, generate_series(1, hops) i),
            'loops', (SELECT json_agg(json_build_object(
                'id', id, 'hops', hops, 'path_bns', path_bns,
                'bottleneck_amt', bottleneck_amt, 'total_flow', total_flow
            )) FROM top_loops)
        ) as graph_data
    """
    results = query_db(sql, (limit,))
    if results and results[0].get("graph_data"):
        return results[0]["graph_data"]
    return {"nodes": [], "links": [], "loops": []}


# ── Governance Networks ──────────────────────────────────────────────────────
@app.get("/api/governance/self-dealing")
def get_self_dealing_directors(
    min_boards: int = Query(default=2),
    limit: int = Query(default=50),
):
    """Directors whose multiple organizations appear together in the same funding loop."""
    cache_key = f"self_dealing:{min_boards}:{limit}"
    results = _duck.cached(cache_key, _duck.get_director_loop_intersections_live, min_boards, limit)
    return {"results": results, "count": len(results), "query_mode": "duckdb-live"}


@app.get("/api/governance")
def get_governance_networks(
    min_boards: int = Query(3),
    limit: int = Query(50),
):
    if DUCKDB_MODE:
        results = _duck.cached(f"governance:{min_boards}:{limit}", _duck.get_governance_live, min_boards, limit)
        return {"results": results, "count": len(results), "query_mode": "duckdb-live"}

    sql = """
        WITH director_boards AS (
            SELECT
                d.last_name, d.first_name,
                LEFT(d.bn, 9) as bn_root,
                d.position,
                MAX(d.fpe) as latest_filing
            FROM cra.cra_directors d
            WHERE d.last_name IS NOT NULL AND d.first_name IS NOT NULL
              AND d.end_date IS NULL
            GROUP BY d.last_name, d.first_name, LEFT(d.bn, 9), d.position
        ),
        multi_board AS (
            SELECT
                db.last_name, db.first_name,
                COUNT(DISTINCT db.bn_root) as board_count,
                ARRAY_AGG(DISTINCT db.bn_root) as bn_roots,
                ARRAY_AGG(DISTINCT db.position) as positions
            FROM director_boards db
            GROUP BY db.last_name, db.first_name
            HAVING COUNT(DISTINCT db.bn_root) >= %s
        )
        SELECT
            mb.last_name, mb.first_name, mb.board_count, mb.positions,
            json_agg(json_build_object(
                'bn_root', gr.bn_root, 'name', gr.canonical_name,
                'entity_type', gr.entity_type,
                'fed_funding', gr.fed_profile->>'total_funding',
                'ab_funding', gr.ab_profile->>'total_funding',
                'cra_status', gr.cra_profile->>'registration_status'
            )) as organizations,
            SUM(COALESCE((gr.fed_profile->>'total_funding')::numeric, 0) +
                COALESCE((gr.ab_profile->>'total_funding')::numeric, 0)) as total_controlled_funding
        FROM multi_board mb
        JOIN LATERAL unnest(mb.bn_roots) AS ubr(bn_root) ON true
        LEFT JOIN general.entity_golden_records gr ON gr.bn_root = ubr.bn_root
        GROUP BY mb.last_name, mb.first_name, mb.board_count, mb.positions
        ORDER BY total_controlled_funding DESC NULLS LAST
        LIMIT %s
    """
    results = query_db(sql, (min_boards, limit))
    if results is None:
        return _no_data()
    return {"results": results, "count": len(results), "query_mode": "live"}


# ── Multi-Flag Alerts ────────────────────────────────────────────────────────
@app.get("/api/alerts")
def get_alerts(
    min_flags: int = Query(2, description="Minimum number of red flags"),
    limit: int = Query(20),
):
    """Cross-challenge intersection: entities flagged in multiple challenge categories."""
    if DUCKDB_MODE:
        results = _duck.cached(f"alerts:{min_flags}:{limit}", _duck.get_alerts_live, min_flags, limit)
        return {"results": results, "count": len(results), "query_mode": "duckdb-live"}

    sql = """
        WITH zombie_entities AS (
            SELECT gr.id, gr.canonical_name, gr.bn_root,
                   COALESCE((gr.fed_profile->>'total_funding')::numeric, 0) +
                   COALESCE((gr.ab_profile->>'total_funding')::numeric, 0) as total_funding,
                   1 as zombie_flag
            FROM general.entity_golden_records gr
            WHERE gr.cra_profile->>'registration_status' IN ('Revoked', 'Annulled', 'Voluntary Revocation')
              AND (COALESCE((gr.fed_profile->>'total_funding')::numeric, 0) +
                   COALESCE((gr.ab_profile->>'total_funding')::numeric, 0)) > 100000
        ),
        loop_entities AS (
            SELECT DISTINCT LEFT(unnest(l.path_bns), 9) as bn_root, 1 as loop_flag
            FROM cra.loops l
        ),
        multi_board_entities AS (
            SELECT DISTINCT LEFT(d.bn, 9) as bn_root, 1 as gov_flag
            FROM cra.cra_directors d
            WHERE d.last_name IS NOT NULL
            GROUP BY d.last_name, d.first_name, LEFT(d.bn, 9)
            HAVING COUNT(DISTINCT LEFT(d.bn, 9)) >= 3
        )
        SELECT
            ze.id, ze.canonical_name, ze.bn_root, ze.total_funding,
            ze.zombie_flag,
            COALESCE(le.loop_flag, 0) as loop_flag,
            COALESCE(me.gov_flag, 0) as gov_flag,
            ze.zombie_flag + COALESCE(le.loop_flag, 0) + COALESCE(me.gov_flag, 0) as alarm_count
        FROM zombie_entities ze
        LEFT JOIN loop_entities le ON le.bn_root = ze.bn_root
        LEFT JOIN multi_board_entities me ON me.bn_root = ze.bn_root
        WHERE ze.zombie_flag + COALESCE(le.loop_flag, 0) + COALESCE(me.gov_flag, 0) >= %s
        ORDER BY alarm_count DESC, ze.total_funding DESC
        LIMIT %s
    """
    results = query_db(sql, (min_flags, limit))
    if results is None:
        return _no_data()
    return {"results": results, "count": len(results), "query_mode": "live"}


# ── Duplicative Funding (Challenge #8) ───────────────────────────────────────

@app.get("/api/duplicative-funding/stats")
def get_duplicative_funding_stats():
    if not DUCKDB_MODE:
        return _no_data()
    return _duck.cached("duplicative_funding_stats", _duck.get_duplicative_funding_stats_live)


@app.get("/api/duplicative-funding")
def get_duplicative_funding(
    min_fed: float = Query(1_000_000, ge=0),
    min_ab: float = Query(1_000_000, ge=0),
    limit: int = Query(200, ge=1, le=500),
):
    if not DUCKDB_MODE:
        return _no_data()
    cache_key = f"duplicative_funding:{min_fed}:{min_ab}:{limit}"
    results = _duck.cached(cache_key, _duck.get_duplicative_funding_live, min_fed, min_ab, limit)
    return {"results": results, "count": len(results), "query_mode": "duckdb-live"}


@app.get("/api/related-parties")
def get_related_parties(
    min_orgs: int = Query(3, ge=2, le=20),
    limit: int = Query(50, ge=1, le=500),
):
    if not DUCKDB_MODE:
        return _no_data()
    cache_key = f"related_parties:{min_orgs}:{limit}"
    results = _duck.cached(cache_key, _duck.get_related_parties_live, min_orgs, limit)
    return {"results": results, "count": len(results), "query_mode": "duckdb-live"}


def _entity_summary_fallback(name, fed_total, ab_total, fed_departments, ab_ministries, entity_type, city):
    """Data-driven template when AI APIs are unavailable."""
    combined = fed_total + ab_total
    parts = []
    loc = f" based in {city}" if city else ""
    parts.append(f"{name}{loc} receives ${combined:,.0f} in combined government funding — "
                 f"${fed_total:,.0f} federal and ${ab_total:,.0f} from Alberta.")
    if len(fed_departments) > 1 or len(ab_ministries) > 1:
        sources = []
        if len(fed_departments) > 1:
            sources.append(f"{len(fed_departments)} federal departments")
        if len(ab_ministries) > 1:
            sources.append(f"{len(ab_ministries)} Alberta ministries")
        parts.append(f"This organization draws from {' and '.join(sources)} simultaneously, "
                     "creating overlapping oversight responsibilities that may reduce accountability.")
    else:
        parts.append("Dual-source funding from both levels of government warrants review "
                     "for potential duplication of purpose.")
    return " ".join(parts)


@app.post("/api/entity-summary")
async def get_entity_summary(body: dict):
    """Per-org AI narrative: 2-sentence accountability summary for a specific organization."""
    name = body.get("name", "")
    fed_total = float(body.get("fed_total") or 0)
    ab_total = float(body.get("ab_total") or 0)
    fed_departments = body.get("fed_departments") or []
    ab_ministries = body.get("ab_ministries") or []
    entity_type = body.get("entity_type", "")
    city = body.get("city", "")

    if not name or not (os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("ANTHROPIC_API_KEY")):
        return {"summary": ""}

    try:
        fed_dept_str = json.dumps(fed_departments) if isinstance(fed_departments, list) else str(fed_departments)
        ab_min_str = json.dumps(ab_ministries) if isinstance(ab_ministries, list) else str(ab_ministries)
        prompt = (
            f"Organization: {name} ({entity_type}, {city})\n"
            f"Federal funding: ${fed_total:,.0f} from departments: {fed_dept_str}\n"
            f"Alberta funding: ${ab_total:,.0f} from ministries: {ab_min_str}\n\n"
            "In 2 sentences, explain why this organization's dual-government funding pattern is "
            "noteworthy from an accountability perspective. Be specific about the departments and "
            "dollar amounts. Plain text only, no markdown."
        )
        text = await _call_llm_simple(prompt)
        return {"summary": text.strip()}
    except Exception as e:
        print(f"[LLM] entity-summary error for {name}: {e}")
        return {"summary": ""}


@app.post("/api/duplicative-funding/summary")
async def get_duplicative_funding_summary():
    """AI-generated investigative narrative from top dual-funded orgs + cross-org directors."""
    if not DUCKDB_MODE:
        return {"summary": ""}
    if not (os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("ANTHROPIC_API_KEY")):
        return {"summary": ""}

    top_orgs = _duck.get_duplicative_funding_live(min_fed=10_000_000, min_ab=10_000_000, limit=5)
    top_directors = _duck.get_related_parties_live(min_orgs=3, limit=3)

    try:
        orgs_data = [{"name": o["canonical_name"], "fed": o["fed_total"], "ab": o["ab_total"]} for o in top_orgs]
        dirs_data = [{"name": d["first_name"] + " " + d["last_name"], "orgs": d["org_count"], "funding": d["total_gov_funding"]} for d in top_directors]
        prompt = (
            "Based on these real findings from public government data:\n\n"
            "Top dual-funded organizations:\n" + json.dumps(orgs_data, indent=2) + "\n\n"
            "Top cross-org directors:\n" + json.dumps(dirs_data, indent=2) + "\n\n"
            "Write a 2-3 sentence investigative summary highlighting the most significant findings about "
            "organizations receiving funding from both federal and Alberta governments simultaneously, "
            "and any notable governance overlap. Be specific, cite names and dollar amounts. Plain text only, no markdown."
        )
        text = await _call_llm_simple(prompt)
        return {"summary": text.strip()}
    except Exception as e:
        print(f"[LLM] duplicative-funding summary error: {e}")
        return {"summary": ""}


# ── CHALLENGE 5 — Vendor Concentration ────────────────────────────────────────

@app.get("/api/vendor-concentration")
def get_vendor_concentration(
    dimension: str = Query("department", description="Group by: department, naics, region"),
    min_spending: float = Query(1_000_000, description="Minimum spending threshold"),
    limit: int = Query(50),
):
    """Challenge #5: Vendor concentration analysis by department, NAICS, or region."""
    if DUCKDB_MODE:
        results = _duck.cached(
            f"vc:{dimension}:{min_spending}:{limit}",
            _duck.get_vendor_concentration_live, dimension, min_spending, limit,
        )
        return {"results": results, "count": len(results), "dimension": dimension, "query_mode": "duckdb-live"}
    return {"results": [], "count": 0, "dimension": dimension, "query_mode": "unavailable"}


@app.get("/api/vendor-concentration/stats")
def get_vendor_concentration_stats():
    """Challenge #5: Headline stats for vendor concentration."""
    if DUCKDB_MODE:
        return _duck.cached("vc_stats", _duck.get_vendor_concentration_stats_live) or {}
    return {}


@app.get("/api/vendor-concentration/detail")
def get_vendor_concentration_detail(
    group_key: str = Query(..., description="Department/sector/region name"),
    dimension: str = Query("department"),
    limit: int = Query(20),
):
    """Challenge #5: Detailed vendor breakdown for a specific group."""
    if DUCKDB_MODE:
        return _duck.cached(
            f"vc_detail:{dimension}:{group_key}:{limit}",
            _duck.get_vendor_concentration_detail_live, group_key, dimension, limit,
        )
    return {"group_key": group_key, "vendors": [], "trend": []}


@app.post("/api/vendor-concentration/brief")
async def get_vendor_concentration_brief(body: dict):
    """Challenge #5: AI-powered concentration intelligence brief for a department/sector."""
    group_key = body.get("group_key", "")
    dimension = body.get("dimension", "department")
    hhi = body.get("hhi", 0)
    cr3_pct = body.get("cr3_pct", 0)
    group_total = body.get("group_total", 0)
    top3_names = body.get("top3_names", [])
    top3_millions = body.get("top3_millions", [])
    recipient_count = body.get("recipient_count", 0)

    if not group_key or not (os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("ANTHROPIC_API_KEY")):
        return {"brief": ""}

    try:
        top3_detail = ""
        for i, name in enumerate(top3_names[:3]):
            amount = top3_millions[i] if i < len(top3_millions) else "?"
            top3_detail += f"  {i+1}. {name}: ${amount}M\n"

        prompt = (
            "Based on these real findings from public government data:\n\n"
            f"{'Department' if dimension == 'department' else 'Sector' if dimension == 'naics' else 'Region'}: {group_key}\n"
            f"HHI (Herfindahl-Hirschman Index): {hhi} "
            f"({'HIGHLY CONCENTRATED — monopoly risk' if hhi > 2500 else 'Moderately concentrated' if hhi > 1500 else 'Competitive'})\n"
            f"CR-3 (top 3 vendors share): {cr3_pct}%\n"
            f"Total spending: ${group_total:,.0f}\n"
            f"Number of vendors: {recipient_count}\n"
            f"Top 3 vendors:\n{top3_detail}\n"
            "Write a 3-paragraph Concentration Intelligence Brief:\n"
            "Paragraph 1: Name the specific concentration risk — who dominates and by how much.\n"
            "Paragraph 2: Explain the accountability concern — what happens if the dominant vendor fails or underperforms? Can the government walk away?\n"
            "Paragraph 3: Generate an investigator hypothesis — what should an auditor look for next? "
            "Suggest cross-referencing with CRA filings, sole-source data, or amendment patterns.\n\n"
            "Be specific with names and dollar amounts. Write in an investigative journalism tone. Plain text only, no markdown."
        )

        text = await _call_llm_simple(prompt)
        return {"brief": text.strip()}
    except Exception as e:
        print(f"[LLM] vendor-concentration brief error for {group_key}: {e}")
        return {"brief": ""}


@app.post("/api/vendor-concentration/analyze")
async def get_vendor_concentration_analysis():
    """Challenge #5: LLM-powered auto-analysis across all 3 dimensions."""
    if not DUCKDB_MODE:
        return {"analysis": "", "source": "unavailable"}

    data = _duck.get_vendor_concentration_analysis_data()

    has_ai = bool(os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("ANTHROPIC_API_KEY"))
    if has_ai:
        try:
            prompt = (
                "Analyze this vendor concentration data from federal government grants & contributions.\n\n"
                f"HEADLINE STATS: {json.dumps(data.get('stats', {}))}\n\n"
                f"TOP CONCENTRATED DEPARTMENTS (by HHI):\n{json.dumps(data.get('departments', []), indent=1)}\n\n"
                f"TOP CONCENTRATED NAICS SECTORS:\n{json.dumps(data.get('sectors', []), indent=1)}\n\n"
                f"TOP CONCENTRATED REGIONS:\n{json.dumps(data.get('regions', []), indent=1)}\n\n"
                "Write a concise investigative analysis (4-6 bullet points) covering:\n"
                "1. The most alarming concentration patterns — name specific departments and vendors\n"
                "2. Cross-dimension insights — does the same vendor dominate across sectors AND departments?\n"
                "3. Data quality flags — any entries that look like data artifacts rather than real vendors\n"
                "4. Risk assessment — where has government become dependent on a vendor it can't walk away from?\n\n"
                "Use bullet points with emoji prefixes (critical, warning, insight). "
                "Be specific with names and dollar amounts. Plain text only."
            )
            text = await _call_llm_simple(prompt)
            return {"analysis": text.strip(), "source": "claude"}
        except Exception as e:
            print(f"[LLM] vendor-concentration analyze error: {e}")

    # Rule-based fallback
    depts = data.get("departments", [])
    highly = [d for d in depts if d["hhi"] > 2500]
    lines = []
    if highly:
        lines.append(f"{len(highly)} departments are highly concentrated (HHI > 2,500).")
        top = highly[0]
        lines.append(f"Most concentrated: **{top['name']}** — HHI {top['hhi']:,}, CR-3 {top['cr3_pct']}%, {top['vendor_count']} vendors, ${top['total_spending']}M total.")
        if top.get("top3"):
            lines.append(f"Top recipients: {', '.join(top['top3'][:3])}.")
    stats = data.get("stats", {})
    if stats.get("monopoly_programs"):
        lines.append(f"{stats['monopoly_programs']} programs have a single recipient above $1M — zero competition.")
    return {"analysis": "\n".join(lines) if lines else "No concentration issues detected.", "source": "rule-based"}


# ── END CHALLENGE 5 ──────────────────────────────────────────────────────────


# ── Sole Source / Amendment Creep ────────────────────────────────────────────
@app.get("/api/sole-source")
def get_sole_source(
    min_ratio: float = Query(3.0, description="Minimum amendment ratio"),
    limit: int = Query(50),
):
    """Challenge #4: Vendor concentration, amendment creep, and sole-source dependency."""
    if DUCKDB_MODE:
        results = _duck.cached(f"sole_source:{min_ratio}:{limit}", _duck.get_sole_source_live, min_ratio, limit)
        stats = _duck.cached("sole_source_stats", _duck.get_sole_source_stats_live)
        return {"results": results, "count": len(results), "stats": stats, "query_mode": "duckdb-live"}

    sql = """
        SELECT
            ss.id,
            ss.vendor_name as vendor,
            ss.department,
            ss.description,
            ss.original_value as original_amount,
            ss.amended_value as amended_amount,
            CASE WHEN ss.original_value > 0
                 THEN ROUND((ss.amended_value / ss.original_value)::numeric, 1)
                 ELSE 0 END as amendment_ratio,
            ss.contract_date,
            ss.amendment_date as latest_amendment_date,
            ss.justification
        FROM ab.ab_sole_source ss
        WHERE ss.original_value > 0
          AND ss.amended_value / ss.original_value >= %s
        ORDER BY (ss.amended_value / ss.original_value) DESC
        LIMIT %s
    """
    results = query_db(sql, (min_ratio, limit))
    if results is None:
        return _no_data()
    return {"results": results, "count": len(results), "stats": {}, "query_mode": "live"}


# ── Threshold Gaming (Challenge #9) ─────────────────────────────────────────
@app.get("/api/threshold-gaming")
def get_threshold_gaming(limit: int = Query(default=50, ge=1, le=200)):
    return _duck.cached(f"threshold_gaming:{limit}", _duck.get_threshold_gaming_live, limit) or []


# ── Ghost Recipients (Challenge #2) ─────────────────────────────────────────
@app.get("/api/ghost-recipients")
def get_ghost_recipients(
    min_funding: float = Query(default=500000, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
):
    """Challenge #2: Ghost Recipients — federal grant recipients who went silent."""
    return _duck.cached(
        f"ghost_recipients:{min_funding}:{limit}",
        _duck.get_ghost_recipients_live, min_funding, limit
    ) or []


# ── Policy Misalignment (Challenge #7) ─────────────────────────────────────
@app.get("/api/policy-misalignment")
async def get_policy_misalignment(limit: int = Query(default=20, ge=1, le=100)):
    """Challenge #7: Compare stated govt priorities vs actual spending patterns."""
    if not DUCKDB_MODE:
        return {"departments": [], "analysis": "", "count": 0}

    dept_spending = _duck.cached(
        f"policy_misalignment:{limit}",
        _duck.get_policy_misalignment_live, limit,
    )

    analysis = ""
    has_ai = bool(os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("ANTHROPIC_API_KEY"))
    if has_ai and dept_spending:
        try:
            prompt = (
                "Analyze these federal department spending patterns from Canada's Proactive Disclosure data.\n\n"
                f"SPENDING BY DEPARTMENT (top {limit}):\n{json.dumps(dept_spending[:15], default=str, indent=1)}\n\n"
                "Canada's stated priorities include: climate action & emissions reduction, affordable housing, "
                "healthcare capacity, Indigenous reconciliation, and defence modernization.\n\n"
                "In 4-6 bullet points, identify:\n"
                "1. Which stated priorities receive disproportionately LOW funding relative to rhetoric\n"
                "2. Which departments show spending patterns MISALIGNED with their mandate\n"
                "3. Where the largest gaps exist between political promises and actual resource allocation\n"
                "4. Any surprising concentration of spending in areas not typically highlighted as priorities\n\n"
                "Be specific with department names and dollar amounts. Plain text, no markdown."
            )
            analysis = await _call_llm_simple(prompt)
        except Exception as e:
            print(f"[LLM] policy-misalignment analysis error: {e}")

    return {"departments": dept_spending, "analysis": analysis, "count": len(dept_spending or [])}


# ── Adverse Media (Challenge #10) ──────────────────────────────────────────
@app.post("/api/adverse-media")
async def check_adverse_media(body: dict):
    """Challenge #10: AI-powered adverse media risk assessment for an entity."""
    entity_name = body.get("name", "")
    bn = body.get("bn", "")

    if not entity_name and not bn:
        raise HTTPException(400, "Provide 'name' or 'bn'")

    if not bn and entity_name and DUCKDB_MODE:
        try:
            q = entity_name.lower().replace("'", "")
            rows = _duck.query(f"SELECT DISTINCT LEFT(bn,9) as bn FROM cra__cra_identification WHERE LOWER(legal_name) LIKE '%{q}%' LIMIT 1")
            if rows:
                bn = rows[0]["bn"]
        except Exception:
            pass

    dossier = {}
    if bn and DUCKDB_MODE:
        try:
            dossier = _duck.get_entity_case_file_live(bn)
        except Exception:
            pass

    dossier_summary = ""
    if dossier:
        flags = dossier.get("red_flags", [])
        funding = dossier.get("total_govt_funding") or dossier.get("profile", {}).get("total_govt", 0)
        loops = dossier.get("loop_count", 0)
        dossier_summary = (
            f"\nEntity profile from government records:\n"
            f"- Flags: {', '.join(str(f) for f in flags[:5]) if flags else 'none'}\n"
            f"- Government funding: ${float(funding):,.0f}\n"
            f"- Loop participation: {loops} funding loops\n"
        )

    analysis = ""
    has_ai = bool(os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("ANTHROPIC_API_KEY"))
    if has_ai:
        try:
            prompt = (
                f"Entity: {entity_name}\nBN: {bn}\n{dossier_summary}\n\n"
                "As an investigative analyst, generate an Adverse Media Risk Assessment:\n\n"
                "1. LIST 5 specific search queries an investigator should run in media databases "
                "(Canadian news archives, court records, regulatory enforcement databases) to check for:\n"
                "   - Fraud allegations or criminal investigations\n"
                "   - Regulatory enforcement actions (CRA audits, provincial regulators)\n"
                "   - Safety incidents or public complaints\n"
                "   - Political controversies involving the entity\n"
                "   - Sanctions or compliance violations\n\n"
                "2. Based on the entity's profile, ASSESS the prior probability of adverse media findings "
                "(high/medium/low) and explain why.\n\n"
                "3. Recommend 3 specific regulatory databases to cross-reference.\n\n"
                "Be specific to this entity. Plain text only."
            )
            analysis = await _call_llm_simple(prompt)
        except Exception as e:
            print(f"[LLM] adverse-media error: {e}")

    return {
        "entity": entity_name,
        "bn": bn,
        "analysis": analysis,
        "has_dossier": bool(dossier),
    }


# ── OSINT Investigation Report ──────────────────────────────────────────────
@app.post("/api/investigate")
async def generate_investigation(body: dict):
    """OSINT/WEBINT investigation: internal dossier + web search + AI synthesis."""
    entity_name = body.get("name", "")
    bn = body.get("bn", "")

    if not entity_name and not bn:
        raise HTTPException(400, "Provide 'name' or 'bn'")

    # Phase A: Internal data
    internal = {}
    if bn and DUCKDB_MODE:
        try:
            internal = _duck.cached(f"entity:{bn[:9]}", _duck.get_entity_case_file_live, bn)
        except Exception as e:
            print(f"[OSINT] internal dossier failed: {e}")
    if not entity_name and internal:
        entity_name = internal.get("name", "")

    # Phase B: External data (parallel web searches)
    search_queries = []
    if entity_name:
        search_queries = [
            f'"{entity_name}" Canada charity CRA',
            f'"{entity_name}" fraud investigation audit',
            f'{entity_name} Canada',
        ]
    elif bn:
        search_queries = [
            f'{bn} CRA charity Canada',
            f'{bn} fraud investigation',
            f'{bn} Canada',
        ]

    def _run_all_searches(queries):
        """Run searches sequentially with small delay to avoid rate limiting."""
        r1 = _web_search(queries[0], 5)
        _time.sleep(1)
        r2 = _web_search(queries[1], 5)
        _time.sleep(1)
        r3 = _web_news(queries[2], 5)
        return r1, r2, r3

    try:
        web_regulatory, web_adverse, news_results = await asyncio.to_thread(
            _run_all_searches, search_queries
        )
    except Exception as e:
        print(f"[OSINT] search batch failed: {e}")
        web_regulatory, web_adverse, news_results = [], [], []

    print(f"[OSINT] Results: {len(web_regulatory)} regulatory, {len(web_adverse)} adverse, {len(news_results)} news")

    all_external = []
    for r in web_regulatory + web_adverse:
        all_external.append({"title": r.get("title", ""), "url": r.get("href", ""), "snippet": r.get("body", "")})
    for r in news_results:
        all_external.append({"title": r.get("title", ""), "url": r.get("url", r.get("link", "")), "snippet": r.get("body", ""), "date": r.get("date", ""), "source": r.get("source", "")})

    seen_urls = set()
    deduped_external = []
    for src in all_external:
        u = src.get("url", "")
        if u and u not in seen_urls:
            seen_urls.add(u)
            deduped_external.append(src)

    # Phase C: LLM synthesis
    report = {"internal_summary": "", "external_findings": "", "sentiment_analysis": "", "action_items": []}

    has_ai = bool(os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("ANTHROPIC_API_KEY") or os.getenv("BEDROCK_API_KEY"))
    if has_ai:
        internal_ctx = ""
        if internal:
            flags = internal.get("flags", [])
            zombie = internal.get("zombie_status", {})
            loops = internal.get("loops", [])
            directors = internal.get("directors", [])
            fed_grants = internal.get("federal_grants", [])
            funding_hist = internal.get("funding_history", [])
            total_govt = sum(float(y.get("total_govt", 0) or 0) for y in funding_hist)
            internal_ctx = (
                f"INTERNAL DOSSIER (from government databases):\n"
                f"- Entity: {internal.get('name', entity_name)}\n"
                f"- BN: {bn}\n"
                f"- Designation: {internal.get('designation', 'Unknown')}\n"
                f"- Category: {internal.get('category', 'Unknown')}\n"
                f"- Red flags: {', '.join(str(f) for f in flags) if flags else 'none'}\n"
                f"- Zombie status: {'YES — revoked/ceased' if zombie.get('is_zombie') else 'No'}\n"
                f"- Total govt funding: ${total_govt:,.0f}\n"
                f"- Funding loops: {len(loops)} loops\n"
                f"- Directors: {len(directors)} on record\n"
                f"- Federal grants: {len(fed_grants)} records\n"
            )
            if zombie.get("is_zombie"):
                internal_ctx += f"- Last filing year: {zombie.get('last_filing_year')}\n"
                internal_ctx += f"- Govt dependency: {zombie.get('govt_share_pct', 0):.0f}%\n"
            multi_board = [d for d in directors if (d.get("board_count") or 0) >= 3]
            if multi_board:
                internal_ctx += f"- Multi-board directors (3+ boards): {len(multi_board)}\n"

        external_ctx = "EXTERNAL WEB SEARCH RESULTS:\n"
        for i, src in enumerate(deduped_external[:15], 1):
            external_ctx += f"\n[{i}] {src.get('title', 'Untitled')}\n"
            external_ctx += f"    URL: {src.get('url', 'N/A')}\n"
            if src.get("date"):
                external_ctx += f"    Date: {src['date']}\n"
            if src.get("source"):
                external_ctx += f"    Source: {src['source']}\n"
            external_ctx += f"    Snippet: {src.get('snippet', '')[:300]}\n"

        system_prompt = (
            "You are an OSINT investigator for 'Follow The Money' — a Canadian government accountability platform. "
            "You are presenting to Ministers, Deputy Ministers, and senior public officials.\n"
            "Generate a comprehensive investigation report based on internal government data AND external web findings.\n\n"
            "Return ONLY valid JSON with these exact 4 keys:\n"
            "{\n"
            '  "internal_summary": "2-3 paragraphs summarizing the entity\'s internal risk profile: funding patterns, red flags, loop participation, zombie status, filing anomalies, director network. Cite dollar amounts and years.",\n'
            '  "external_findings": "2-3 paragraphs analyzing external web/news results. Note discrepancies between public info and filings. Flag missing web presence, dead websites, or concerning coverage. Cite specific URLs.",\n'
            '  "sentiment_analysis": "MUST start with exactly one of these words on its own line: POSITIVE, NEGATIVE, MIXED, or NEUTRAL. Then 1-2 paragraphs on public/media perception. If no news found, note that absence of media scrutiny may itself be notable.",\n'
            '  "action_items": [\n'
            '    "IMMEDIATE: <concrete step — name the specific federal department or agency that should act, e.g. CRA Charities Directorate, TBS, PSPC, and what specifically they should do: audit T3010 filings, freeze grant disbursements, revoke charitable status, refer to RCMP, etc.>",\n'
            '    "HIGH: <next priority step — e.g. cross-reference directors against other flagged orgs, subpoena bank records for circular flows, request explanation of filing gaps>",\n'
            '    "HIGH: <another step — e.g. notify granting departments (name them) to flag future applications from this entity and related BNs>",\n'
            '    "MEDIUM: <longer-term step — e.g. policy recommendation, systemic fix, inter-departmental coordination>",\n'
            '    "MEDIUM: <monitoring step — e.g. add to watchlist, schedule follow-up audit in 12 months, flag related entities>"\n'
            "  ]\n"
            "}\n\n"
            "ACTION ITEMS MUST be specific to THIS entity — name the org, cite dollar amounts at risk, reference specific red flags found. "
            "Each item should answer: WHO should act, WHAT they should do, and WHY (citing evidence from the data). "
            "Do not give generic advice. Be specific. Reference real data. Do not invent facts."
        )

        user_content = f"Generate an OSINT investigation report for: {entity_name or bn}\n\n{internal_ctx}\n{external_ctx}"

        try:
            raw = await _call_llm(system_prompt, user_content)
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[-1]
            if cleaned.endswith("```"):
                cleaned = cleaned.rsplit("```", 1)[0]
            report = json.loads(cleaned)
        except json.JSONDecodeError:
            report["internal_summary"] = raw if internal else "Unable to parse AI response."
        except Exception as e:
            print(f"[OSINT] LLM synthesis failed: {e}")

    if not report.get("internal_summary") and not report.get("external_findings"):
        if internal:
            flags = internal.get("flags", [])
            total_govt = sum(float(y.get("total_govt", 0) or 0) for y in internal.get("funding_history", []))
            report["internal_summary"] = (
                f"**{internal.get('name', entity_name)}** has {len(internal.get('loops', []))} funding loop participations, "
                f"{len(internal.get('directors', []))} directors on record, and {len(internal.get('federal_grants', []))} federal grants. "
                f"Total government funding: ${total_govt:,.0f}. "
                f"Red flags: {', '.join(flags) if flags else 'none detected'}."
            )
        if deduped_external:
            sources_text = "\n".join(f"- [{s['title']}]({s['url']})" for s in deduped_external[:10] if s.get("url"))
            report["external_findings"] = f"Found {len(deduped_external)} external sources:\n\n{sources_text}"
        if not report.get("sentiment_analysis") and deduped_external:
            report["sentiment_analysis"] = f"NEUTRAL — {len(deduped_external)} external source(s) found. Manual review recommended."
        if not report.get("action_items"):
            items = []
            if internal:
                name = internal.get("name", entity_name)
                if internal.get("zombie_status", {}).get("is_zombie"):
                    items.append(f"IMMEDIATE: CRA Charities Directorate should audit {name} — charitable status revoked but received ${total_govt:,.0f} in government funding")
                if internal.get("loops"):
                    items.append(f"HIGH: Investigate {len(internal.get('loops', []))} funding loops involving {name} for potential circular receipt inflation — refer to CRA Audit Division")
                multi_board = [d for d in internal.get("directors", []) if (d.get("board_count") or 0) >= 3]
                if multi_board:
                    items.append(f"HIGH: Cross-reference {len(multi_board)} multi-board director(s) at {name} against other flagged organizations for governance network analysis")
                if internal.get("federal_grants"):
                    items.append(f"MEDIUM: Notify granting departments to flag future applications from {name} (BN: {bn}) pending investigation outcome")
            items.append("MEDIUM: Review external web sources for adverse media, court records, and regulatory enforcement actions")
            items.append("MEDIUM: Verify current CRA filing status and cross-reference with T3010 anomaly data")
            report["action_items"] = items

    return {
        "entity": entity_name,
        "bn": bn,
        "internal_record": {
            "name": internal.get("name", entity_name),
            "flags": internal.get("flags", []),
            "zombie_status": internal.get("zombie_status", {}),
            "loop_count": len(internal.get("loops", [])),
            "director_count": len(internal.get("directors", [])),
            "federal_grant_count": len(internal.get("federal_grants", [])),
            "funding_history": internal.get("funding_history", [])[:5],
        } if internal else None,
        "external_sources": deduped_external[:15],
        "report": report,
        "search_queries_used": search_queries,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# ── Entity Search & Dossier ──────────────────────────────────────────────────
@app.get("/api/entities/search")
def search_entities(
    q: str = Query(...),
    limit: int = Query(20),
):
    sql = """
        SELECT
            id, canonical_name, entity_type, bn_root,
            dataset_sources, source_link_count, confidence,
            COALESCE((fed_profile->>'total_funding')::numeric, 0) as fed_total,
            COALESCE((ab_profile->>'total_funding')::numeric, 0) as ab_total,
            cra_profile->>'registration_status' as cra_status
        FROM general.entity_golden_records
        WHERE upper(canonical_name) %% upper(%s)
           OR bn_root = LEFT(%s, 9)
        ORDER BY source_link_count DESC
        LIMIT %s
    """
    results = query_db(sql, (q, q, limit))
    if results is None:
        return {"results": [], "count": 0}
    return {"results": results, "count": len(results)}


@app.get("/api/entities/{entity_id}")
def get_entity_dossier(entity_id: int):
    sql = """
        SELECT
            gr.*,
            (SELECT json_agg(json_build_object(
                'source_schema', esl.source_schema,
                'source_table', esl.source_table,
                'source_name', esl.source_name,
                'match_method', esl.match_method,
                'match_confidence', esl.match_confidence
            )) FROM general.entity_source_links esl WHERE esl.entity_id = gr.id
            ) as source_links
        FROM general.entity_golden_records gr
        WHERE gr.id = %s
    """
    results = query_db(sql, (entity_id,))
    if not results:
        raise HTTPException(404, "Entity not found")
    return results[0]


# ── Entity Case File (deep-dive dossier) ─────────────────────────────────────
@app.get("/api/entity/{bn}")
def get_entity_case_file(bn: str):
    """Full accountability dossier for a single organization by BN."""
    if len(bn) < 9:
        raise HTTPException(400, "Invalid BN format — must be at least 9 characters")
    data = _duck.cached(f"entity:{bn}", _duck.get_entity_case_file_live, bn)
    # Append risk score — build a flat scoring dict with the field names risk_scorer expects
    try:
        from risk_scorer import calculate_score, get_triggered_flags
        zs       = data.get("zombie_status") or {}
        loops    = data.get("loops") or []
        dirs     = data.get("directors") or []
        fed_rows = data.get("federal_grants") or []
        scoring = {
            "govt_share":          (zs.get("govt_share_pct") or 0) / 100.0,
            "last_year":           zs.get("last_filing_year") or 9999,
            "total_govt":          zs.get("total_govt_funding") or 0,
            "loop_count":          data.get("loop_count") or 0,
            "loop_total":          max((l.get("total_flow") or 0 for l in loops), default=0),
            "max_loop_hops":       max((l.get("hops") or 0 for l in loops), default=0),
            "fed_total":           sum(r.get("amount") or 0 for r in fed_rows),
            "ab_total":            0,
            "max_director_boards": max((d.get("board_count") or 1 for d in dirs), default=0),
        }
        result = calculate_score(scoring)
        data["risk_score"]     = result["score"]
        data["risk_tier"]      = result["tier"]
        data["risk_breakdown"] = result["breakdown"]
        data["risk_flags"]     = get_triggered_flags(scoring, result["breakdown"])
    except Exception as e:
        print(f"[risk_scorer] entity scoring error: {e}")
        data.setdefault("risk_score", 0)
        data.setdefault("risk_tier", "low")
        data.setdefault("risk_breakdown", {})
        data.setdefault("risk_flags", [])
    return data


# ── Flagged Orgs Feed ─────────────────────────────────────────────────────────
@app.get("/api/flagged-orgs")
def get_flagged_orgs(
    limit:  int = Query(default=50, ge=1, le=200),
    filter: str = Query(default="all", max_length=20),
    sort:   str = Query(default="risk_score", max_length=20),
):
    """Risk-scored org feed for the homepage. filter: all|zombie|loop|duplicate|governance."""
    cache_key = f"flagged_orgs:{filter}:{sort}"
    orgs = _duck.cached(cache_key, _duck.get_flagged_orgs_live, limit, filter, sort)
    return {"orgs": orgs, "total": len(orgs)}


# ── CSV Export ────────────────────────────────────────────────────────────────
@app.get("/api/export/flagged-orgs.csv")
def export_flagged_orgs_csv(
    filter: str = Query(default="all", max_length=20),
    sort:   str = Query(default="risk_score", max_length=20),
):
    """Download flagged orgs as CSV. Always fetches fresh (bypasses cache)."""
    orgs = _duck.get_flagged_orgs_live(500, filter, sort)
    output = io.StringIO()
    fields = ["bn_root", "canonical_name", "city", "province",
              "risk_score", "tier", "flags", "combined_funding", "last_year",
              "loop_count", "max_director_boards"]
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in orgs:
        row = dict(row)
        row["flags"] = "|".join(row.get("flags") or [])
        writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=flagged-orgs.csv"},
    )


# ── Dashboard Featured Cases ──────────────────────────────────────────────────
@app.get("/api/dashboard/featured")
def get_dashboard_featured():
    """Top 5 pre-ranked high-impact entities for the Dashboard 'Start Here' section."""
    return _duck.cached("dashboard_featured", _duck.get_dashboard_featured_cases_live)


# ── AI Chat ──────────────────────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(body: dict):
    message = body.get("message", "").strip()
    if not message:
        raise HTTPException(400, "Message required")

    has_bedrock = bool(os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("BEDROCK_API_KEY"))
    has_anthropic = bool(os.getenv("ANTHROPIC_API_KEY"))

    if has_bedrock or has_anthropic:
        try:
            return await llm_enhanced_query(message)
        except Exception as e:
            print(f"[WARN] LLM call failed: {e} — falling back to template")
            err_hint = ""
            err_str = str(e)
            if "invalid x-api-key" in err_str or "authentication" in err_str.lower():
                err_hint = "\n\n_AI credentials invalid. Check ANTHROPIC_API_KEY in backend/.env (must start with sk-ant-)._"
            elif "model identifier is invalid" in err_str:
                err_hint = "\n\n_Bedrock model ID invalid. Check BEDROCK_MODEL_ID in backend/.env._"
            result = template_query(message)
            if err_hint:
                result["answer"] = result["answer"] + err_hint
            return result

    return template_query(message)


def _build_agentic_system_prompt() -> str:
    return """You are an AI investigator for "Follow The Money" — a Canadian government accountability platform. You are presenting to Ministers, Deputy Ministers, and senior public officials at the Agency 2026 Ottawa hackathon.

DATABASE (23M rows across 4 datasets):
- CRA T3010: ~85,000 registered charities, annual filings 2020-2024 (directors, financials, gift flows)
- Federal Grants & Contributions: 1.275M records from 51+ departments
- Alberta Open Data: 2.61M records — grants, contracts, sole-source, non-profit registry
- Entity Resolution: 851,000 canonical "golden records" linking all three sources

You have access to investigative tools that query a live database. USE THEM. Do not guess or make up data.

INVESTIGATION PROTOCOL:
1. When asked about a specific entity: search for it first, then pull the full dossier, then cross-reference with alerts
2. When asked about a pattern: use the relevant search tool, then explain what makes the top results suspicious
3. When asked to investigate broadly: pull stats first, then drill into the most alarming category
4. Always use at least one tool before responding — never answer from memory alone

RESPONSE STYLE:
- Lead with the most alarming finding
- Use **bold** for key facts (org names, dollar amounts)
- Cite specific organizations, dollar amounts, and BN numbers from tool results
- Explain WHY something is suspicious — not just that a number is large
- Think like a forensic auditor presenting to a Minister"""


INVESTIGATOR_TOOLS = [
    {
        "name": "search_zombies",
        "description": "Find zombie recipients — organizations that received large government funding then had CRA status revoked/annulled. Returns top results by funding amount. Use when asked about dead charities, dissolved orgs, or ceased operations.",
        "input_schema": {
            "type": "object",
            "properties": {
                "min_funding": {"type": "number", "description": "Minimum govt funding threshold in dollars", "default": 100000},
                "limit": {"type": "integer", "description": "Max results", "default": 15}
            }
        }
    },
    {
        "name": "search_funding_loops",
        "description": "Find circular funding loops where money flows A->B->C->...->A between charities. Returns loops with flow amounts, hop counts, and suspicion scores. Use for circular gifting, receipt inflation, round-trip flows.",
        "input_schema": {
            "type": "object",
            "properties": {
                "min_hops": {"type": "integer", "description": "Minimum loop length", "default": 2},
                "max_hops": {"type": "integer", "description": "Maximum loop length", "default": 6},
                "limit": {"type": "integer", "default": 15}
            }
        }
    },
    {
        "name": "search_governance",
        "description": "Find directors who sit on multiple government-funded charity boards simultaneously. Returns directors with board counts and total controlled funding. Use for governance networks, conflicts of interest, related parties.",
        "input_schema": {
            "type": "object",
            "properties": {
                "min_boards": {"type": "integer", "description": "Minimum number of boards", "default": 3},
                "limit": {"type": "integer", "default": 15}
            }
        }
    },
    {
        "name": "search_sole_source",
        "description": "Find sole-source (no-bid) Alberta contracts with high amendment ratios suggesting contract creep. Use for procurement abuse, no-bid contracts, vendor lock-in.",
        "input_schema": {
            "type": "object",
            "properties": {
                "min_ratio": {"type": "number", "description": "Minimum amendment ratio (amended/original)", "default": 3.0},
                "limit": {"type": "integer", "default": 15}
            }
        }
    },
    {
        "name": "search_vendor_concentration",
        "description": "Analyze vendor concentration by department, NAICS sector, or region using HHI index. Finds monopoly/oligopoly patterns in government spending.",
        "input_schema": {
            "type": "object",
            "properties": {
                "dimension": {"type": "string", "enum": ["department", "naics", "region"], "default": "department"},
                "limit": {"type": "integer", "default": 15}
            }
        }
    },
    {
        "name": "search_duplicative_funding",
        "description": "Find organizations receiving funding from both federal and Alberta governments simultaneously. Identifies potential duplication of public spending.",
        "input_schema": {
            "type": "object",
            "properties": {
                "min_fed": {"type": "number", "description": "Minimum federal funding", "default": 100000},
                "min_ab": {"type": "number", "description": "Minimum Alberta funding", "default": 100000},
                "limit": {"type": "integer", "default": 15}
            }
        }
    },
    {
        "name": "search_threshold_gaming",
        "description": "Find grants clustered just below competitive bidding thresholds ($25K, $100K, $1M). Suggests deliberate structuring to avoid oversight.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 15}
            }
        }
    },
    {
        "name": "get_entity_dossier",
        "description": "Get a COMPLETE accountability dossier for one organization by CRA Business Number (BN). Includes: funding history, loop participation, directors, T3010 filing anomalies, overhead ratio, federal grants, related entities. This is the deep-dive tool.",
        "input_schema": {
            "type": "object",
            "properties": {
                "bn": {"type": "string", "description": "9 or 15 character CRA Business Number"}
            },
            "required": ["bn"]
        }
    },
    {
        "name": "search_entities",
        "description": "Search for organizations by name across all datasets (CRA charities, federal grants, Alberta contracts). Returns matching entities with BN numbers you can use with get_entity_dossier.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Organization name to search for"},
                "limit": {"type": "integer", "default": 8}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_cross_challenge_alerts",
        "description": "Find entities flagged across MULTIPLE challenge categories (zombie + loop + governance overlap). These are the highest-risk cases where problems compound.",
        "input_schema": {
            "type": "object",
            "properties": {
                "min_flags": {"type": "integer", "description": "Minimum number of flag categories", "default": 2},
                "limit": {"type": "integer", "default": 15}
            }
        }
    },
    {
        "name": "get_platform_stats",
        "description": "Get aggregate statistics across all datasets — total charities, grant records, funding amounts, zombie counts, loop counts. Use for overview/summary questions.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "web_search",
        "description": "Search the open web via DuckDuckGo for external information — news articles, court records, CRA registry pages, media coverage. Use for OSINT, adverse media checks, or when internal data alone isn't enough to assess an entity.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query (e.g. '\"Salvation Army\" Canada CRA fraud')"},
                "max_results": {"type": "integer", "description": "Number of results", "default": 5}
            },
            "required": ["query"]
        }
    },
]


def _execute_tool(name: str, input_data: dict) -> str:
    """Execute an investigator tool and return JSON string result."""
    try:
        if name == "search_zombies":
            result = _data_zombies(input_data.get("min_funding", 100000), input_data.get("limit", 15))
        elif name == "search_funding_loops":
            result = _data_loops(input_data.get("min_hops", 2), input_data.get("max_hops", 6), input_data.get("limit", 15))
        elif name == "search_governance":
            result = _data_governance(input_data.get("min_boards", 3), input_data.get("limit", 15))
        elif name == "search_sole_source":
            result = _data_sole_source(input_data.get("min_ratio", 3.0), input_data.get("limit", 15))
        elif name == "search_vendor_concentration":
            dim = input_data.get("dimension", "department")
            lim = input_data.get("limit", 15)
            result = _duck.cached(f"vc:{dim}:1000000:{lim}", _duck.get_vendor_concentration_live, dim, 1_000_000, lim)
        elif name == "search_duplicative_funding":
            result = _duck.get_duplicative_funding_live(
                input_data.get("min_fed", 100000), input_data.get("min_ab", 100000), input_data.get("limit", 15)
            )
        elif name == "search_threshold_gaming":
            lim = input_data.get("limit", 15)
            result = _duck.cached(f"threshold_gaming:{lim}", _duck.get_threshold_gaming_live, lim)
        elif name == "get_entity_dossier":
            bn = input_data.get("bn", "")
            result = _duck.get_entity_case_file_live(bn)
        elif name == "search_entities":
            q = input_data.get("query", "")
            lim = input_data.get("limit", 8)
            results = []
            if DUCKDB_MODE:
                for tbl_key, fields in [
                    ("cra__cra_identification", ["bn", "legal_name"]),
                    ("cra__govt_funding_by_charity", ["bn", "legal_name"]),
                ]:
                    try:
                        rows = _duck.query(f"SELECT DISTINCT LEFT(bn,9) as bn, legal_name FROM {tbl_key} WHERE LOWER(legal_name) LIKE '%{q.lower().replace(chr(39), '')}%' LIMIT {lim}")
                        results.extend(rows)
                    except Exception:
                        pass
            seen = set()
            deduped = []
            for r in results:
                bn9 = str(r.get("bn", ""))[:9]
                if bn9 not in seen:
                    seen.add(bn9)
                    deduped.append(r)
            result = deduped[:lim]
        elif name == "get_cross_challenge_alerts":
            result = _data_alerts(input_data.get("min_flags", 2), input_data.get("limit", 15))
        elif name == "get_platform_stats":
            result = _data_stats()
        elif name == "web_search":
            result = _web_search(input_data.get("query", ""), input_data.get("max_results", 5))
        else:
            result = {"error": f"Unknown tool: {name}"}
    except Exception as e:
        result = {"error": str(e)}

    raw = json.dumps(result, default=str)
    if len(raw) > 12000:
        if isinstance(result, list):
            while len(json.dumps(result, default=str)) > 11000 and len(result) > 1:
                result = result[:len(result) // 2]
            result.append({"_note": "results truncated for context window"})
            raw = json.dumps(result, default=str)
        elif isinstance(result, dict) and "results" in result and isinstance(result["results"], list):
            r = result["results"]
            while len(json.dumps(result, default=str)) > 11000 and len(r) > 1:
                result["results"] = r[:len(r) // 2]
                r = result["results"]
            raw = json.dumps(result, default=str)
        else:
            raw = json.dumps({"summary": raw[:8000], "_truncated": True}, default=str)
    return raw


def _infer_data_type(tools_used: list) -> str:
    tool_to_type = {
        "search_zombies": "zombies",
        "search_funding_loops": "loops",
        "search_governance": "governance",
        "search_sole_source": "sole_source",
        "search_vendor_concentration": "vendor_concentration",
        "search_duplicative_funding": "duplicative_funding",
        "search_threshold_gaming": "threshold_gaming",
        "get_entity_dossier": "entity",
        "search_entities": "entity",
        "get_cross_challenge_alerts": "alerts",
        "get_platform_stats": "stats",
    }
    for t in tools_used:
        dt = tool_to_type.get(t.get("tool"))
        if dt:
            return dt
    return "help"


async def _call_llm_with_tools(system: str, messages: list, tools: list) -> dict:
    """Call LLM with tool_use support. Bedrock primary, Anthropic fallback. Returns normalized response."""
    aws_key = os.getenv("AWS_ACCESS_KEY_ID")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    if aws_key:
        try:
            return await _call_bedrock_with_tools(system, messages, tools)
        except Exception as e:
            print(f"[Bedrock tools] Failed: {e}")
            if not anthropic_key:
                raise

    if anthropic_key:
        return await _call_anthropic_with_tools(system, messages, tools, anthropic_key)

    raise RuntimeError("No AI credentials configured")


async def _call_anthropic_with_tools(system: str, messages: list, tools: list, api_key: str) -> dict:
    """Anthropic SDK native tool_use."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=api_key)
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

    response = await client.messages.create(
        model=model,
        max_tokens=2048,
        system=system,
        messages=messages,
        tools=tools,
    )

    content = []
    for block in response.content:
        if block.type == "text":
            content.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            content.append({"type": "tool_use", "id": block.id, "name": block.name, "input": block.input})

    return {"content": content, "stop_reason": response.stop_reason}


async def _call_bedrock_with_tools(system: str, messages: list, tools: list) -> dict:
    """AWS Bedrock converse API with toolConfig."""
    import boto3

    client = boto3.client(
        "bedrock-runtime",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.getenv("AWS_SESSION_TOKEN") or None,
    )
    model_id = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6")

    bedrock_tools = [
        {
            "toolSpec": {
                "name": t["name"],
                "description": t["description"],
                "inputSchema": {"json": t["input_schema"]}
            }
        }
        for t in tools
    ]

    def _to_bedrock_messages(msgs):
        bedrock_msgs = []
        for msg in msgs:
            role = msg["role"]
            raw_content = msg["content"]

            if isinstance(raw_content, str):
                bedrock_msgs.append({"role": role, "content": [{"text": raw_content}]})
            elif isinstance(raw_content, list):
                bedrock_content = []
                for block in raw_content:
                    if isinstance(block, dict):
                        if block.get("type") == "text":
                            bedrock_content.append({"text": block["text"]})
                        elif block.get("type") == "tool_use":
                            bedrock_content.append({
                                "toolUse": {
                                    "toolUseId": block["id"],
                                    "name": block["name"],
                                    "input": block["input"],
                                }
                            })
                        elif block.get("type") == "tool_result":
                            bedrock_content.append({
                                "toolResult": {
                                    "toolUseId": block["tool_use_id"],
                                    "content": [{"text": block["content"] if isinstance(block["content"], str) else json.dumps(block["content"])}],
                                }
                            })
                bedrock_msgs.append({"role": role, "content": bedrock_content})
        return bedrock_msgs

    bedrock_msgs = _to_bedrock_messages(messages)

    response = client.converse(
        modelId=model_id,
        system=[{"text": system}],
        messages=bedrock_msgs,
        toolConfig={"tools": bedrock_tools},
        inferenceConfig={"maxTokens": 2048, "temperature": 0.5},
    )

    content = []
    for block in response["output"]["message"]["content"]:
        if "text" in block:
            content.append({"type": "text", "text": block["text"]})
        elif "toolUse" in block:
            tu = block["toolUse"]
            content.append({"type": "tool_use", "id": tu["toolUseId"], "name": tu["name"], "input": tu["input"]})

    return {"content": content, "stop_reason": response.get("stopReason", "end_turn")}


async def llm_enhanced_query(message: str) -> dict:
    """Agentic AI: Claude autonomously queries the database using tools, then synthesizes findings."""
    system = _build_agentic_system_prompt()
    messages = [{"role": "user", "content": message}]

    all_tool_calls = []
    max_turns = 6

    for turn in range(max_turns):
        response = await _call_llm_with_tools(system, messages, INVESTIGATOR_TOOLS)

        tool_uses = [b for b in response["content"] if b.get("type") == "tool_use"]
        text_blocks = [b for b in response["content"] if b.get("type") == "text"]

        if not tool_uses:
            final_text = "\n".join(b["text"] for b in text_blocks)
            break

        messages.append({"role": "assistant", "content": response["content"]})

        tool_results = []
        for tu in tool_uses:
            print(f"  [Agent] Tool call: {tu['name']}({json.dumps(tu['input'], default=str)[:100]})")
            result_str = _execute_tool(tu["name"], tu["input"])
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tu["id"],
                "content": result_str,
            })
            all_tool_calls.append({"tool": tu["name"], "input": tu["input"]})

        messages.append({"role": "user", "content": tool_results})
    else:
        final_text = "\n".join(b["text"] for b in text_blocks) if text_blocks else "Investigation complete — reached maximum analysis depth."

    data_type = _infer_data_type(all_tool_calls)
    tools_used = [t["tool"] for t in all_tool_calls]

    follow_ups = []
    if "search_zombies" in tools_used:
        follow_ups.append("Which zombie received the most government funding?")
    if "search_funding_loops" in tools_used:
        follow_ups.append("Show me same-year loops that suggest receipt inflation")
    if "get_entity_dossier" in tools_used:
        follow_ups.append("Cross-reference this entity with funding loops and governance networks")
    if not follow_ups:
        follow_ups = ["Show me the highest-risk entities across all categories", "Which directors control the most public funding?", "Investigate the largest funding loops"]

    return {
        "answer": final_text,
        "data_type": data_type,
        "data": [],
        "sql_hint": f"Agentic AI — {len(all_tool_calls)} tool calls across {len(set(tools_used))} data sources",
        "follow_up": follow_ups[:3],
        "tools_used": tools_used,
    }


# ── OSINT / Web Search Helpers ──────────────────────────────────────────────
import time as _time

_DDGS_AVAILABLE = False
try:
    from ddgs import DDGS
    _DDGS_AVAILABLE = True
except ImportError:
    try:
        from duckduckgo_search import DDGS
        _DDGS_AVAILABLE = True
    except ImportError:
        pass


def _web_search(query: str, max_results: int = 5) -> list[dict]:
    if not _DDGS_AVAILABLE:
        return []
    for attempt in range(2):
        try:
            results = list(DDGS().text(query, max_results=max_results))
            print(f"[OSINT] web search '{query[:50]}' → {len(results)} results")
            return results
        except Exception as e:
            if "Ratelimit" in str(e) and attempt == 0:
                _time.sleep(2)
                continue
            print(f"[OSINT] web search failed: {e}")
            return []
    return []


def _web_news(query: str, max_results: int = 5) -> list[dict]:
    if not _DDGS_AVAILABLE:
        return []
    for attempt in range(2):
        try:
            results = list(DDGS().news(query, max_results=max_results))
            print(f"[OSINT] news search '{query[:50]}' → {len(results)} results")
            return results
        except Exception as e:
            if "Ratelimit" in str(e) and attempt == 0:
                _time.sleep(2)
                continue
            print(f"[OSINT] news search failed: {e}")
            return []
    return []


# ── LLM Helpers ─────────────────────────────────────────────────────────────
async def _call_llm(system: str, user_content: str) -> str:
    """Call Claude via AWS Bedrock (primary on event day) or Anthropic API (fallback)."""
    bedrock_api_key = os.getenv("BEDROCK_API_KEY")
    aws_key = os.getenv("AWS_ACCESS_KEY_ID")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    if bedrock_api_key or aws_key:
        return await _call_bedrock(system, user_content)
    elif anthropic_key:
        return await _call_anthropic(system, user_content, anthropic_key)
    else:
        raise RuntimeError("No AI credentials configured")


async def _call_bedrock(system: str, user_content: str) -> str:
    region = os.getenv("AWS_REGION", "us-east-1")
    model_id = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6")
    bedrock_api_key = os.getenv("BEDROCK_API_KEY")

    if bedrock_api_key:
        # Bearer token auth via Bedrock API Key
        import urllib.request
        url = f"https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/converse"
        payload = json.dumps({
            "system": [{"text": system}],
            "messages": [{"role": "user", "content": [{"text": user_content}]}],
            "inferenceConfig": {"maxTokens": 1800, "temperature": 0.7},
        }).encode()
        req = urllib.request.Request(
            url, data=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {bedrock_api_key}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        return data["output"]["message"]["content"][0]["text"]
    else:
        # Traditional IAM SigV4 auth
        import boto3
        client = boto3.client(
            "bedrock-runtime",
            region_name=region,
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            aws_session_token=os.getenv("AWS_SESSION_TOKEN") or None,
        )
        response = client.converse(
            modelId=model_id,
            system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": user_content}]}],
            inferenceConfig={"maxTokens": 1800, "temperature": 0.7},
        )
        return response["output"]["message"]["content"][0]["text"]


async def _call_anthropic(system: str, user_content: str, api_key: str) -> str:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=api_key)
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

    response = await client.messages.create(
        model=model,
        max_tokens=1800,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    )

    return response.content[0].text


async def _call_llm_simple(prompt: str) -> str:
    """Unified LLM call for short narrative generation. Bedrock -> Anthropic cascade."""
    system = (
        "You are an investigative analyst for a Canadian government accountability tool. "
        "Be specific with names and dollar amounts. Plain text only, no markdown."
    )
    return await _call_llm(system, prompt)


# ── Internal data helpers (plain Python types — safe to call from non-route code) ─
def _data_zombies(min_funding: float = 100000, limit: int = 20) -> dict:
    results = _duck.cached(f"zombies:{min_funding}:{limit}", _duck.get_zombies_live, min_funding, limit)
    return {"results": results, "count": len(results)}

def _data_loops(min_hops: int = 2, max_hops: int = 6, limit: int = 20) -> dict:
    results = _duck.cached(
        f"loops_enriched:{min_hops}:{max_hops}:0:0:False:::{limit}",
        _duck.get_loops_enriched_live, min_hops, max_hops, 0, 0, False, "", "", limit,
    )
    return {"results": results, "count": len(results)}

def _data_governance(min_boards: int = 3, limit: int = 20) -> dict:
    results = _duck.cached(f"governance:{min_boards}:{limit}", _duck.get_governance_live, min_boards, limit)
    return {"results": results, "count": len(results)}

def _data_sole_source(min_ratio: float = 3.0, limit: int = 20) -> dict:
    results = _duck.cached(f"sole_source:{min_ratio}:{limit}", _duck.get_sole_source_live, min_ratio, limit)
    stats = _duck.cached("sole_source_stats", _duck.get_sole_source_stats_live)
    return {"results": results, "stats": stats, "count": len(results)}

def _data_alerts(min_flags: int = 2, limit: int = 20) -> dict:
    results = _duck.cached(f"alerts:{min_flags}:{limit}", _duck.get_alerts_live, min_flags, limit)
    return {"results": results, "count": len(results)}

def _data_stats() -> dict:
    return _duck.cached("stats", _duck.get_stats_live) or {}


def template_query(message: str) -> dict:
    """Fallback when no AI key is configured."""
    msg = message.lower()

    if any(w in msg for w in ["zombie", "dissolved", "ceased", "revoked", "dead"]):
        data = _data_zombies(min_funding=100000, limit=20)
        return {
            "answer": f"I found **{data['count']} zombie recipients** — organizations that received significant public funding and then had their charitable status revoked or annulled.",
            "data_type": "zombies",
            "data": data["results"][:10],
            "sql_hint": "Queried govt_funding_by_charity for high govt-dependency orgs that stopped filing",
            "follow_up": ["Show me the top 5 by funding amount", "Which ones were in Alberta?", "What was their last filing year?"],
        }
    elif any(w in msg for w in ["loop", "circular", "cycle", "round-trip", "gifting circle"]):
        data = _data_loops(min_hops=2, max_hops=6, limit=20)
        return {
            "answer": f"I detected **{data['count']} funding loops** in the charity sector. These are circular gift flows where money moves from Charity A → B → C → back to A.",
            "data_type": "loops",
            "data": data["results"][:10],
            "sql_hint": "Queried cra.loops table with SCC decomposition results",
            "follow_up": ["Show me the largest loop by dollar amount", "Which charities appear in multiple loops?", "Are any loops same-year transactions?"],
        }
    elif any(w in msg for w in ["director", "board", "governance", "related part", "network", "control"]):
        data = _data_governance(min_boards=3, limit=20)
        return {
            "answer": f"I found **{data['count']} individuals** who sit on 3+ charity boards simultaneously. Some control organizations that fund each other, creating potential conflicts of interest.",
            "data_type": "governance",
            "data": data["results"][:10],
            "sql_hint": "Cross-referenced cra_directors with loop_charity_financials for multi-board directors",
            "follow_up": ["Who controls the most funding?", "Do any of these directors' organizations fund each other?", "Show me the governance network graph"],
        }
    # CHALLENGE 5
    elif any(w in msg for w in ["concentration", "monopoly", "hhi", "incumbent", "market share", "vendor lock"]):
        if DUCKDB_MODE:
            vc_results = _duck.cached("vc:department:1000000:10", _duck.get_vendor_concentration_live, "department", 1_000_000, 10)
            vc_stats = _duck.cached("vc_stats", _duck.get_vendor_concentration_stats_live) or {}
        else:
            vc_results, vc_stats = [], {}
        return {
            "answer": f"**Vendor Concentration Analysis (Challenge #5)**: Across federal departments with >$1M in spending, **{vc_stats.get('highly_concentrated', 0)} departments** are highly concentrated (HHI >2,500). There are **{vc_stats.get('monopoly_programs', 0)} monopoly programs** where a single recipient receives all funding >$1M.",
            "data_type": "vendor_concentration",
            "data": vc_results[:10],
            "sql_hint": "Computed HHI (Herfindahl-Hirschman Index) per department from fed.grants_contributions",
            "follow_up": ["Show me the most concentrated departments", "Which vendors appear across the most departments?", "Show monopoly programs"],
        }
    # END CHALLENGE 5
    elif any(w in msg for w in ["sole source", "no-bid", "amendment", "contract", "vendor"]):
        data = _data_sole_source(min_ratio=3.0, limit=20)
        return {
            "answer": f"**Sole-source contract analysis**: Alberta's dataset contains **{data['stats'].get('total_sole_source_contracts', 0):,} sole-source contracts**. I've identified patterns of vendor concentration and near-threshold contract splitting.",
            "data_type": "sole_source",
            "data": data["results"][:10],
            "sql_hint": "Queried ab_sole_source for vendor concentration and threshold proximity",
            "follow_up": ["Show me contracts near the $50K competitive threshold", "Which departments rely most on sole-source?", "Find contract splitting patterns"],
        }
    elif any(w in msg for w in ["alert", "flag", "critical", "worst", "multi", "intersection"]):
        data = _data_alerts(min_flags=2, limit=20)
        return {
            "answer": f"**Multi-flag alert analysis**: I found **{data['count']} entities** flagged across multiple challenge categories simultaneously — the highest-priority accountability failures.",
            "data_type": "alerts",
            "data": data["results"][:10],
            "sql_hint": "Cross-joined zombie, loop membership, and governance flags",
            "follow_up": ["Show me entities with 3+ flags", "Which director controls the most flagged entities?", "Show me the funding loop with zombie participants"],
        }
    elif any(w in msg for w in ["how much", "total", "spending", "overview", "summary"]):
        stats = _data_stats()
        return {
            "answer": f"**Platform Overview**: Tracking {stats.get('total_entities', 'N/A'):,} organizations across CRA charity filings, {stats.get('total_fed_grants', 'N/A'):,} federal grants, and {stats.get('total_ab_grants', 'N/A'):,} Alberta grant payments.",
            "data_type": "stats",
            "data": stats,
            "sql_hint": "Aggregated counts across all four datasets",
            "follow_up": ["Show me zombies", "Explore funding loops", "Show multi-flag alerts"],
        }
    elif any(w in msg for w in ["investigate", "risk", "worst", "high", "top", "find", "show", "search"]):
        data = _data_alerts(min_flags=2, limit=10)
        stats = _data_stats()
        top_cases = []
        for a in (data.get("results") or [])[:5]:
            name = a.get("canonical_name", "Unknown")
            funding = float(a.get("total_govt_funding") or 0)
            flags = ", ".join(a.get("flags") or [])
            top_cases.append(f"• **{name}** — ${funding:,.0f} govt funding, flagged for: {flags}")
        cases_text = "\n".join(top_cases) if top_cases else "No multi-flag entities found."
        return {
            "answer": f"**Cross-Challenge Investigation** (AI credentials not configured — showing database results directly)\n\nI found **{data['count']} entities** flagged across multiple accountability categories. Here are the highest-risk cases:\n\n{cases_text}\n\n_Configure ANTHROPIC_API_KEY in backend/.env for full agentic AI investigation._",
            "data_type": "alerts",
            "data": (data.get("results") or [])[:10],
            "sql_hint": "Cross-challenge alert query — zombie + loop + governance overlap",
            "follow_up": ["Show me zombie recipients", "Find funding loops", "Show governance networks"],
        }
    else:
        data = _data_alerts(min_flags=2, limit=5)
        stats = _data_stats()
        return {
            "answer": f"**Platform Overview**: Tracking **{stats.get('total_charities', 0):,}** charities, **{stats.get('total_fed_grants', 0):,}** federal grants, and **{stats.get('total_sole_source', 0):,}** procurement contracts.\n\nTry asking about:\n• **Zombie recipients** — organizations that vanished after receiving funding\n• **Funding loops** — circular money flows between charities\n• **Governance networks** — directors controlling multiple funded entities\n• **Sole-source contracts** — amendment creep and vendor lock-in\n• **Multi-flag alerts** — entities flagged across multiple challenges",
            "data_type": "help",
            "data": (data.get("results") or [])[:5],
            "sql_hint": None,
            "follow_up": ["Show me zombie recipients", "Find funding loops", "Show multi-flag alerts"],
        }


# ── Global Search ─────────────────────────────────────────────────────────────
@app.get("/api/search")
def global_search(q: str = Query(...), limit: int = Query(10)):
    """Full-text search across all challenge datasets + charities + federal grants."""
    if not DUCKDB_MODE or not q.strip():
        return {"results": {}, "total": 0, "query": q}

    q_safe = q.replace("'", "").replace(";", "").replace("--", "").strip()
    q_lower = q_safe.lower()
    results = {
        "entities": [], "charities": [], "zombies": [], "loops": [],
        "governance": [], "sole_source": [], "alerts": [],
        "federal_grants": [], "ghost_recipients": [], "threshold_gaming": [],
    }

    # 1. PostgreSQL cross-dataset entity search (confidence-ranked)
    results["entities"] = _pg_entity_search(q, limit=limit)

    # 2. Direct DuckDB charity name/BN search (covers ALL 91K charities)
    try:
        rows = _duck.query(
            f"SELECT DISTINCT LEFT(bn,9) AS bn, legal_name AS canonical_name "
            f"FROM cra__cra_identification "
            f"WHERE LOWER(legal_name) LIKE '%{q_lower}%' OR LEFT(bn,9) LIKE '{q_safe}%' "
            f"LIMIT {limit}"
        )
        # Deduplicate against PG entities
        pg_bns = {(e.get("bn_root") or e.get("bn", ""))[:9] for e in results["entities"]}
        results["charities"] = [r for r in rows if r.get("bn", "")[:9] not in pg_bns][:limit]
    except Exception as e:
        print(f"[Search] charity lookup failed: {e}")

    fetch = limit * 8

    # 3. Zombies
    try:
        rows = _duck.cached(f"zombies:100000:{fetch}", _duck.get_zombies_live, 100000, fetch)
        results["zombies"] = [r for r in rows if q_lower in (r.get("canonical_name") or "").lower() or q_lower in (r.get("bn") or "").lower()][:limit]
    except Exception:
        pass

    # 4. Loops
    try:
        rows = _duck.cached(f"loops:2:6:0:0:False:::{fetch}", _duck.get_loops_live, 2, 6, 0, 0, False, "", fetch)
        results["loops"] = [r for r in rows if q_lower in (r.get("path_display") or "").lower()][:limit]
    except Exception:
        pass

    # 5. Governance (directors)
    try:
        rows = _duck.cached(f"governance:2:{fetch}", _duck.get_governance_live, 2, fetch)
        results["governance"] = [r for r in rows if q_lower in (r.get("first_name") or "").lower() or q_lower in (r.get("last_name") or "").lower() or q_lower in f"{r.get('first_name', '')} {r.get('last_name', '')}".lower()][:limit]
    except Exception:
        pass

    # 6. Sole source (vendor + department)
    try:
        rows = _duck.cached(f"sole_source:1.0:{fetch}", _duck.get_sole_source_live, 1.0, fetch)
        results["sole_source"] = [r for r in rows if q_lower in (r.get("vendor") or "").lower() or q_lower in (r.get("department") or "").lower()][:limit]
    except Exception:
        pass

    # 7. Alerts
    try:
        rows = _duck.cached(f"alerts:1:{fetch}", _duck.get_alerts_live, 1, fetch)
        results["alerts"] = [r for r in rows if q_lower in (r.get("canonical_name") or "").lower()][:limit]
    except Exception:
        pass

    # 8. Federal grants (recipient name + department)
    try:
        rows = _duck.query(
            f"SELECT recipient_name, owner_org AS department, "
            f"TRY_CAST(value AS DOUBLE) AS amount, fiscal_year, "
            f"LEFT(recipient_business_number, 9) AS bn "
            f"FROM fed__grants_contributions "
            f"WHERE LOWER(recipient_name) LIKE '%{q_lower}%' OR LOWER(owner_org) LIKE '%{q_lower}%' "
            f"ORDER BY TRY_CAST(value AS DOUBLE) DESC NULLS LAST "
            f"LIMIT {limit}"
        )
        results["federal_grants"] = rows
    except Exception as e:
        print(f"[Search] federal grants search failed: {e}")

    # 9. Ghost recipients
    try:
        rows = _duck.cached(f"ghost:500000:{fetch}", _duck.get_ghost_recipients_live, 500000, fetch)
        results["ghost_recipients"] = [r for r in rows if q_lower in (r.get("recipient_name") or r.get("canonical_name") or "").lower()][:limit]
    except Exception:
        pass

    # 10. Vendor concentration
    try:
        rows = _duck.cached(f"vc:department:1000000:{fetch}", _duck.get_vendor_concentration_live, "department", 1_000_000, fetch)
        results["threshold_gaming"] = []  # vendor concentration results don't have searchable names in the same way
    except Exception:
        pass

    # Strip empty categories
    results = {k: v for k, v in results.items() if v}
    total = sum(len(v) for v in results.values())
    return {"results": results, "total": total, "query": q}


# ── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    has_ai = bool(os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("BEDROCK_API_KEY") or os.getenv("ANTHROPIC_API_KEY"))
    mode = "duckdb-live" if DUCKDB_MODE else "postgres"
    return {
        "status": "healthy",
        "query_mode": mode,
        "ai_enabled": has_ai,
        "pg_connected": _pg_connected,
        "pg_tables": _pg_tables,
        "pg_table_count": len(_pg_tables),
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
    }


if __name__ == "__main__":
    import uvicorn
    import socket
    import sys

    # Fix Python 3.10 Windows ProactorEventLoop self-pipe crash
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    # Check if port 8000 is already in use (zombie socket or other process)
    # If so, fall back to port 8001
    default_port = 8000
    test_socket = None
    try:
        test_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        test_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        test_socket.bind(('0.0.0.0', default_port))
        test_socket.close()
        print(f"[INFO] Port {default_port} is available")
    except OSError:
        print(f"[WARN] Port {default_port} is in use (zombie socket?); falling back to 8001")
        default_port = 8001
    finally:
        if test_socket:
            try:
                test_socket.close()
            except:
                pass

    # Configure socket to allow immediate reuse and avoid TIME_WAIT blocking
    config = uvicorn.Config(
        "main:app",
        host="0.0.0.0",
        port=default_port,
        reload=False,
        server_header=False,
    )

    # Create a custom socket factory that enables SO_REUSEADDR
    original_socket = socket.socket
    def socket_with_options(*args, **kwargs):
        sock = original_socket(*args, **kwargs)
        # Enable SO_REUSEADDR for immediate port reuse after shutdown
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        # Try to enable SO_REUSEPORT (may not be available on all systems)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
        except (AttributeError, OSError):
            pass
        return sock

    socket.socket = socket_with_options

    server = uvicorn.Server(config)
    server.run()
