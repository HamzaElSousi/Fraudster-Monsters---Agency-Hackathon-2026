"""
0-100 risk score with 4 transparent components.
calculate_score() takes the dict returned by get_entity_case_file_live()
or a pre-built dict from get_flagged_orgs_live() and returns score + breakdown.
"""


def calculate_score(entity: dict) -> dict:
    breakdown = {}

    # ── Zombie component (max 40) ──────────────────────────────────────────
    z = 0
    cra = entity.get("cra_profile") or {}
    govt_share = float(entity.get("govt_share") or cra.get("govt_share") or 0)
    last_year = int(entity.get("last_year") or cra.get("last_year") or 9999)
    total_govt = float(entity.get("total_govt") or cra.get("total_govt") or 0)

    if govt_share >= 0.9:
        z += 20
    elif govt_share >= 0.7:
        z += 15

    if last_year <= 2022:
        z += 20

    if total_govt >= 1_000_000:
        z += 10
    elif total_govt >= 500_000:
        z += 5

    breakdown["zombie"] = min(z, 40)

    # ── Loop component (max 25) ────────────────────────────────────────────
    l = 0
    loop_count = int(entity.get("loop_count") or 0)
    loop_total = float(entity.get("loop_total") or 0)
    max_loop_hops = int(entity.get("max_loop_hops") or 0)

    if loop_count > 0:
        l += 10
        if loop_total >= 500_000:
            l += 10  # replaces base +10 with +20 total
        elif loop_total >= 100_000:
            l += 0   # already added 10 above
        if max_loop_hops > 3:
            l += 5

    breakdown["loop"] = min(l, 25)

    # ── Duplicate component (max 20) ───────────────────────────────────────
    d = 0
    fed_total = float(entity.get("fed_total") or 0)
    ab_total = float(entity.get("ab_total") or 0)
    has_both = fed_total > 0 and ab_total > 0

    if has_both:
        d += 10
        combined = fed_total + ab_total
        if combined >= 250_000:
            d += 5
        if combined >= 1_000_000:
            d += 5

    breakdown["duplicate"] = min(d, 20)

    # ── Governance component (max 15) ──────────────────────────────────────
    g = 0
    max_boards = int(entity.get("max_director_boards") or entity.get("board_count") or 0)

    if max_boards >= 5:
        g += 15
    elif max_boards >= 3:
        g += 8

    breakdown["governance"] = min(g, 15)

    # ── Total ──────────────────────────────────────────────────────────────
    total = sum(breakdown.values())
    total = min(total, 100)

    if total >= 80:
        tier = "critical"
    elif total >= 60:
        tier = "high"
    elif total >= 40:
        tier = "medium"
    else:
        tier = "low"

    return {"score": total, "tier": tier, "breakdown": breakdown}


def get_triggered_flags(entity: dict, breakdown: dict) -> list[str]:
    """Returns list of triggered flag names for an entity."""
    flags = []
    if breakdown.get("zombie", 0) > 0:
        flags.append("zombie")
    if breakdown.get("loop", 0) > 0:
        flags.append("loop")
    if breakdown.get("duplicate", 0) > 0:
        flags.append("duplicate")
    if breakdown.get("governance", 0) > 0:
        flags.append("governance")
    return flags
