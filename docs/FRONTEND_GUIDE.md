# Frontend Deep-Dive Guide
**Read MASTER_PLAN.md first — this doc is the implementation spec for the frontend branch.**
**Also read BACKEND_GUIDE.md to understand the API contracts you are consuming.**

---

## Branch Setup

```bash
# From the project root
git checkout master
git pull
git checkout -b frontend/deep-dive
```

Do NOT touch `backend/` on this branch.

When the backend team merges first (they should), pick up their endpoints:
```bash
git checkout frontend/deep-dive
git rebase master
```

When your work is complete:
```bash
git checkout master
git merge frontend/deep-dive --no-ff -m "merge: frontend deep-dive features"
```

---

## Tech Stack Reminders

- **Vite** — use `import.meta.env.VITE_API_URL` not `process.env.REACT_APP_*`
- **ECharts** — already installed (`echarts` + `echarts-for-react`). Use for all new charts.
- **react-force-graph-2d** — use for mini force graphs only (already in FundingLoops.jsx).
- **CSS variables** — never hardcode colors. Use `var(--status-critical)`, `var(--status-medium)`, `var(--status-low)`, `var(--accent-purple)`, `var(--text-muted)`. See `index.css` for full list.
- **API_BASE** — always `const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';`

---

## Files to Modify / Create

| File | Type | Change |
|------|------|--------|
| `frontend/src/api.js` | Modify | Add 7 new fetch functions + 2 utility helpers |
| `frontend/src/pages/FundingLoops.jsx` | Modify | Classification filter, phantom receipts, expanded row |
| `frontend/src/pages/Governance.jsx` | Modify | Self-dealing stats + filter + expanded card |
| `frontend/src/pages/Zombies.jsx` | Modify | Loop crossref view + timeline view |
| `frontend/src/pages/EntityCaseFile.jsx` | **NEW** | Full org dossier page |
| `frontend/src/pages/Dashboard.jsx` | Modify | Headline + featured cases + quick buttons |
| `frontend/src/App.jsx` | Modify | Add `/entity/:bn` route |

---

## Step 1 — api.js Additions

Add all of the following to `frontend/src/api.js`. Do not remove anything that already exists.

```js
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Dollar formatter ──────────────────────────────────────────────────
export function fmtDollars(n) {
  if (n == null || n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

// ── Risk classification badge ─────────────────────────────────────────
// Returns { label, color } for use in inline styles
export function classificationBadge(cls) {
  const map = {
    high_alert: { label: 'High Alert', color: 'var(--status-critical)' },
    suspicious: { label: 'Suspicious', color: 'var(--status-medium)' },
    normal:     { label: 'Normal',     color: 'var(--status-low)' },
  };
  return map[cls] ?? map.normal;
}

// ── New fetch functions ───────────────────────────────────────────────

// Enriched loops: adds suspicion_score, classification, phantom_receipts
// classification: '' | 'high_alert' | 'suspicious' | 'normal'
export const fetchLoopsEnriched = (
  minHops = 2, maxHops = 6,
  minFlow = 0, maxFlow = 0,
  sameYearOnly = false,
  riskLevel = '',
  classification = '',
  limit = 200,
) =>
  fetch(
    `${API_BASE}/api/loops?min_hops=${minHops}&max_hops=${maxHops}` +
    `&min_flow=${minFlow}&max_flow=${maxFlow}` +
    `&same_year_only=${sameYearOnly}&risk_level=${riskLevel}` +
    `&classification=${classification}&limit=${limit}`
  ).then(r => r.json());

// Extended stats: adds phantom_receipts_total, high_alert_count, suspicious_count
export const fetchLoopsStatsEnriched = () =>
  fetch(`${API_BASE}/api/loops/stats`).then(r => r.json());

// Full loop detail for expanded row: participants + timeline
// Returns { loop, participants: [...], timeline: [...] }
export const fetchLoopDetail = (loopId) =>
  fetch(`${API_BASE}/api/loops/detail/${loopId}`).then(r => r.json());

// Directors whose multiple orgs appear in the same loop together
// Returns { results: [...], count }
export const fetchSelfDealingDirectors = (minBoards = 2, limit = 50) =>
  fetch(`${API_BASE}/api/governance/self-dealing?min_boards=${minBoards}&limit=${limit}`)
    .then(r => r.json());

// Zombies enriched with loop_count and was_in_loop boolean
// Returns { results: [...], count }
export const fetchZombieLoopCrossref = (minFunding = 100000, limit = 50) =>
  fetch(`${API_BASE}/api/zombies/loop-crossref?min_funding=${minFunding}&limit=${limit}`)
    .then(r => r.json());

// Full entity accountability dossier for /entity/:bn page
// Returns { bn, name, flags, funding_history, loops, loop_count, program_pct, ... }
export const fetchEntityCaseFile = (bn) =>
  fetch(`${API_BASE}/api/entity/${encodeURIComponent(bn)}`).then(r => r.json());

// 5 pre-ranked orgs for Dashboard "Start Here" cards
// Returns array of { bn, name, flags, circular_outflow, loops_count, same_year_loops }
export const fetchDashboardFeatured = () =>
  fetch(`${API_BASE}/api/dashboard/featured`).then(r => r.json());
```

---

## Step 2 — FundingLoops.jsx Enhancements

The file is already large (~645 lines). Make targeted additions — do not rewrite the whole file.

### 2a. Stats Bar — Add 2 New Cards

The stats bar currently shows: Total Loops, Total Flow, Same-Year Loops, High-Risk Loops.

**Switch to `fetchLoopsStatsEnriched()`** (it returns all the same fields plus new ones).

Add after "High-Risk Loops":
- **"Suspicious Loops"** → `(stats.high_alert_count ?? 0) + (stats.suspicious_count ?? 0)` — color: `var(--status-medium)`
- **"Phantom Receipts"** → `fmtDollars(stats.phantom_receipts_total)` — color: `var(--status-critical)`
  - Add `title="Estimated charitable tax receipts generated by same-year circular loops (total_flow × hops)"` to the card header

### 2b. Classification Filter Row

Add a row of segmented buttons **above the existing filter panel**, between the stats bar and the existing filter panel. This is the primary new filter.

```jsx
// Classification filter — add as new state:
const [classification, setClassification] = useState('');

// Button row (render above FilterPanel):
<div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
  {[
    { key: '', label: 'All Loops' },
    { key: 'high_alert', label: '🔴 High Alert', count: stats?.high_alert_count },
    { key: 'suspicious', label: '🟡 Suspicious', count: stats?.suspicious_count },
    { key: 'normal',     label: '✅ Normal',     count: stats?.normal_count },
  ].map(opt => (
    <button
      key={opt.key}
      onClick={() => setClassification(opt.key)}
      style={{
        padding: '6px 14px',
        fontSize: 13,
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${classification === opt.key ? 'var(--accent-purple)' : 'var(--border-primary)'}`,
        background: classification === opt.key ? 'var(--accent-purple)' : 'var(--bg-tertiary)',
        color: classification === opt.key ? '#fff' : 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {opt.label}{opt.count != null ? ` (${opt.count.toLocaleString()})` : ''}
    </button>
  ))}
</div>
```

Pass `classification` to `fetchLoopsEnriched` in the debounced filter effect.

### 2c. Loops Table — 2 New Columns

Add to the table header and rows:

| Column | Header tooltip | Value |
|--------|---------------|-------|
| `Suspicion` | "Risk classification based on same-year timing, circular outflow ratio, and program delivery rate" | Badge using `classificationBadge(row.classification)` |
| `Phantom Receipts` | "Estimated tax receipts this loop generates (total_flow × hops). Non-zero only for same-year loops." | `fmtDollars(row.phantom_receipts)` or `—` if 0 |

Badge component (inline, reuse pattern from existing risk badges):
```jsx
<span style={{
  background: `${classificationBadge(row.classification).color}22`,
  color: classificationBadge(row.classification).color,
  border: `1px solid ${classificationBadge(row.classification).color}`,
  borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
}}>
  {classificationBadge(row.classification).label}
</span>
```

### 2d. Expanded Row (Inline Detail)

When a row is clicked, expand it to show three sections. Use a `expandedLoopId` state + `expandedDetail` state (fetched via `fetchLoopDetail`).

```jsx
const [expandedLoopId, setExpandedLoopId] = useState(null);
const [expandedDetail, setExpandedDetail] = useState(null);
const [detailLoading, setDetailLoading] = useState(false);

const handleRowClick = (row) => {
  if (expandedLoopId === row.id) {
    setExpandedLoopId(null);
    setExpandedDetail(null);
    return;
  }
  setExpandedLoopId(row.id);
  setDetailLoading(true);
  fetchLoopDetail(row.id)
    .then(setExpandedDetail)
    .catch(() => setExpandedDetail(null))
    .finally(() => setDetailLoading(false));
};
```

**Expanded row layout** (render as a full-width `<tr>` after the clicked row):
```
┌─ Participants ──────────────────────────────────────────┐
│  #1 → Org A (BN: 123)  circ. outflow: 34%  prog: 28%  │
│  #2 → Org B (BN: 456)  circ. outflow: 41%  prog: 31%  │
│  #3 → Org C (BN: 789)  circ. outflow: 28%  prog: 45%  │
└─────────────────────────────────────────────────────────┘
```

For each participant, show:
- Position arrow: `#1 →`
- Org name + BN in parens
- `Circular outflow: X%` — color red if > 30%, amber if > 15%
- `To programs: X%` — color red if < 30%, amber if < 50%

### 2e. "Suspicious Loops" Sub-Tab

Add a new tab alongside existing tabs (All / Graph / Charities → add **Suspicious**):

```jsx
// Add to tab list:
{ key: 'suspicious_tab', label: '🔴 Suspicious Loops' }
```

When this tab is active:
- Force `classification = 'high_alert,suspicious'` (or just pre-filter the already-loaded data by `row.suspicion_score >= 3`)
- Sort by `phantom_receipts` descending
- Empty state: "No suspicious loops detected with current filters. Try removing the flow range filter."

---

## Step 3 — Governance.jsx Enhancements

### 3a. Stats Bar — 2 New Cards

On mount, call `fetchSelfDealingDirectors(2, 200)` to get self-dealing data. Store result in `selfDealingData`.

Add to stats bar:
- **"Self-Dealing Directors"** → `selfDealingData?.count ?? '…'` — color: `var(--status-critical)`
  - Tooltip: "Directors whose multiple organizations appear together in the same funding loop"
- **"Controlled Flows"** → `fmtDollars(selfDealingData?.results?.reduce((s, r) => s + (r.controlled_flow ?? 0), 0))` — color: `var(--status-critical)`

### 3b. Self-Dealing Filter Toggle

Add above the existing filter controls:

```jsx
const [selfDealingOnly, setSelfDealingOnly] = useState(false);

<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
  <input
    type="checkbox"
    checked={selfDealingOnly}
    onChange={e => setSelfDealingOnly(e.target.checked)}
    style={{ width: 16, height: 16, cursor: 'pointer' }}
  />
  <span>Show only directors with self-dealing loops</span>
  {selfDealingOnly && (
    <span style={{ color: 'var(--status-critical)', fontWeight: 600 }}>
      ({selfDealingData?.count ?? 0} directors)
    </span>
  )}
</label>
```

When `selfDealingOnly` is true, replace the directors list with `selfDealingData.results`.

### 3c. Director Card Enhancements

For each director, check if they appear in `selfDealingData.results` (match by `first_name` + `last_name`). If yes:

- Add red badge: `"🔴 Loop Intersection"` to the card header
- Add stat line: `Controlled Flow: {fmtDollars(match.self_dealing_loops_flow)}`

### 3d. Expanded Card — Self-Dealing Loop Detail

When a self-dealing director's card is expanded, fetch their detail from `selfDealingData.results` (it's already loaded) and show:

```
Self-Dealing Loops:
  Org A (BN: 123) → Org B (BN: 456) — $250K — Loop #42 (same-year ⚠️)
  Org B (BN: 456) → Org C (BN: 789) — $180K — Loop #43
```

Render from `match.intersecting_loops` array. Each entry: source org → dest org, amount, loop ID, same-year flag.

---

## Step 4 — Zombies.jsx Enhancements

### 4a. View Mode Toggle

Add a button row at the top of the page, after the stats bar:

```jsx
const [viewMode, setViewMode] = useState('table'); // 'table' | 'timeline' | 'crossref'

<div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
  {[
    { key: 'table',    label: '📋 Table' },
    { key: 'timeline', label: '📅 Timeline' },
    { key: 'crossref', label: '🔄 Loop Cross-Reference' },
  ].map(m => (
    <button key={m.key} onClick={() => setViewMode(m.key)}
      style={{
        padding: '6px 16px', fontSize: 13,
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${viewMode === m.key ? 'var(--accent-purple)' : 'var(--border-primary)'}`,
        background: viewMode === m.key ? 'var(--accent-purple)' : 'var(--bg-tertiary)',
        color: viewMode === m.key ? '#fff' : 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >{m.label}</button>
  ))}
</div>
```

### 4b. Loop Crossref View

When `viewMode === 'crossref'`:
- Fetch from `fetchZombieLoopCrossref()` on first activation (lazy-load, store in `crossrefData`)
- Show same table as default view, with 2 new columns prepended:
  - **"In Loops"** — if `row.loop_count > 0`: red badge `🔄 {row.loop_count} loops`; else: muted `—`
  - **"Was in Loop"** — `row.was_in_loop ? '✅' : '—'`
- Stats line above table: `"Loop-participating zombies: N ({pct}% of all zombies)"`
  - `N = crossrefData.results.filter(r => r.was_in_loop).length`
  - `pct = (N / crossrefData.count * 100).toFixed(0)`

### 4c. Timeline View

When `viewMode === 'timeline'`:
- Use existing `zombiesData` (already loaded on mount)
- Render a scrollable list of timeline rows, one per org:

```
Org Name (BN: 123...)
  ● Peak funding: 2019 ($1.2M federal)  ──── ◆ Last filing: 2021  ──── ✕ Status: Revoked
```

Show using a horizontal flex bar. Use these colors:
- Peak funding dot: `var(--status-low)` (green)
- Last filing diamond: `var(--status-medium)` (amber)
- Status X: `var(--status-critical)` (red)

Data available per row: `total_govt_funding`, `years_funded`, `last_year_funded`, `registration_status`. Infer "peak funding year" as the most recent year in `years_funded` array (or just `last_year_funded` if no year array available).

Empty state for timeline: "No timeline data available — zombie records do not include year-by-year breakdown in this dataset."

---

## Step 5 — New Page: EntityCaseFile.jsx

**Create** `frontend/src/pages/EntityCaseFile.jsx` as a new file.

**Add route to App.jsx:**
```jsx
import EntityCaseFile from './pages/EntityCaseFile';
// inside <Routes>:
<Route path="/entity/:bn" element={<EntityCaseFile />} />
```

Also add to `PAGE_TITLES`:
```js
'/entity/:bn': 'Entity Case File',
```
(React Router won't match dynamic routes in this object — it's fine to leave it or use a fallback.)

### Layout Structure

```jsx
import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { fetchEntityCaseFile, fmtDollars } from '../api';
import ReactECharts from 'echarts-for-react';

export default function EntityCaseFile() {
  const { bn } = useParams();
  const [entity, setEntity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchEntityCaseFile(bn)
      .then(setEntity)
      .catch(() => setError('Could not load entity — check the BN format.'))
      .finally(() => setLoading(false));
  }, [bn]);

  if (loading) return <div className="loading-shimmer" style={{ height: 400, borderRadius: 8 }} />;
  if (error || !entity) return <div style={{ color: 'var(--status-critical)', padding: 24 }}>⚠️ {error || 'Entity not found'}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <EntityHeader entity={entity} />
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        <RedFlagsPanel entity={entity} />
        <FundingHistoryChart entity={entity} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <LoopParticipationTable entity={entity} />
        <ConnectedOrgsGraph entity={entity} />
      </div>
      <AINarrative entity={entity} />
    </div>
  );
}
```

### EntityHeader Component

```jsx
function EntityHeader({ entity }) {
  const score = entity.red_flag_count;
  const scoreColor = score >= 3 ? 'var(--status-critical)' : score >= 1 ? 'var(--status-medium)' : 'var(--status-low)';
  return (
    <div className="card" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>{entity.name}</h2>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
            <span>BN: {entity.bn}</span>
            {entity.category && <span>Category: {entity.category}</span>}
            {entity.designation && <span>Designation: {entity.designation}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{
            background: `${scoreColor}22`, color: scoreColor,
            border: `1px solid ${scoreColor}`, borderRadius: 6,
            padding: '4px 12px', fontSize: 13, fontWeight: 600,
          }}>
            {score} Red Flag{score !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
```

### RedFlagsPanel Component

Map each flag string to a human-readable entry:

```jsx
const FLAG_LABELS = {
  same_year_loop:           { icon: '🔴', text: 'Same-year funding loop detected (phantom tax receipts)', level: 'critical' },
  loop_participant:         { icon: '🔴', text: (e) => `Participates in ${e.loop_count} circular funding loop${e.loop_count !== 1 ? 's' : ''}`, level: 'critical' },
  high_circular_dependency: { icon: '🔴', text: (e) => `${(e.circular_outflow_pct * 100).toFixed(0)}% of revenue is circular outflow`, level: 'critical' },
  low_program_delivery:     { icon: '🟡', text: (e) => `Only ${(e.program_pct * 100).toFixed(0)}% of spending reaches programs`, level: 'warning' },
};

function RedFlagsPanel({ entity }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Red Flags</h3>
      {entity.flags.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No flags detected.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entity.flags.map(flag => {
            const def = FLAG_LABELS[flag];
            if (!def) return null;
            const text = typeof def.text === 'function' ? def.text(entity) : def.text;
            return (
              <div key={flag} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
                <span>{def.icon}</span>
                <span>{text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

### FundingHistoryChart Component

```jsx
function FundingHistoryChart({ entity }) {
  const years = entity.funding_history.map(r => r.year);
  const values = entity.funding_history.map(r => r.total_govt ?? 0);

  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', formatter: (p) => `${p[0].name}: ${fmtDollars(p[0].value)}` },
    xAxis: { type: 'category', data: years, axisLabel: { color: 'var(--text-muted)', fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { formatter: v => fmtDollars(v), color: 'var(--text-muted)', fontSize: 11 } },
    series: [{
      type: 'bar',
      data: values,
      itemStyle: { color: 'var(--accent-purple)', borderRadius: [4, 4, 0, 0] },
    }],
    grid: { left: 60, right: 16, top: 16, bottom: 36 },
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
        Government Funding History
      </h3>
      {entity.funding_history.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No government funding records found.</p>
      ) : (
        <ReactECharts option={option} style={{ height: 200 }} />
      )}
    </div>
  );
}
```

### LoopParticipationTable Component

```jsx
function LoopParticipationTable({ entity }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
        Loop Participation ({entity.loop_count})
      </h3>
      {entity.loops.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Not a participant in any known funding loops.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px' }} title="Number of organizations in this loop">Hops</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }} title="Total annual flow through this loop">Flow</th>
              <th style={{ textAlign: 'center', padding: '4px 8px' }} title="Money left and returned within the same fiscal year">Same-Year</th>
              <th style={{ textAlign: 'right', padding: '4px 8px' }}>Years</th>
            </tr>
          </thead>
          <tbody>
            {entity.loops.map(loop => (
              <tr key={loop.loop_id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <td style={{ padding: '6px 8px' }}>{loop.hops}-hop</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtDollars(loop.total_flow)}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  {loop.same_year ? <span style={{ color: 'var(--status-critical)' }}>⚠️ Yes</span> : '—'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>
                  {loop.min_year}–{loop.max_year}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

### ConnectedOrgsGraph Component

Mini force graph showing other orgs in the same loops. Use a small react-force-graph-2d instance (already imported in FundingLoops.jsx — copy the import pattern).

Nodes: this org (red, large) + orgs sharing loops (purple, smaller).
Edges: one per shared loop.

If `entity.loops` is empty, show: "No connected organizations found."

### AINarrative Component

Generate a 2–3 paragraph investigative summary from the entity data. No API call — build it in JS from the data you already have.

```jsx
function buildNarrative(entity) {
  const parts = [];

  // Opening
  const status = entity.flags.length > 0 ? 'has been flagged' : 'shows no flags';
  parts.push(
    `${entity.name} ${status} in our analysis of CRA T3010 filings. ` +
    (entity.loop_count > 0
      ? `The organization participated in ${entity.loop_count} circular funding loop${entity.loop_count !== 1 ? 's' : ''} — arrangements where money flows through a chain of charities and returns to the origin.`
      : `The organization does not appear in any identified circular funding loops.`)
  );

  // Same-year flag
  if (entity.flags.includes('same_year_loop')) {
    parts.push(
      `In at least one of these loops, money left the organization and returned within the same fiscal year. ` +
      `This timing creates a structural opportunity to generate duplicate charitable tax receipts — ` +
      `the same dollar flowing through N organizations produces N separate receipts, inflating the apparent scale of charitable activity.`
    );
  }

  // Financial profile
  if (entity.program_pct > 0) {
    const progPct = (entity.program_pct * 100).toFixed(0);
    const circPct = entity.circular_outflow_pct > 0 ? (entity.circular_outflow_pct * 100).toFixed(0) : null;
    parts.push(
      `${progPct}% of the organization's expenditures went to programs` +
      (circPct ? `, while ${circPct}% was transferred out in circular flows` : '') +
      `. Public money received by this organization totalled ${fmtDollars(entity.funding_history.reduce((s, r) => s + (r.total_govt ?? 0), 0))} across all reporting years.`
    );
  }

  return parts.join('\n\n');
}

function AINarrative({ entity }) {
  const text = buildNarrative(entity);
  return (
    <div className="card" style={{ padding: 24 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
        AI Investigative Summary
      </h3>
      <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
        {text}
      </div>
    </div>
  );
}
```

---

## Step 6 — Dashboard.jsx Rewrite

Replace the existing generic stats panel with an **executive briefing layout**.

### 6a. Headline Section

```jsx
<div className="card" style={{ padding: '28px 32px', marginBottom: 20, borderLeft: '4px solid var(--accent-purple)' }}>
  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
    We analyzed $89.4B in public funding. Here is what we found.
  </h2>
  <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
    Cross-referencing CRA T3010 filings, federal grants, and Alberta procurement records to surface
    circular funding patterns, governance conflicts, and zombie recipients.
  </p>
</div>
```

### 6b. Featured Cases ("Start Here")

```jsx
const [featured, setFeatured] = useState([]);

useEffect(() => {
  fetchDashboardFeatured()
    .then(d => setFeatured(Array.isArray(d) ? d : (d.results ?? [])))
    .catch(() => {});
}, []);

// Render:
<div style={{ marginBottom: 20 }}>
  <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 12 }}>
    Start Here — High-Impact Cases
  </h3>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
    {featured.map(org => (
      <a key={org.bn} href={`/entity/${org.bn}`}
        style={{ textDecoration: 'none' }}
        onClick={e => { e.preventDefault(); navigate(`/entity/${org.bn}`); }}
      >
        <div className="card" style={{
          padding: 16, cursor: 'pointer',
          borderLeft: '3px solid var(--status-critical)',
          transition: 'transform 0.1s',
        }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = ''}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{org.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {org.loops_count} loops · {fmtDollars(org.circular_outflow)} circular
            {org.same_year_loops > 0 && <span style={{ color: 'var(--status-critical)', marginLeft: 6 }}>⚠️ same-year</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(org.flags ?? []).slice(0, 2).map((f, i) => (
              <span key={i} style={{
                fontSize: 11, padding: '2px 6px', borderRadius: 4,
                background: 'rgba(239,68,68,0.12)', color: 'var(--status-critical)',
              }}>{f}</span>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-purple)', fontWeight: 600 }}>
            View Case File →
          </div>
        </div>
      </a>
    ))}
  </div>
</div>
```

### 6c. Quick Investigation Buttons

```jsx
// Use existing navStats from /api/stats
<div style={{ marginBottom: 20 }}>
  <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 12 }}>
    Investigations
  </h3>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
    {[
      { label: 'Zombie Recipients', icon: '🧟', route: '/zombies', count: navStats?.zombie_count, color: 'var(--status-medium)' },
      { label: 'Funding Loops', icon: '🔄', route: '/loops', count: navStats?.total_funding_loops, color: 'var(--accent-purple)' },
      { label: 'Governance Networks', icon: '🕸️', route: '/governance', count: navStats?.multi_board_directors, color: 'var(--accent-purple)' },
      { label: 'Suspicious Loops', icon: '🔴', route: '/loops', count: null, color: 'var(--status-critical)' },
    ].map(item => (
      <button key={item.route + item.label} onClick={() => navigate(item.route)}
        style={{
          padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
          background: 'var(--bg-card)', border: `1px solid var(--border-primary)`,
          borderRadius: 'var(--radius-lg)', width: '100%',
        }}
      >
        <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
        {item.count != null && (
          <div style={{ fontSize: 20, fontWeight: 700, color: item.color, marginTop: 4 }}>
            {item.count.toLocaleString()}
          </div>
        )}
      </button>
    ))}
  </div>
</div>
```

---

## UI/UX Checklist

Apply to every new element before considering a section done:

- [ ] Dollar amounts use `fmtDollars()` — never raw numbers
- [ ] Risk levels use `classificationBadge()` — never hardcoded colors
- [ ] Column headers have `title="..."` tooltip explaining what the metric means
- [ ] Empty states are contextual (not "No results")
- [ ] Loading: skeleton shimmer on first load, spinner on filter change
- [ ] Org names always shown with BN in parentheses: `Org Name (BN: 123...RR0001)`
- [ ] Filter counts show in brackets next to filter label

---

## Verification Checklist

Run `npm run dev` and verify each of these before merging:

1. `http://localhost:5173/loops`
   - [ ] Stats bar shows "Suspicious Loops" count and "Phantom Receipts" dollar amount
   - [ ] Classification buttons work and update the table
   - [ ] Rows show Suspicion badge column and Phantom Receipts column
   - [ ] Clicking a row fetches and expands participant detail

2. `http://localhost:5173/governance`
   - [ ] Stats bar shows self-dealing director count
   - [ ] "Self-dealing" toggle filters the list
   - [ ] Director cards with loop intersections show red badge

3. `http://localhost:5173/zombies`
   - [ ] Three view toggle buttons appear
   - [ ] "Loop Crossref" tab loads and shows loop count column
   - [ ] Stats line shows "Loop-participating zombies: N (X%)"

4. `http://localhost:5173/entity/888078425RR0001`
   - [ ] Page loads without errors
   - [ ] Header shows org name and red flag count
   - [ ] Funding history bar chart renders
   - [ ] Loop participation table shows loops
   - [ ] Red flags panel shows human-readable flag text
   - [ ] AI narrative paragraph is present

5. `http://localhost:5173/`
   - [ ] Headline "We analyzed $89.4B..." is present
   - [ ] Featured case cards load with org names and flags
   - [ ] Clicking a card navigates to `/entity/:bn`
   - [ ] Quick investigation buttons navigate to correct pages
