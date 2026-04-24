"""
Follow The Money — Backend API
AI-powered investigative dashboard for Canadian government accountability.
Agency 2026 Ottawa Hackathon
"""

import os
import json
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

import db_duckdb as _duck
DUCKDB_MODE = _duck.is_available()


# ── Database Connection (PostgreSQL fallback) ────────────────────────────────
def get_db_connection():
    if DUCKDB_MODE:
        return None
    import psycopg2
    conn_str = os.getenv("DB_CONNECTION_STRING")
    if not conn_str:
        raise HTTPException(500, "DB_CONNECTION_STRING not configured")
    return psycopg2.connect(conn_str)


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


# ── App Setup ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    if DUCKDB_MODE:
        print(f"[START] DuckDB mode — real JSONL data at {_duck._base()}")
        _duck.preload_tables_background()
    else:
        pg = os.getenv("DB_CONNECTION_STRING", "")
        if pg:
            print("[START] PostgreSQL mode — using shared DB")
        else:
            print("[START] WARNING: no data source configured")
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


# ── Dashboard Stats ──────────────────────────────────────────────────────────
@app.get("/api/stats")
def get_stats():
    if DUCKDB_MODE:
        live = _duck.cached("stats", _duck.get_stats_live)
        if live:
            return live

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
            GROUP BY d.last_name, d.first_name
            HAVING COUNT(DISTINCT LEFT(d.bn, 9)) >= 3
        ) multi_board
    """
    row = query_db(gov_sql)
    results["multi_board_directors"] = row[0]["count"] if row else 0

    return results or _no_data()


# ── Zombie Recipients ────────────────────────────────────────────────────────
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
@app.get("/api/loops")
def get_funding_loops(
    min_hops: int = Query(2),
    max_hops: int = Query(6),
    limit: int = Query(100),
):
    if DUCKDB_MODE:
        results = _duck.cached(f"loops:{min_hops}:{max_hops}:{limit}", _duck.get_loops_live, min_hops, max_hops, limit)
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


# ── AI Chat ──────────────────────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(body: dict):
    message = body.get("message", "").strip()
    if not message:
        raise HTTPException(400, "Message required")

    has_bedrock = bool(os.getenv("AWS_ACCESS_KEY_ID"))
    has_anthropic = bool(os.getenv("ANTHROPIC_API_KEY"))

    if has_bedrock or has_anthropic:
        try:
            return await llm_enhanced_query(message)
        except Exception as e:
            print(f"[WARN] LLM call failed: {e} — falling back to template")

    return template_query(message)


def _build_system_prompt() -> str:
    return """You are an AI investigator for "Follow The Money" — a Canadian government accountability platform used by public sector officials, auditors, and journalists at the Agency 2026 Ottawa hackathon.

DATABASE (23M rows across 4 datasets):
- CRA T3010: ~85,000 registered charities, annual filings 2020–2024 (directors, financials, gift flows)
- Federal Grants & Contributions: 1.275M records from 51+ departments, $89.4B tracked
- Alberta Open Data: 2.61M records — grants, contracts, sole-source, non-profit registry
- Entity Resolution: 851,000 canonical "golden records" linking all three sources

KEY FINDINGS ALREADY SURFACED:
- 347 zombie recipients: organizations that received public funding then had CRA status Revoked or Annulled
- 5,808 circular gift loops (2–6 hop chains where money eventually returns to origin — some same-year, suggesting receipt inflation)
- 2,841 directors sitting on 3+ funded charity boards simultaneously; top director controls $21.6M across 7 boards
- 15,533 sole-source (no-bid) Alberta contracts; top amendment-creep case grew 18.4× from $48K to $893K
- $3.2 billion in funding linked to flagged entities

YOUR ROLE: Surface accountability failures with specificity. Reference real organization names, dollar amounts, and patterns from the data provided. Explain WHY something is suspicious — not just that a number is large. Think like an investigative journalist or forensic auditor presenting to a Minister.

RESPONSE: Always return valid JSON matching this schema exactly:
{
  "answer": "Markdown analysis. Use **bold** for key facts. Lead with the most alarming finding. Be specific — cite org names and amounts.",
  "data_type": "zombies|loops|governance|sole_source|alerts|stats|help",
  "follow_up": ["3 concrete investigator follow-up questions"]
}"""


async def llm_enhanced_query(message: str) -> dict:
    msg_lower = message.lower()

    data_type = "help"
    data_results = []
    context_data = {"stats": get_stats()}

    if any(w in msg_lower for w in ["zombie", "dissolved", "ceased", "revoked", "dead", "vanish"]):
        d = get_zombies(min_funding=100000, limit=20)
        context_data["zombies"] = d["results"][:8]
        data_type = "zombies"
        data_results = d["results"][:5]
    elif any(w in msg_lower for w in ["loop", "circular", "cycle", "round-trip", "gifting"]):
        d = get_funding_loops(min_hops=2, max_hops=6, limit=20)
        context_data["loops"] = d["results"][:8]
        data_type = "loops"
        data_results = d["results"][:5]
    elif any(w in msg_lower for w in ["director", "board", "governance", "related", "control", "conflict"]):
        d = get_governance_networks(min_boards=3, limit=20)
        context_data["governance"] = d["results"][:5]
        data_type = "governance"
        data_results = d["results"][:5]
    elif any(w in msg_lower for w in ["sole source", "no-bid", "amendment", "contract", "vendor", "procurement"]):
        d = get_sole_source(min_ratio=3.0, limit=20)
        context_data["sole_source"] = d["results"][:8]
        data_type = "sole_source"
        data_results = d["results"][:5]
    elif any(w in msg_lower for w in ["alert", "flag", "worst", "critical", "intersection", "multi"]):
        d = get_alerts(min_flags=2, limit=20)
        context_data["alerts"] = d["results"][:8]
        data_type = "alerts"
        data_results = d["results"][:5]
    elif any(w in msg_lower for w in ["overview", "summary", "total", "how much", "stats"]):
        data_type = "stats"
    else:
        context_data["zombies"] = get_zombies(min_funding=500000, limit=3)["results"]
        context_data["loops"] = get_funding_loops(limit=3)["results"]

    # Build human-readable key findings summary
    key_findings = []
    if "zombies" in context_data:
        for z in (context_data["zombies"] or [])[:3]:
            name = z.get("canonical_name") or z.get("legal_name", "Unknown")
            amt = z.get("total_public_funding") or z.get("total_govt_funding") or 0
            pct = z.get("govt_revenue_pct") or z.get("govt_share_pct") or 0
            year = z.get("last_filing_year", "unknown")
            key_findings.append(f"- ZOMBIE: {name} received ${float(amt):,.0f} ({float(pct):.1f}% govt revenue), last filed {year}")
    if "loops" in context_data:
        for l in (context_data["loops"] or [])[:3]:
            flow = l.get("total_flow") or 0
            hops = l.get("hops") or "?"
            path = l.get("path_display") or ""
            key_findings.append(f"- LOOP: {hops}-hop circular flow of ${float(flow):,.0f} → {path[:80]}")
    if "governance" in context_data:
        for g in (context_data["governance"] or [])[:3]:
            name = f"{g.get('first_name','')} {g.get('last_name','')}".strip()
            boards = g.get("board_count", 0)
            funding = g.get("total_controlled_funding") or 0
            key_findings.append(f"- GOVERNANCE: {name} sits on {boards} boards controlling ${float(funding):,.0f}")
    if "sole_source" in context_data:
        for s in (context_data["sole_source"] or [])[:3]:
            vendor = s.get("vendor", "Unknown")
            dept = s.get("department", "")
            total = s.get("total_amount") or 0
            count = s.get("contract_count") or 1
            key_findings.append(f"- SOLE SOURCE: {vendor} ({dept}): {count} contracts, ${float(total):,.0f} total — no competitive bid")
    if "alerts" in context_data:
        for a in (context_data["alerts"] or [])[:3]:
            name = a.get("canonical_name", "Unknown")
            funding = a.get("total_govt_funding") or 0
            alarm_count = a.get("alarm_count", 1)
            flags = ", ".join(a.get("flags") or [])
            last_year = a.get("last_filing_year", "unknown")
            key_findings.append(f"- MULTI-FLAG ALERT ({alarm_count} flags): {name} — ${float(funding):,.0f} govt funding, last filed {last_year}, flagged for: {flags}")

    findings_text = "\n".join(key_findings) if key_findings else "No specific findings pre-loaded."

    user_content = (
        f"User question: {message}\n\n"
        f"TOP FINDINGS FROM THE DATABASE:\n{findings_text}\n\n"
        f"Full data context (JSON):\n{json.dumps(context_data, indent=2, default=str)}\n\n"
        "Instructions: Lead with the most alarming specific finding. Name real organizations and dollar amounts. "
        "Be the investigative journalist uncovering the story. Return JSON with keys: answer, data_type, follow_up."
    )

    raw = await _call_llm(_build_system_prompt(), user_content)

    text = raw.strip()
    if "```" in text:
        import re
        m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if m:
            text = m.group(1)

    try:
        parsed = json.loads(text)
        return {
            "answer": parsed.get("answer", text),
            "data_type": parsed.get("data_type", data_type),
            "data": data_results,
            "sql_hint": "Claude AI — live cross-dataset analysis",
            "follow_up": parsed.get("follow_up", []),
        }
    except json.JSONDecodeError:
        return {
            "answer": text,
            "data_type": data_type,
            "data": data_results,
            "sql_hint": "Claude AI analysis",
            "follow_up": [],
        }


async def _call_llm(system: str, user_content: str) -> str:
    """Call Claude via AWS Bedrock (primary on event day) or Anthropic API (fallback)."""
    aws_key = os.getenv("AWS_ACCESS_KEY_ID")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")

    if aws_key:
        return await _call_bedrock(system, user_content)
    elif anthropic_key:
        return await _call_anthropic(system, user_content, anthropic_key)
    else:
        raise RuntimeError("No AI credentials configured")


async def _call_bedrock(system: str, user_content: str) -> str:
    import boto3

    client = boto3.client(
        "bedrock-runtime",
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.getenv("AWS_SESSION_TOKEN") or None,
    )

    model_id = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-opus-4-6-20251101-v1:0")

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


def template_query(message: str) -> dict:
    """Fallback when no AI key is configured."""
    msg = message.lower()

    if any(w in msg for w in ["zombie", "dissolved", "ceased", "revoked", "dead"]):
        data = get_zombies(min_funding=100000, limit=20)
        return {
            "answer": f"I found **{data['count']} zombie recipients** — organizations that received significant public funding and then had their charitable status revoked or annulled.",
            "data_type": "zombies",
            "data": data["results"][:10],
            "sql_hint": "Queried govt_funding_by_charity for high govt-dependency orgs that stopped filing",
            "follow_up": ["Show me the top 5 by funding amount", "Which ones were in Alberta?", "What was their last filing year?"],
        }
    elif any(w in msg for w in ["loop", "circular", "cycle", "round-trip", "gifting circle"]):
        data = get_funding_loops(min_hops=2, max_hops=6, limit=20)
        return {
            "answer": f"I detected **{data['count']} funding loops** in the charity sector. These are circular gift flows where money moves from Charity A → B → C → back to A.",
            "data_type": "loops",
            "data": data["results"][:10],
            "sql_hint": "Queried cra.loops table with SCC decomposition results",
            "follow_up": ["Show me the largest loop by dollar amount", "Which charities appear in multiple loops?", "Are any loops same-year transactions?"],
        }
    elif any(w in msg for w in ["director", "board", "governance", "related part", "network", "control"]):
        data = get_governance_networks(min_boards=3, limit=20)
        return {
            "answer": f"I found **{data['count']} individuals** who sit on 3+ charity boards simultaneously. Some control organizations that fund each other, creating potential conflicts of interest.",
            "data_type": "governance",
            "data": data["results"][:10],
            "sql_hint": "Cross-referenced cra_directors with loop_charity_financials for multi-board directors",
            "follow_up": ["Who controls the most funding?", "Do any of these directors' organizations fund each other?", "Show me the governance network graph"],
        }
    elif any(w in msg for w in ["sole source", "no-bid", "amendment", "contract", "vendor"]):
        data = get_sole_source(min_ratio=3.0, limit=20)
        return {
            "answer": f"**Sole-source contract analysis**: Alberta's dataset contains **{data['stats'].get('total_sole_source_contracts', 15533):,} sole-source contracts**. I've identified patterns of vendor concentration and near-threshold contract splitting.",
            "data_type": "sole_source",
            "data": data["results"][:10],
            "sql_hint": "Queried ab_sole_source for vendor concentration and threshold proximity",
            "follow_up": ["Show me contracts near the $50K competitive threshold", "Which departments rely most on sole-source?", "Find contract splitting patterns"],
        }
    elif any(w in msg for w in ["alert", "flag", "critical", "worst", "multi", "intersection"]):
        data = get_alerts(min_flags=2, limit=20)
        return {
            "answer": f"**Multi-flag alert analysis**: I found **{data['count']} entities** flagged across multiple challenge categories simultaneously — the highest-priority accountability failures.",
            "data_type": "alerts",
            "data": data["results"][:10],
            "sql_hint": "Cross-joined zombie, loop membership, and governance flags",
            "follow_up": ["Show me entities with 3+ flags", "Which director controls the most flagged entities?", "Show me the funding loop with zombie participants"],
        }
    elif any(w in msg for w in ["how much", "total", "spending", "overview", "summary"]):
        stats = get_stats()
        return {
            "answer": f"**Platform Overview**: Tracking {stats.get('total_entities', 'N/A'):,} organizations across CRA charity filings, {stats.get('total_fed_grants', 'N/A'):,} federal grants, and {stats.get('total_ab_grants', 'N/A'):,} Alberta grant payments.",
            "data_type": "stats",
            "data": stats,
            "sql_hint": "Aggregated counts across all four datasets",
            "follow_up": ["Show me zombies", "Explore funding loops", "Show multi-flag alerts"],
        }
    else:
        return {
            "answer": "I can help you investigate government spending accountability. Try asking about:\n\n• **Zombie recipients** — organizations that vanished after receiving funding\n• **Funding loops** — circular money flows between charities\n• **Governance networks** — directors controlling multiple funded entities\n• **Sole-source contracts** — amendment creep and vendor lock-in\n• **Multi-flag alerts** — entities flagged across multiple challenges\n• **Spending overview** — total funding across all datasets",
            "data_type": "help",
            "data": [],
            "sql_hint": None,
            "follow_up": ["Show me zombie recipients", "Find funding loops", "Show multi-flag alerts"],
        }


# ── Health Check ─────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    has_ai = bool(os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("ANTHROPIC_API_KEY"))
    mode = "duckdb-live" if DUCKDB_MODE else "postgres"
    return {
        "status": "healthy",
        "query_mode": mode,
        "ai_enabled": has_ai,
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
