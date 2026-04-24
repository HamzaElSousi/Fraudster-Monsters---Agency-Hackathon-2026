const API_BASE = 'http://localhost:8000';

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

export async function fetchLoops(minHops = 2, maxHops = 6, limit = 100) {
  const res = await fetch(`${API_BASE}/api/loops?min_hops=${minHops}&max_hops=${maxHops}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch loops');
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
  if (num == null) return '0';
  return Number(num).toLocaleString();
}

export function getRiskClass(level) {
  if (!level) return 'low';
  return level.toLowerCase();
}
