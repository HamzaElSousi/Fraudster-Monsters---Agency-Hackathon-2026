import { useState, useEffect } from 'react';
import { fetchGovernance, fetchSelfDealingDirectors, formatCurrency, fmtDollars } from '../api';

function MethodologyPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 20, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '12px 20px', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
        <span>How we detected this — Challenge #6 Governance Networks</span>
        <span style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-primary)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Data source:</strong> CRA T3010 director filings — <code>cra__cra_directors</code>. Each row is a (charity, first_name, last_name, position, fiscal_year) record. We restrict to government-funded charities only (<code>total_govt &gt; 0</code>) to focus on public accountability.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Method:</strong> Exact name matching — <code>(first_name, last_name)</code> pairs that appear as directors across 3+ distinct BN roots (charity registration numbers). "Controlled flow" is the sum of government funding received by all organizations where the director holds a position.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Loop Exposure filter:</strong> Directors are cross-referenced against <code>cra__loop_participants</code>. If two or more of a director's organizations appear in the same funding loop, it flags a potential conflict of interest — the director may influence fund flows between organizations they control simultaneously.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Exposed flow:</strong> The total government funding flowing through loops that involve these directors' organizations — not the amount the director personally received, but the scale of public money they had governance influence over in circular-flow situations.</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}><strong>Limitations:</strong> Name matching without disambiguation — common names (e.g., "John Smith", "Mary Johnson") will aggregate records from multiple distinct individuals. No province or position cross-check is applied. The count is approximate and likely inflates the true number of multi-board directors. "Loop Exposure" is a correlation, not proof of self-dealing.</div>
        </div>
      )}
    </div>
  );
}

export default function Governance() {
  const [data, setData] = useState(null);
  const [selfDealingData, setSelfDealingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expandedDirector, setExpandedDirector] = useState(null);
  const [minBoards, setMinBoards] = useState(3);
  const [search, setSearch] = useState('');
  const [selfDealingOnly, setSelfDealingOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetchGovernance(minBoards, 50)
      .then(setData)
      .catch(err => setLoadError(err?.message || 'Failed to load governance data'))
      .finally(() => setLoading(false));
  }, [minBoards]);

  // Load self-dealing data once on mount
  useEffect(() => {
    fetchSelfDealingDirectors(2, 200)
      .then(setSelfDealingData)
      .catch(() => {});
  }, []);

  // Build lookup: "firstname lastname" → self-dealing record
  const selfDealingMap = {};
  for (const sd of (selfDealingData?.results || [])) {
    const key = `${sd.first_name} ${sd.last_name}`.toLowerCase();
    selfDealingMap[key] = sd;
  }

  const totalControlledFlow = (selfDealingData?.results || [])
    .reduce((s, r) => s + (r.controlled_flow || 0), 0);

  const directors = selfDealingOnly
    ? (selfDealingData?.results || []).map(sd => ({
        first_name: sd.first_name,
        last_name: sd.last_name,
        board_count: sd.board_count,
        positions: sd.positions || [],
        organizations: (sd.organizations || []).map(o => ({
          bn_root: o.bn,
          name: o.name,
          fed_funding: '',
          cra_status: 'Registered',
        })),
        total_controlled_funding: sd.controlled_flow,
        risk_flags: [`Self-dealing: ${sd.self_dealing_loops} loop${sd.self_dealing_loops !== 1 ? 's' : ''} where multiple controlled orgs appear together`],
        _selfDealing: sd,
      }))
    : (data?.results || []);

  const filtered = directors.filter(d =>
    `${d.first_name || ''} ${d.last_name || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-in">
      {/* Header / Stats Bar */}
      <div style={{
        marginBottom: 24,
        padding: '24px 28px',
        background: 'rgba(34, 211, 238, 0.06)',
        border: '1px solid rgba(34, 211, 238, 0.15)',
        borderTop: '3px solid var(--accent-cyan)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Challenge #6 — Related Parties & Governance Networks
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Directors sitting on 3+ govt-funded charity boards simultaneously, identified by
            name-matching across CRA T3010 filings. Count is approximate — common names may
            represent multiple individuals. "Loop Exposure" flags directors whose organizations
            appear in circular funding loops.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Directors shown</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-cyan)' }}>
              {loading ? '…' : filtered.length.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'center' }} title="Directors whose organizations appear in funding loops">
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loop-Exposed Directors</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-critical)' }}>
              {selfDealingData ? selfDealingData.count.toLocaleString() : '…'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }} title="Total flow through loops involving these directors' organizations">
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Exposed Flow</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-critical)' }}>
              {selfDealingData ? fmtDollars(totalControlledFlow) : '…'}
            </div>
          </div>
        </div>
      </div>

      <MethodologyPanel />

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Min Boards:
          <select
            value={minBoards}
            onChange={(e) => { setMinBoards(Number(e.target.value)); setExpandedDirector(null); setSelfDealingOnly(false); }}
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

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '6px 12px', background: selfDealingOnly ? 'rgba(239,68,68,0.1)' : 'var(--bg-tertiary)', border: `1px solid ${selfDealingOnly ? 'var(--status-critical)' : 'var(--border-primary)'}`, borderRadius: 'var(--radius-md)' }}>
          <input
            type="checkbox"
            checked={selfDealingOnly}
            onChange={e => { setSelfDealingOnly(e.target.checked); setExpandedDirector(null); }}
            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--status-critical)' }}
          />
          <span style={{ color: selfDealingOnly ? 'var(--status-critical)' : 'var(--text-secondary)', fontWeight: selfDealingOnly ? 600 : 400 }}>
            Loop Exposure only
            {selfDealingData && <span style={{ marginLeft: 4, color: 'var(--status-critical)' }}>({selfDealingData.count})</span>}
          </span>
        </label>

        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}></span>
          <input
            type="text"
            placeholder="Search director name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setExpandedDirector(null); }}
            style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
              padding: '8px 12px 8px 36px', fontSize: 13, outline: 'none', width: 220,
            }}
          />
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length} directors
        </span>
      </div>

      {/* Director Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loadError ? (
          <div style={{ padding: 32, textAlign: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>Governance Data Failed</div>
            <div style={{ color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>{loadError}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Check backend at <code>http://localhost:8000/api/governance</code></div>
          </div>
        ) : loading && !selfDealingOnly ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading governance networks...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🕸️</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No directors match your search</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Try adjusting the search or minimum boards filter.</div>
          </div>
        ) : filtered.map((dir, i) => {
          const funding = typeof dir.total_controlled_funding === 'number'
            ? dir.total_controlled_funding : parseFloat(dir.total_controlled_funding || 0);
          const key = `${dir.first_name || ''} ${dir.last_name || ''}`.toLowerCase();
          const sdRecord = dir._selfDealing || selfDealingMap[key];
          const isSelfDealing = !!sdRecord;

          const positions = (dir.positions || []);
          const posArr = Array.isArray(positions) ? positions : String(positions).split(',').map(s => s.trim());
          const posLabel = posArr.slice(0, 3).join(', ') + (posArr.length > 3 ? ` +${posArr.length - 3} more` : '');

          return (
            <div key={i} className="data-table-container" style={{ animation: `fadeInUp 0.4s ease-out ${i * 60}ms both`, borderLeft: isSelfDealing ? '3px solid var(--status-critical)' : undefined }}>
              <div className="data-table-header" style={{ cursor: 'pointer' }} onClick={() => setExpandedDirector(expandedDirector === i ? null : i)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: isSelfDealing ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : 'var(--gradient-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {(dir.first_name || '?')[0]}{(dir.last_name || '?')[0]}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {dir.first_name} {dir.last_name}
                      {isSelfDealing && (
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: 'var(--status-critical)', border: '1px solid var(--status-critical)', fontWeight: 600 }}>
                          🔄 Loop Exposure
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {posLabel || 'Director'} · {dir.board_count} boards
                      {isSelfDealing && <span style={{ marginLeft: 8, color: 'var(--status-critical)' }}>· {sdRecord.self_dealing_loops} loop connections · {fmtDollars(sdRecord.controlled_flow)} flow</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Controlled Funding</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: isSelfDealing ? 'var(--status-critical)' : 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(funding)}
                    </div>
                  </div>
                  <span className={`badge ${dir.board_count >= 5 ? 'critical' : dir.board_count >= 4 ? 'high' : 'medium'}`}>
                    {dir.board_count} boards
                  </span>
                  <span style={{ fontSize: 16, transition: 'transform 0.2s', transform: expandedDirector === i ? 'rotate(180deg)' : 'rotate(0)', color: 'var(--text-muted)' }}>▼</span>
                </div>
              </div>

              {expandedDirector === i && (
                <div style={{ padding: '0 24px 24px', animation: 'fadeInUp 0.3s' }}>
                  {/* Risk flags */}
                  {(dir.risk_flags || []).length > 0 && (
                    <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(dir.risk_flags || []).map((flag, fi) => (
                        <div key={fi} className="risk-flag">
                          <span className="risk-flag-icon"></span>
                          <span>{flag}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Self-dealing loop detail */}
                  {isSelfDealing && sdRecord?.intersecting_loops?.length > 0 && (
                    <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--status-critical)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Self-Dealing Loops</div>
                      {sdRecord.intersecting_loops.slice(0, 5).map((loop, li) => (
                        <div key={li} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Loop #{loop.loop_id} — {loop.hops} hops — {fmtDollars(loop.total_flow)}
                          {loop.same_year && <span style={{ marginLeft: 6, color: 'var(--status-critical)', fontWeight: 600 }}>same-year</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Orgs table */}
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
                        <tr key={org.bn_root || org.bn || oi}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 14, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={org.name}>{org.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>BN: {org.bn_root || org.bn}</div>
                          </td>
                          <td><span className="funding-amount medium-val">{formatCurrency(org.fed_funding)}</span></td>
                          <td>
                            <span className={`badge ${org.cra_status === 'Revoked' || org.cra_status === 'Annulled' ? 'critical' : 'low'}`}>
                              {org.cra_status || 'Registered'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(dir.organizations || []).length === 0 && (
                        <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>No organization details available</td></tr>
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
