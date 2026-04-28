import { useState, useEffect } from 'react';
import { fetchSoleSource, formatCurrency } from '../api';

function MethodologyPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 20, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '12px 20px', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
        <span>How we detected this — Challenge #4 Sole-Source Contracts</span>
        <span style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-primary)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Data source:</strong> Alberta Open Data — public procurement records (<code>ab__ab_sole_source</code>), 15,533 contracts from provincial ministries and agencies.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Method:</strong> Records are grouped by <code>(vendor, department)</code> pair. The "amendment ratio" is calculated as <code>total combined value ÷ smallest individual award</code> in the group. A high ratio indicates that a vendor accumulated far more from a single ministry than any single contract would suggest — the hallmark of contract splitting or incremental sole-source awards.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Near-threshold flag:</strong> Individual awards between $45K–$50K are highlighted. Alberta's competitive bidding threshold is $50K — awards just below this amount avoid the requirement for open competition. Multiple such awards to the same vendor from the same ministry are a structuring signal.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Risk levels:</strong> Ratio 10x+ → Critical; 5x–10x → High; 3x–5x → Medium. The "Worst Cases" panel above sorts by total contract value, not ratio — because a high ratio on a small contract is less significant than a moderate ratio on a large one.</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}><strong>Limitations:</strong> Sole-source procurement is legal and often appropriate (proprietary software, emergency services, specialized expertise with no alternatives). Ratio alone does not prove wrongdoing. Some vendors serve niche government needs where they are the only qualified supplier.</div>
        </div>
      )}
    </div>
  );
}

function fmtDollars(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Number(n).toLocaleString()}`;
}

export default function SoleSource() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [minRatio, setMinRatio] = useState(3);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetchSoleSource(minRatio, 50)
      .then(setData)
      .catch(err => setLoadError(err?.message || 'Failed to load sole-source data'))
      .finally(() => setLoading(false));
  }, [minRatio]);

  const contracts = data?.results || [];
  const stats = data?.stats || {};

  const filtered = contracts.filter(s =>
    !search
    || s.vendor?.toLowerCase().includes(search.toLowerCase())
    || s.department?.toLowerCase().includes(search.toLowerCase())
  );

  // Top 5 by total value — more honest than ratio (avoids tiny-min-contract skew)
  const topOffenders = [...contracts]
    .sort((a, b) => (b.amended_amount || 0) - (a.amended_amount || 0))
    .slice(0, 5);

  const over5x = stats.contracts_over_5x ?? contracts.filter(c => (c.amendment_ratio || 0) >= 5).length;
  const topOffender = topOffenders[0] || null;
  const topVendor = topOffender?.vendor || stats.top_offender_vendor;
  const topTotal = topOffender?.amended_amount || stats.top_offender_total;
  const topContracts = topOffender?.amendment_count || stats.top_offender_contracts;

  return (
    <div className="animate-in">
      {/* Investigative Narrative Header */}
      <div style={{
        marginBottom: 24,
        padding: '24px 28px',
        background: 'rgba(245, 158, 11, 0.05)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
        borderTop: '3px solid var(--accent-amber)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: 12, color: 'var(--accent-amber)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Contract Creep — The Amendment Game
        </div>
        <div style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 12 }}>
          Alberta has <strong>{stats.total_sole_source_contracts?.toLocaleString() ?? '…'}</strong> sole-source contracts on record.{' '}
          {over5x > 0
            ? <><strong style={{ color: 'var(--status-critical)' }}>{over5x.toLocaleString()} vendor–department pairs</strong> accumulated 5× or more total value through repeat sole-source awards — bypassing Alberta's competitive bidding threshold.</>
            : <>Contracts are analyzed for vendor concentration patterns and splitting just below Alberta's competitive bidding threshold.</>
          }
          {topVendor && topTotal >= 1000000 && (
            <> The largest concentration: <strong style={{ color: 'var(--status-critical)' }}>{topVendor}</strong> received{' '}
            <strong>{fmtDollars(topTotal)}</strong> from a single ministry through {topContracts} sole-source contracts.</>
          )}
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Contracts', value: stats.total_sole_source_contracts?.toLocaleString() ?? '—', color: 'var(--accent-amber)' },
            { label: '5x+ Growth Cases', value: over5x > 0 ? over5x.toLocaleString() : '—', color: 'var(--status-critical)' },
            { label: 'Near Threshold ($40–50K)', value: stats.contracts_near_threshold != null ? stats.contracts_near_threshold.toLocaleString() : '—', color: 'var(--status-medium)' },
            { label: 'Total Contract Value', value: stats.total_at_risk ? formatCurrency(stats.total_at_risk) : '—', color: 'var(--text-primary)' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          Source: Alberta Open Procurement Data · All public records · "Amendment ratio" = total contract value ÷ smallest individual award for same vendor/department
        </div>
      </div>

      <MethodologyPanel />

      {/* Top 5 Worst Cases */}
      {topOffenders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Worst Cases — Highest Contract Growth
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {topOffenders.map((c, i) => {
              const ratio = c.amendment_ratio || 1;
              const isCritical = ratio >= 10;
              return (
                <div key={c.id || i} style={{
                  padding: '16px 20px',
                  background: isCritical ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)',
                  border: `1px solid ${isCritical ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.2)'}`,
                  borderTop: `3px solid ${isCritical ? 'var(--status-critical)' : 'var(--accent-amber)'}`,
                  borderRadius: 'var(--radius-lg)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, flex: 1 }}>{c.vendor}</div>
                    <span style={{
                      fontSize: 16, fontWeight: 900, fontFamily: 'var(--font-mono)',
                      color: isCritical ? 'var(--status-critical)' : 'var(--accent-amber)',
                      flexShrink: 0,
                    }}>
                      {ratio.toFixed(0)}×
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{c.department}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatCurrency(c.original_amount)}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isCritical ? 'var(--status-critical)' : 'var(--accent-amber)' }}>{formatCurrency(c.amended_amount)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                      {c.amendment_count} contracts
                    </span>
                    <span className={`badge ${c.risk_level || 'high'}`} style={{ fontSize: 10 }}>{c.risk_level || 'high'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Min Growth Ratio:
          <select
            value={minRatio}
            onChange={(e) => setMinRatio(Number(e.target.value))}
            style={{
              marginLeft: 8, padding: '6px 12px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              fontSize: 13, outline: 'none',
            }}
          >
            <option value={2}>2x or more</option>
            <option value={3}>3x or more</option>
            <option value={5}>5x or more</option>
            <option value={10}>10x or more (extreme)</option>
          </select>
        </label>

        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none', fontSize: 13,
          }}>
            
          </span>
          <input
            type="text"
            placeholder="Search vendor or department..."
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
          Showing {filtered.length} of {contracts.length} contracts
        </span>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <div className="data-table-header">
          <span className="data-table-title">📋 All Sole-Source Contracts ({filtered.length})</span>
          <span className="badge info">{data?.query_mode || 'loading'}</span>
        </div>
        {loadError ? (
          <div style={{ padding: 32, textAlign: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', margin: 16 }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>Sole-Source Data Failed</div>
            <div style={{ color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>{loadError}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Check backend at <code>http://localhost:8000/api/sole-source</code></div>
          </div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading sole-source analysis...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No contracts match your current filters.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Department</th>
                <th>Smallest Award</th>
                <th>Total Value</th>
                <th>Growth</th>
                <th>Contracts</th>
                <th>Risk Flags</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const ratio = c.amendment_ratio || 1;
                const ratioColor = ratio >= 10 ? 'var(--status-critical)' : ratio >= 5 ? 'var(--accent-amber)' : 'var(--text-secondary)';
                return (
                  <tr key={c.id || i}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.vendor}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.justification}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{c.department}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.province || 'AB'}</div>
                    </td>
                    <td>
                      <span className="funding-amount small">{formatCurrency(c.original_amount)}</span>
                      {c.original_amount < 50000 && c.original_amount >= 45000 && (
                        <div style={{ fontSize: 10, color: 'var(--accent-amber)', marginTop: 2, fontWeight: 600 }}>Near threshold</div>
                      )}
                    </td>
                    <td>
                      <span className="funding-amount large">{formatCurrency(c.amended_amount)}</span>
                    </td>
                    <td>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '4px 10px',
                        background: ratio >= 10 ? 'rgba(239,68,68,0.1)' : ratio >= 5 ? 'rgba(245,158,11,0.1)' : 'var(--bg-tertiary)',
                        borderRadius: 99,
                        fontFamily: 'var(--font-mono)', fontWeight: 800,
                        fontSize: 14, color: ratioColor,
                        border: `1px solid ${ratioColor}40`,
                      }}>
                        {ratio.toFixed(1)}x
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 15, fontWeight: 700, color: ratio >= 5 ? 'var(--status-critical)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        {c.amendment_count}
                      </span>
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      {(c.risk_flags || []).map((flag, fi) => (
                        <div key={fi} className="risk-flag" style={{ marginBottom: 4, fontSize: 11 }}>
                          <span className="risk-flag-icon"></span>
                          <span>{flag}</span>
                        </div>
                      ))}
                    </td>
                    <td>
                      <span className={`badge ${c.risk_level || 'medium'}`}>
                        {c.risk_level || 'medium'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
