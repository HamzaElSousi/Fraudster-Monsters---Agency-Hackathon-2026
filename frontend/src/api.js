const API_BASE = import.meta.env.VITE_API_URL || '';

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/api/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchZombies(minFunding = 100000, limit = 50) {
  const res = await fetch(`${API_BASE}/api/zombies?min_funding=${minFunding}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch zombies');
  return res.json();
}

export async function fetchLoops(minHops = 2, maxHops = 6, minFlow = 0, maxFlow = 0, sameYearOnly = false, riskLevel = '', limit = 100) {
  const params = new URLSearchParams({
    min_hops: minHops, max_hops: maxHops,
    min_flow: minFlow, max_flow: maxFlow,
    same_year_only: sameYearOnly,
    limit,
  });
  if (riskLevel) params.set('risk_level', riskLevel);
  const res = await fetch(`${API_BASE}/api/loops?${params}`);
  if (!res.ok) throw new Error('Failed to fetch loops');
  return res.json();
}

export async function fetchLoopsStats() {
  const res = await fetch(`${API_BASE}/api/loops/stats`);
  if (!res.ok) throw new Error('Failed to fetch loops stats');
  return res.json();
}

export async function fetchLoopCharities(limit = 50) {
  const res = await fetch(`${API_BASE}/api/loops/charities?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch loop charities');
  return res.json();
}

export async function fetchLoopGraph(limit = 50) {
  const res = await fetch(`${API_BASE}/api/loops/graph?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch loop graph');
  return res.json();
}

export async function fetchGovernance(minBoards = 3, limit = 50) {
  const res = await fetch(`${API_BASE}/api/governance?min_boards=${minBoards}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch governance');
  return res.json();
}

export async function fetchAlerts(minFlags = 2, limit = 20) {
  const res = await fetch(`${API_BASE}/api/alerts?min_flags=${minFlags}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
}

export async function fetchSoleSource(minRatio = 3.0, limit = 50) {
  const res = await fetch(`${API_BASE}/api/sole-source?min_ratio=${minRatio}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch sole source');
  return res.json();
}

export async function searchEntities(query, limit = 20) {
  const res = await fetch(`${API_BASE}/api/entities/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to search entities');
  return res.json();
}

export async function fetchEntityDossier(entityId) {
  const res = await fetch(`${API_BASE}/api/entities/${entityId}`);
  if (!res.ok) throw new Error('Failed to fetch entity dossier');
  return res.json();
}

export async function sendChatMessage(message) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error('Failed to send chat message');
  return res.json();
}

export function formatCurrency(amount) {
  if (amount == null) return '$0';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '$0';
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

export function formatNumber(num) {
  if (num == null) return '—';
  return Number(num).toLocaleString();
}

export function getRiskClass(level) {
  if (!level) return 'low';
  return level.toLowerCase();
}

// ── Dollar formatter ───────────────────────────────────────────────────────
export function fmtDollars(n) {
  if (n == null || n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

// ── Risk classification badge ──────────────────────────────────────────────
export function classificationBadge(cls) {
  const map = {
    high_alert: { label: 'High Alert', color: 'var(--status-critical)' },
    suspicious: { label: 'Suspicious', color: 'var(--status-medium)' },
    normal:     { label: 'Normal',     color: 'var(--status-low)' },
  };
  return map[cls] ?? map.normal;
}

// ── New fetch functions for deep-dive features ─────────────────────────────

// Enriched loops: adds suspicion_score, classification, phantom_receipts
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
export const fetchLoopDetail = (loopId) =>
  fetch(`${API_BASE}/api/loops/detail/${loopId}`).then(r => r.json());

// Directors whose multiple orgs appear in the same loop together
export const fetchSelfDealingDirectors = (minBoards = 2, limit = 50) =>
  fetch(`${API_BASE}/api/governance/self-dealing?min_boards=${minBoards}&limit=${limit}`)
    .then(r => r.json());

// Zombies enriched with loop_count and was_in_loop boolean
export const fetchZombieLoopCrossref = (minFunding = 100000, limit = 50) =>
  fetch(`${API_BASE}/api/zombies/loop-crossref?min_funding=${minFunding}&limit=${limit}`)
    .then(r => r.json());

// Full entity accountability dossier
export const fetchEntityCaseFile = (bn) =>
  fetch(`${API_BASE}/api/entity/${encodeURIComponent(bn)}`).then(r => r.json());

// 5 pre-ranked orgs for Dashboard "Start Here" cards
export const fetchDashboardFeatured = () =>
  fetch(`${API_BASE}/api/dashboard/featured`).then(r => r.json());
