import { useState, useEffect } from 'react';
import { fetchZombies, formatCurrency } from '../api';

export default function Zombies() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minFunding, setMinFunding] = useState(100000);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    fetchZombies(minFunding, 50)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [minFunding]);

  const zombies = data?.results || [];

  const filtered = zombies.filter(z => {
    const matchSearch = !search
      || z.canonical_name?.toLowerCase().includes(search.toLowerCase())
      || z.primary_bn?.includes(search);
    const matchRisk = riskFilter === 'all' || z.risk_level === riskFilter;
    return matchSearch && matchRisk;
  });

  const totalLost = zombies.reduce((sum, z) => sum + (z.total_public_funding || 0), 0);

  return (
    <div className="animate-in">
      {/* Summary Bar */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 24,
        padding: '20px 24px',
        background: 'rgba(239, 68, 68, 0.06)',
        border: '1px solid rgba(239, 68, 68, 0.15)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--status-critical)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Challenge #1 — Zombie Recipients
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Organizations that received large amounts of public funding and then ceased operations shortly after.
            These entities went bankrupt, dissolved, or stopped filing within 12 months of receiving funding.
          </div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 140 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Total Public $ Lost</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--status-critical)' }}>
            {formatCurrency(totalLost)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{zombies.length} entities</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Min Funding:
          <select
            value={minFunding}
            onChange={(e) => setMinFunding(Number(e.target.value))}
            style={{
              marginLeft: 8, padding: '6px 12px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              fontSize: 13, outline: 'none',
            }}
          >
            <option value={50000}>$50K+</option>
            <option value={100000}>$100K+</option>
            <option value={500000}>$500K+</option>
            <option value={1000000}>$1M+</option>
          </select>
        </label>

        {/* Risk level filter */}
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Risk Level:
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            style={{
              marginLeft: 8, padding: '6px 12px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              fontSize: 13, outline: 'none',
            }}
          >
            <option value="all">All levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
        </label>

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none', fontSize: 13,
          }}>
            🔍
          </span>
          <input
            type="text"
            placeholder="Search name or BN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              padding: '8px 12px 8px 36px',
              fontSize: 13,
              outline: 'none',
              width: 220,
            }}
          />
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Showing {filtered.length} of {zombies.length} organizations
        </span>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <div className="data-table-header">
          <span className="data-table-title">🧟 Zombie Recipients ({filtered.length})</span>
          <span className="badge info">{data?.query_mode || 'loading'}</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading zombie recipients...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No organizations match your current filters.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th>Status</th>
                <th>Federal Funding</th>
                <th>Alberta Funding</th>
                <th>Total Public $</th>
                <th>Govt Revenue %</th>
                <th>Last Filing</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((z) => (
                <tr key={z.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{z.canonical_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      BN: {z.primary_bn || 'N/A'} · {z.entity_type}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${z.registration_status === 'Revoked' ? 'critical' : z.registration_status === 'Annulled' ? 'high' : 'medium'}`}>
                      {z.registration_status}
                    </span>
                  </td>
                  <td>
                    <span className={`funding-amount ${z.fed_funding > 2000000 ? 'large' : z.fed_funding > 500000 ? 'medium-val' : 'small'}`}>
                      {formatCurrency(z.fed_funding)}
                    </span>
                  </td>
                  <td>
                    <span className={`funding-amount ${z.ab_funding > 1000000 ? 'large' : z.ab_funding > 0 ? 'medium-val' : 'small'}`}>
                      {formatCurrency(z.ab_funding)}
                    </span>
                  </td>
                  <td>
                    <span className="funding-amount large" style={{ fontSize: 14 }}>
                      {formatCurrency(z.total_public_funding)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 50, height: 6, background: 'var(--bg-tertiary)',
                        borderRadius: 3, overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${Math.min(z.govt_revenue_pct || 0, 100)}%`, height: '100%',
                          background: (z.govt_revenue_pct || 0) > 80 ? 'var(--status-critical)' : (z.govt_revenue_pct || 0) > 60 ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                          borderRadius: 3,
                        }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        {z.govt_revenue_pct || '?'}%
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      {z.last_filing_year || 'N/A'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${z.risk_level || 'medium'}`}>
                      {z.risk_level || 'Medium'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
