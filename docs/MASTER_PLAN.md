# Follow The Money — Deep Dive Master Plan
**Hackathon: Agency 2026 Ottawa | Code Freeze: April 29, 2026 @ 2PM**

---

## The Narrative (Single Sentence)

> "A small number of people systematically redirected hundreds of millions in public money through interconnected charity networks — some of it never reached a program."

Every page, every chart, every filter serves this story. Judges remember one verdict, not ten features.

---

## Judging Criteria (Priority Order)

1. **Impact of finding** — real organizations, real dollar amounts, real harm
2. **Technical depth** — not just a dashboard, but a genuine investigative tool
3. **AI integration** — Claude generates narrative, not just displays data
4. **Presentation** — story-first, numbers that shock, progressive disclosure

---

## The Three Challenges to Go Deep On

### Why These Three

- All three use the CRA T3010 dataset (most data-rich, most interconnected)
- They reinforce each other: the same organizations appear across all three
- Together they prove the single narrative above
- The data already exists — no new collection needed

---

## Challenge #3 — Funding Loops (Anchor Challenge)

### The Story
$4.4B flows in circular patterns between 5,808 charity networks. Most loops are structural (denominational hierarchies, federated charities). But 402 are **same-year** — money left an org and returned within the same fiscal year. These generate **phantom tax receipts**: a $500K loop with 3 hops produces $1.5M in charitable donation receipts for the same dollars.

### Key Finding to Surface
**Estimated phantom tax receipts** = SUM of (total_flow × hops) for all same_year=true loops.
This is the headline number. It should be prominent on the page.

### Suspicion Score Algorithm
Score each loop 0–8. Display as: Normal (0–2) / Suspicious (3–5) / High Alert (6+)

| Signal | Points |
|--------|--------|
| same_year = true | +3 |
| AVG(circular_outflow / revenue) of participants > 0.30 | +2 |
| AVG(program_spending / total_expenditures) of participants < 0.40 | +2 |
| All participant orgs are small (revenue < $500K each) | +1 |
| Any participant is a known hub (identified_hubs table) | -3 |

### Data Available
| Table | Key Fields |
|-------|-----------|
| `cra__loops` | id, hops, path_bns[], path_display, bottleneck_amt, total_flow, min_year, max_year |
| `cra__loop_financials` | loop_id, same_year, total_flow_window |
| `cra__loop_charity_financials` | bn, legal_name, circular_outflow, circular_inflow, revenue, loops_count, program_spending, admin_spending, compensation_spending, total_expenditures |
| `cra__loop_participants` | bn, loop_id, position_in_loop, sends_to, receives_from |
| `cra__loop_edges` | src, dst, total_amt, edge_count, min_year, max_year, years[] |
| `cra__loop_edge_year_flows` | loop_id, hop_idx, src, dst, year_flow, gift_count |
| `cra__identified_hubs` | bn, legal_name, scc_id, in_degree, out_degree, total_inflow, total_outflow, hub_type |
| `cra__scc_summary` | scc_id, node_count, total_internal_flow, top_charity_names[] |

### What to Build
- **Stats bar**: add "Suspicious Loops: N" and "Phantom Receipts: $XM"
- **Classification filter**: All / High Alert / Suspicious / Normal
- **Loops Table**: add suspicion badge column, phantom receipts column (same_year only), avg program spend %
- **Expanded row**: hop-by-hop flowchart → per-participant financials → year-over-year timeline chart
- **Network Graph**: nodes sized by revenue, colored by suspicion score, edge labels show $ amount
- **New "Suspicious Loops" sub-tab**: pre-filtered score ≥ 3, sorted by phantom receipts desc

---

## Challenge #6 — Governance Networks (Most Politically Explosive)

### The Story
2,841 individuals sit on 3+ charity boards simultaneously. But the real story is **self-dealing**: directors whose organizations fund each other. When Director X controls Org A and Org B, and Org A sends money to Org B (which sends it back), that is not a coincidence — it is a control structure.

### Key Finding to Surface
**Director-Loop Intersections**: directors whose multiple organizations appear together in the same funding loop. This is the smoking gun.

### Data Available
| Table | Key Fields |
|-------|-----------|
| `cra__cra_directors` | bn, first_name, last_name, position, fpe (fiscal year end), end_date |
| `cra__loop_participants` | bn, loop_id |
| `cra__loop_charity_financials` | bn, circular_outflow, revenue |
| `cra__loop_edges` | src, dst, total_amt |

### What to Build
- **Stats bar**: add "Directors with self-dealing loops: N" and "Controlled flows: $XM"
- **Self-dealing filter**: show only directors whose orgs appear in same loop together
- **Director cards**: add "Loop Intersection" badge, "Controlled Flow: $X" stat
- **Expanded card**: show which of their orgs funded which others (with dollar amounts)
- **Bipartite network graph**: director nodes (large) → org nodes → funding flow edges
  - Red edges = money flowing between orgs of same director
  - Click director → highlight their full network

---

## Challenge #1 — Zombie Recipients (Clearest Public Story)

### The Story
347 organizations received public funding, then had their charitable status revoked or annulled. Were they ever real? The data shows: many participated in circular funding loops right up until their disappearance. The public funded their overhead and got nothing.

### Key Finding to Surface
**Pre-death loop participation**: how many zombies were in funding loops before they died?
**Total lost**: sum of government funding paid to zombie orgs AFTER their last filed return.

### Data Available
| Table | Key Fields |
|-------|-----------|
| `cra__govt_funding_by_charity` | bn, fiscal_year, total_govt, revenue, govt_share_of_rev |
| `cra__cra_identification` | bn, fiscal_year, legal_name, registration_status (not in this table — need to check) |
| `cra__loop_participants` | bn, loop_id |
| `cra__loop_charity_financials` | bn, program_spending, total_expenditures, circular_outflow |

### What to Build
- **New "Timeline" view toggle**: dot-plot showing peak funding year → last filing → revocation for each zombie
- **Cross-reference badges on every row**: "🔄 In 3 loops", "🕸️ Shared director", "📋 0% programs in final year"
- **Stat**: "Loop-participating zombies: N (X% of all zombies)"
- **Stat**: "Funding after last filing: $XM"

---

## Case File Feature (New — Highest Demo Impact)

### Route: `/entity/:bn`

A complete accountability dossier for any organization. Judges can click into a specific org during the demo and see everything in one view. Pre-load 5 "Featured Cases" on the Dashboard.

### Layout
```
┌─────────────────────────────────────────────────────────┐
│ ORG NAME                          [STATUS BADGE] [SCORE] │
│ BN: XXXXXXXXX  |  Category  |  Province  |  Since YEAR  │
├──────────────┬──────────────────────────────────────────┤
│ RED FLAGS    │  FUNDING HISTORY (bar chart, by year)    │
│ 🔴 3 loops   │  Federal / Provincial / Municipal        │
│ 🔴 Same-year │                                          │
│ 🟡 Director  │                                          │
│    overlap   │                                          │
├──────────────┼──────────────────────────────────────────┤
│ LOOP         │  CONNECTED ORGANIZATIONS                 │
│ PARTICIPATION│  (mini force graph — orgs in same loops) │
│ (table)      │                                          │
├──────────────┴──────────────────────────────────────────┤
│ AI NARRATIVE                                            │
│ Claude generates 2–3 paragraph investigative summary   │
│ using all available data about this entity             │
└─────────────────────────────────────────────────────────┘
```

### Featured Cases (pre-picked for demo)
Select 5 organizations that have: zombie status OR high suspicion score loops + shared directors. These are linked from the Dashboard as "Start Here" cards.

---

## Dashboard Rewrite

Replace generic stats with an **executive briefing**:

1. **Headline**: "We analyzed $89.4B in public funding. Here is what we found."
2. **Top 5 Findings** (real org names, real numbers, clickable → case file)
3. **Sankey diagram**: public money → challenge categories → flagged amounts
4. **Quick Investigation buttons**: one per challenge with live count badges

---

## UI/UX Standards (Must Follow Everywhere)

### Naming & Labels
- Never show a raw BN without org name: always "Org Name (BN: 123...RR0001)"
- Dollar formatting: `$1.2M` for ≥$1M, `$450K` for ≥$1K, `$250` below that
- Risk labels: **High Alert** / **Suspicious** / **Normal** (not high/medium/low)
- Column headers must have tooltip explaining what the metric means and why it matters

### Color System (Use Consistently Across All Pages)
| State | Color Variable |
|-------|---------------|
| High Alert / Critical | `var(--status-critical)` (#ef4444 red) |
| Suspicious / Warning | `var(--status-medium)` (#f59e0b amber) |
| Normal / Safe | `var(--status-low)` (#22c55e green) |
| Informational | `var(--accent-purple)` |
| Neutral / Muted | `var(--text-muted)` |

### Empty States
Every table must have a contextual empty state:
- Not just "No results" but "No loops match — try setting Max Flow to 'No limit' or removing the risk filter"

### Filters
- Show count next to each filter option: "High Alert (6)", "Suspicious (847)"
- Filters update counts in real time (debounced 400ms)
- "Clear all filters" button always visible when any filter is active

### Loading States
- Skeleton shimmer on first load
- Spinner on filter change (not full skeleton — content already visible)
- Never block the entire page during a secondary data fetch

---

## Implementation Order

| Date | Branch | Owner | Deliverable |
|------|--------|-------|-------------|
| Apr 25 | `backend/deep-dive` | Claude | New DB queries + API endpoints (loops classification, director-loop intersection, case file, phantom receipts) |
| Apr 26 | `frontend/deep-dive` | MiniMax | Funding Loops page deep-dive UI |
| Apr 26 | `backend/deep-dive` | Claude | Governance + Zombies backend queries |
| Apr 27 | `frontend/deep-dive` | MiniMax | Governance bipartite graph + Zombies timeline |
| Apr 27 | `frontend/deep-dive` | MiniMax | Case File page `/entity/:bn` |
| Apr 28 | `frontend/deep-dive` | MiniMax | Dashboard rewrite + Featured Cases |
| Apr 28 | Both | Merge + test | Integration test all new features |
| Apr 29 AM | `master` | Both | Bug fixes, polish, demo script |

---

## API Contract (Source of Truth for Both Teams)

See `docs/BACKEND_GUIDE.md` for full endpoint specs.
See `docs/FRONTEND_GUIDE.md` for component specs.

Both docs reference this file. When in conflict, this file wins.
