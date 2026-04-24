import { useState, useEffect } from 'react';
import { fetchGovernance, formatCurrency } from '../api';

export default function Governance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedDirector, setExpandedDirector] = useState(null);
  const [minBoards, setMinBoards] = useState(3);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchGovernance(minBoards, 50)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [minBoards]);

  const directors = data?.results || [];

  const filtered = directors.filter(d =>
    `${d.first_name || ''} ${d.last_name || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-in">
      {/* Header */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 24,
        padding: '20px 24px',
        background: 'rgba(34, 211, 238, 0.06)',
        border: '1px solid rgba(34, 211, 238, 0.15)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Challenge #6 — Related Parties & Governance Networks
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Directors who sit on multiple boards of organizations that receive public funding.
            Cross-references CRA T3010 director filings with entity golden records to identify
            governance concentration and potential conflicts of interest.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Multi-Board</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-cyan)' }}>2,841</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Directors Data</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-cyan)' }}>2.87M</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Min Boards:
          <select
            value={minBoards}
            onChange={(e) => { setMinBoards(Number(e.target.value)); setExpandedDirector(null); }}
            style={{
              marginLeft: 8, padding: '6px 12px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              fontSize: 13, outline: 'none',
            }}
          >
            <option value={3}>3+ boards</option>
            <option value={4}>4+ boards</option>
            <option value={5}>5+ boards</option>
            <option value={7}>7+ boards</option>
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
            placeholder="Search director name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setExpandedDirector(null); }}
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
          Showing {filtered.length} of {directors.length} directors
        </span>
      </div>

      {/* Director Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading governance networks...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            padding: '48px 24px', textAlign: 'center',
            background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🕸️</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              No directors match your search
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Try adjusting your search term or minimum boards filter.
            </div>
          </div>
        ) : filtered.map((dir, i) => {
          const funding = typeof dir.total_controlled_funding === 'number'
            ? dir.total_controlled_funding
            : parseFloat(dir.total_controlled_funding || 0);

          const positions = (dir.positions || []);
          const posLabel = Array.isArray(positions) ? positions.join(', ') : String(positions);

          return (
            <div key={i} className="data-table-container" style={{ animation: `fadeInUp 0.4s ease-out ${i * 80}ms both` }}>
              <div
                className="data-table-header"
                style={{ cursor: 'pointer' }}
                onClick={() => setExpandedDirector(expandedDirector === i ? null : i)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: 'var(--gradient-cyan)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 700, color: 'var(--bg-primary)',
                    flexShrink: 0,
                  }}>
                    {(dir.first_name || '?')[0]}{(dir.last_name || '?')[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {dir.first_name} {dir.last_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {posLabel || 'Director'} · {dir.board_count} boards
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Controlled Funding</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(funding)}
                    </div>
                  </div>
                  <span className={`badge ${dir.board_count >= 5 ? 'critical' : dir.board_count >= 4 ? 'high' : 'medium'}`}>
                    {dir.board_count} boards
                  </span>
                  <span style={{ fontSize: 16, transition: 'transform 0.2s', transform: expandedDirector === i ? 'rotate(180deg)' : 'rotate(0)', color: 'var(--text-muted)' }}>
                    ▼
                  </span>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedDirector === i && (
                <div style={{ padding: '0 24px 24px', animation: 'fadeInUp 0.3s' }}>
                  {/* Risk Flags */}
                  {(dir.risk_flags || []).length > 0 && (
                    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(dir.risk_flags || []).map((flag, fi) => (
                        <div key={fi} className="risk-flag">
                          <span className="risk-flag-icon">⚠️</span>
                          <span>{flag}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Organizations Table */}
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Funding</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dir.organizations || []).map((org, oi) => (
                        <tr key={oi}>
                          <td>
                            <div
                              title={org.name}
                              style={{
                                fontWeight: 600, fontSize: 14,
                                maxWidth: 200, overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}
                            >
                              {org.name}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              BN: {org.bn_root}
                            </div>
                          </td>
                          <td>
                            <span className="funding-amount medium-val">
                              {formatCurrency(org.fed_funding)}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${
                              org.cra_status === 'Revoked' || org.cra_status === 'Annulled' ? 'critical' : 'low'
                            }`}>
                              {org.cra_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(dir.organizations || []).length === 0 && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>
                            No organization details available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
