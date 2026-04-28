import { useState, useEffect } from 'react';
import { fetchZombies, fetchZombieLoopCrossref, formatCurrency, fmtDollars } from '../api';

function MethodologyPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 20, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '12px 20px', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
        <span>How we detected this — Challenge #1 Zombie Recipients</span>
        <span style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-primary)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Data source:</strong> CRA T3010 annual charity filings — <code>cra_identification</code> (registration status, name, last filing year) joined with <code>govt_funding_by_charity</code> (government revenue share, total government funding received).</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Definition:</strong> A "zombie" meets all three conditions: (1) government funding represents 70%+ of total reported revenue — signalling near-total government dependency; (2) total government funding received is at least $100K — excluding trivially small recipients; (3) last CRA filing year is 2022 or earlier — the organization has stopped filing while still holding public money.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Why 70% threshold?</strong> Below 70%, the charity likely had independent revenue streams and may have wound down normally. At 70%+, the organization was essentially a government-funded entity — its cessation without accountability is a red flag.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Loop cross-reference:</strong> Zombie BN roots are matched against <code>cra__loop_participants</code>. If a zombie org appears in a funding loop, it suggests money was being circulated — potentially to obscure the eventual cessation of filings.</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}><strong>Limitations:</strong> Some organizations dissolved legitimately (mission completed, merged, renamed). BN reissues by CRA can create false positives. Name changes are not tracked — the same legal entity may appear under a different charity registration number.</div>
        </div>
      )}
    </div>
  );
}

export default function Zombies() {
  const [data, setData] = useState(null);
  const [crossrefData, setCrossrefData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [crossrefLoading, setCrossrefLoading] = useState(false);
  const [minFunding, setMinFunding] = useState(100000);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'crossref'

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetchZombies(minFunding, 50)
      .then(setData)
      .catch(err => setLoadError(err?.message || 'Failed to load zombie data'))
      .finally(() => setLoading(false));
  }, [minFunding]);

  const handleViewMode = (mode) => {
    setViewMode(mode);
    if (mode === 'crossref' && !crossrefData && !crossrefLoading) {
      setCrossrefLoading(true);
      fetchZombieLoopCrossref(minFunding, 100)
        .then(setCrossrefData)
        .catch(() => {})
        .finally(() => setCrossrefLoading(false));
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

      <MethodologyPanel />

      {/* View mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { key: 'table', label: 'Table' },
          { key: 'crossref', label: 'Loop Cross-Reference' },
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
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}></span>
          <input type="text" placeholder="Search name or BN..." value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '8px 12px 8px 36px', fontSize: 13, outline: 'none', width: 220 }} />
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {viewMode === 'table' ? `${filtered.length} of ${zombies.length}` : `${crossrefRows.length} organizations`}
        </span>
      </div>

      {/* Table view */}
      {viewMode === 'table' && (
        <div className="data-table-container">
          <div className="data-table-header">
            <span className="data-table-title">Zombie Recipients ({filtered.length})</span>
            <span className="badge info">{data?.query_mode || 'loading'}</span>
          </div>
          {loadError ? (
            <div style={{ padding: 32, textAlign: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', margin: 16 }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>Zombie Data Failed</div>
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
            <span className="data-table-title">Zombie × Loop Cross-Reference</span>
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
                          ? <span className="badge critical" style={{ fontSize: 11 }}>{z.loop_count} loop{z.loop_count !== 1 ? 's' : ''}</span>
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

    </div>
  );
}
