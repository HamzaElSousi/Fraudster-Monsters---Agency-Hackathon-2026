import { useState, useEffect } from 'react';
import { fetchZombies, fetchZombieLoopCrossref, fetchGhostRecipients, formatCurrency, fmtDollars } from '../api';

export default function Zombies() {
  const [data, setData] = useState(null);
  const [crossrefData, setCrossrefData] = useState(null);
  const [ghostData, setGhostData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [crossrefLoading, setCrossrefLoading] = useState(false);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [ghostError, setGhostError] = useState(null);
  const [minFunding, setMinFunding] = useState(100000);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'crossref' | 'ghost'

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetchZombies(minFunding, 50)
      .then(setData)
      .catch(err => setLoadError(err?.message || 'Failed to load zombie data'))
      .finally(() => setLoading(false));
  }, [minFunding]);

  // Lazy-load tabs on first switch
  const handleViewMode = (mode) => {
    setViewMode(mode);
    if (mode === 'crossref' && !crossrefData && !crossrefLoading) {
      setCrossrefLoading(true);
      fetchZombieLoopCrossref(minFunding, 100)
        .then(setCrossrefData)
        .catch(() => {})
        .finally(() => setCrossrefLoading(false));
    }
    if (mode === 'ghost' && !ghostData && !ghostLoading) {
      setGhostLoading(true);
      setGhostError(null);
      fetchGhostRecipients(500000, 100)
        .then(rows => setGhostData(Array.isArray(rows) ? rows : []))
        .catch(err => setGhostError(err?.message || 'Failed to load ghost recipient data'))
        .finally(() => setGhostLoading(false));
    }
  };

  const zombies = data?.results || [];

  const filtered = zombies.filter(z => {
    const matchSearch = !search
      || z.canonical_name?.toLowerCase().includes(search.toLowerCase())
      || z.primary_bn?.includes(search);
    const matchRisk = riskFilter === 'all' || z.risk_level === riskFilter;
    return matchSearch && matchRisk;
  });

  const crossrefRows = crossrefData?.results || [];
  const loopParticipantCount = crossrefRows.filter(r => r.was_in_loop).length;
  const loopPct = crossrefRows.length > 0 ? ((loopParticipantCount / crossrefRows.length) * 100).toFixed(0) : 0;

  const totalLost = zombies.reduce((sum, z) => sum + (z.total_public_funding || 0), 0);

  return (
    <div className="animate-in">
      {/* Summary Bar */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap',
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
            Organizations that received large amounts of public funding then ceased filing.
            Cross-referenced with circular funding loops to detect pre-death loop participation.
          </div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 130 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Total Public $ Lost</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--status-critical)' }}>{formatCurrency(totalLost)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{zombies.length} entities</div>
        </div>
        {crossrefData && (
          <div style={{ textAlign: 'center', minWidth: 140 }} title="Zombie orgs that were participating in circular funding loops before they stopped filing">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Loop-Participating Zombies</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--status-medium)' }}>{loopParticipantCount}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{loopPct}% of zombies</div>
          </div>
        )}
      </div>

      {/* View mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'table', label: '📋 Table' },
          { key: 'crossref', label: '🔄 Loop Cross-Reference' },
          { key: 'ghost', label: '👻 Ghost Recipients' },
        ].map(m => (
          <button key={m.key} onClick={() => handleViewMode(m.key)}
            style={{
              padding: '6px 16px', fontSize: 13, cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${viewMode === m.key ? 'var(--accent-purple)' : 'var(--border-primary)'}`,
              background: viewMode === m.key ? 'var(--accent-purple)' : 'var(--bg-tertiary)',
              color: viewMode === m.key ? '#fff' : 'var(--text-secondary)',
            }}
          >{m.label}</button>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Min Funding:
          <select value={minFunding} onChange={(e) => setMinFunding(Number(e.target.value))}
            style={{ marginLeft: 8, padding: '6px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
            <option value={50000}>$50K+</option>
            <option value={100000}>$100K+</option>
            <option value={500000}>$500K+</option>
            <option value={1000000}>$1M+</option>
          </select>
        </label>

        {viewMode === 'table' && (
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Risk Level:
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}
              style={{ marginLeft: 8, padding: '6px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
              <option value="all">All levels</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
            </select>
          </label>
        )}

        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}>🔍</span>
          <input type="text" placeholder="Search name or BN..." value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '8px 12px 8px 36px', fontSize: 13, outline: 'none', width: 220 }} />
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {viewMode === 'table' ? `${filtered.length} of ${zombies.length}` : `${crossrefRows.length} orgs`}
        </span>
      </div>

      {/* Table view */}
      {viewMode === 'table' && (
        <div className="data-table-container">
          <div className="data-table-header">
            <span className="data-table-title">🧟 Zombie Recipients ({filtered.length})</span>
            <span className="badge info">{data?.query_mode || 'loading'}</span>
          </div>
          {loadError ? (
            <div style={{ padding: 32, textAlign: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', margin: 16 }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️ Zombie Data Failed</div>
              <div style={{ color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>{loadError}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Check backend at <code>http://localhost:8000/api/zombies</code></div>
            </div>
          ) : loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading zombie recipients...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No organizations match your current filters — try lowering the Min Funding threshold.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Status</th>
                  <th>Federal Funding</th>
                  <th>Total Public $</th>
                  <th title="Percentage of revenue that came from government sources">Govt Revenue %</th>
                  <th>Last Filing</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((z) => (
                  <tr key={z.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{z.canonical_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>BN: {z.primary_bn || 'N/A'}</div>
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
                      <span className="funding-amount large" style={{ fontSize: 14 }}>{formatCurrency(z.total_public_funding)}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 50, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(z.govt_revenue_pct || 0, 100)}%`, height: '100%', background: (z.govt_revenue_pct || 0) > 80 ? 'var(--status-critical)' : 'var(--accent-amber)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{z.govt_revenue_pct || '?'}%</span>
                      </div>
                    </td>
                    <td><span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{z.last_filing_year || 'N/A'}</span></td>
                    <td><span className={`badge ${z.risk_level || 'medium'}`}>{z.risk_level || 'Medium'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Loop Cross-Reference view */}
      {viewMode === 'crossref' && (
        <div className="data-table-container">
          <div className="data-table-header">
            <span className="data-table-title">🔄 Zombie × Loop Cross-Reference</span>
            {crossrefData && (
              <span style={{ fontSize: 12, color: 'var(--status-medium)', fontWeight: 600 }}>
                {loopParticipantCount} loop-participating zombies ({loopPct}% of total)
              </span>
            )}
          </div>
          {crossrefLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading loop cross-reference...</div>
          ) : crossrefRows.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No crossref data loaded — switch to this tab to trigger the load.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th title="Number of circular funding loops this zombie org participated in before it stopped filing">In Loops</th>
                  <th>Organization</th>
                  <th title="Total government funding received">Total Govt $</th>
                  <th title="Percentage of revenue from government sources">Govt %</th>
                  <th>Last Filing</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {crossrefRows
                  .filter(z => !search || (z.canonical_name || '').toLowerCase().includes(search.toLowerCase()))
                  .map((z, i) => (
                    <tr key={z.bn || i}>
                      <td>
                        {z.loop_count > 0
                          ? <span className="badge critical" style={{ fontSize: 11 }}>🔄 {z.loop_count} loop{z.loop_count !== 1 ? 's' : ''}</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{z.canonical_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>BN: {z.primary_bn || z.bn || 'N/A'}</div>
                      </td>
                      <td><span className="funding-amount medium-val">{fmtDollars(z.total_govt_funding || z.total_public_funding || 0)}</span></td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: (z.govt_revenue_pct || z.govt_share_pct || 0) > 80 ? 'var(--status-critical)' : 'var(--text-secondary)' }}>
                          {(z.govt_revenue_pct || z.govt_share_pct || 0).toFixed(1)}%
                        </span>
                      </td>
                      <td><span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{z.last_filing_year || 'N/A'}</span></td>
                      <td><span className={`badge ${z.risk_level || 'medium'}`}>{z.risk_level || 'Medium'}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Ghost Recipients view */}
      {viewMode === 'ghost' && (
        <div className="data-table-container">
          <div className="data-table-header">
            <span className="data-table-title">👻 Ghost Recipients — Federal Grant Vanishing Act</span>
            {ghostData && (
              <span style={{ fontSize: 12, color: 'var(--status-medium)', fontWeight: 600 }}>
                {ghostData.length} recipients · $500K+ received then silent 4+ years
              </span>
            )}
          </div>
          {ghostError ? (
            <div style={{ padding: 32, textAlign: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', margin: 16 }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⚠️ Ghost Recipient Data Failed</div>
              <div style={{ color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>{ghostError}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Check backend at <code>http://localhost:8000/api/ghost-recipients</code></div>
            </div>
          ) : ghostLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading ghost recipient analysis…</div>
          ) : !ghostData || ghostData.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Switch to this tab to load ghost recipient data.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Province</th>
                  <th title="Total federal grants received">Total Received</th>
                  <th title="Year of last recorded federal grant">Last Grant</th>
                  <th title="Years since last federal grant">Years Silent</th>
                  <th title="Number of distinct grant records"># Grants</th>
                  <th title="Number of federal departments that funded this recipient">Depts</th>
                  <th title="Whether a valid 9-digit Business Number was on file">BN Traced</th>
                </tr>
              </thead>
              <tbody>
                {(ghostData || [])
                  .filter(r => !search || (r.recipient_legal_name || '').toLowerCase().includes(search.toLowerCase()))
                  .map((r, i) => {
                    const silent = r.years_silent || 0;
                    const silentColor = silent >= 8 ? 'var(--status-critical)' : silent >= 5 ? 'var(--status-medium)' : 'var(--text-muted)';
                    return (
                      <tr key={i}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.recipient_legal_name || '—'}</div>
                          {r.bn9 && r.bn9.length >= 9 && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.bn9}</div>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.recipient_province || '—'}</td>
                        <td>
                          <span className="funding-amount large">{fmtDollars(r.total_received)}</span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                          {r.last_grant ? r.last_grant.slice(0, 4) : '—'}
                        </td>
                        <td>
                          <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 14, color: silentColor }}>
                            {silent > 0 ? `${silent}y` : '—'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                          {r.grant_count?.toLocaleString() || '—'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                          {r.dept_count || '—'}
                        </td>
                        <td>
                          {r.no_bn
                            ? <span style={{ color: 'var(--status-critical)', fontWeight: 600, fontSize: 12 }}>✗ Untraced</span>
                            : <span style={{ color: 'var(--status-low)', fontSize: 12 }}>✓ Traced</span>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
