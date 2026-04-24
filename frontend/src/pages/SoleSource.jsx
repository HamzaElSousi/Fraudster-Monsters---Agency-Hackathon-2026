import { useState, useEffect } from 'react';
import { fetchSoleSource, formatCurrency } from '../api';

export default function SoleSource() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minRatio, setMinRatio] = useState(3);

  useEffect(() => {
    setLoading(true);
    fetchSoleSource(minRatio, 50)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [minRatio]);

  const contracts = data?.results || [];
  const stats = data?.stats || {};

  return (
    <div className="animate-in">
      {/* Header */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 24,
        padding: '20px 24px',
        background: 'rgba(245, 158, 11, 0.06)',
        border: '1px solid rgba(245, 158, 11, 0.15)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--accent-amber)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Challenge #4 — Sole Source & Amendment Creep
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Contracts that started small and competitive but grew large through sole-source amendments.
            Identifies patterns where the amended value dwarfs the original bid, or where contracts
            are split just below competitive thresholds.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexShrink: 0, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Contracts</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-amber)' }}>
              {(stats.total_sole_source_contracts || 15533).toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>10×+ Growth</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-critical)' }}>
              {(stats.contracts_over_10x || 203).toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>At Risk $</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-critical)' }}>
              {formatCurrency(stats.total_at_risk || 579_000_000)}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Min Amendment Ratio:
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
            <option value={2}>2× or more</option>
            <option value={3}>3× or more</option>
            <option value={5}>5× or more</option>
            <option value={10}>10× or more (extreme)</option>
          </select>
        </label>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{contracts.length} contracts shown</span>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <div className="data-table-header">
          <span className="data-table-title">📋 Sole-Source Contracts with Amendment Creep ({contracts.length})</span>
          <span className="badge info">{data?.query_mode || 'loading'}</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading sole-source analysis...
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Department</th>
                <th>Original Award</th>
                <th>Amended Value</th>
                <th>Growth</th>
                <th>Amendments</th>
                <th>Risk Flags</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c, i) => {
                const ratio = c.amendment_ratio || 1;
                const ratioColor = ratio >= 10 ? 'var(--status-critical)' : ratio >= 5 ? 'var(--accent-amber)' : 'var(--text-secondary)';
                return (
                  <tr key={c.id || i}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.vendor}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {c.justification}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{c.department}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.province || 'AB'}</div>
                    </td>
                    <td>
                      <span className="funding-amount small">{formatCurrency(c.original_amount)}</span>
                      {c.original_amount < 50000 && c.original_amount >= 45000 && (
                        <div style={{ fontSize: 10, color: 'var(--accent-amber)', marginTop: 2, fontWeight: 600 }}>
                          ⚠ Near threshold
                        </div>
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
                        {ratio.toFixed(1)}×
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
                          <span className="risk-flag-icon">⚠️</span>
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
