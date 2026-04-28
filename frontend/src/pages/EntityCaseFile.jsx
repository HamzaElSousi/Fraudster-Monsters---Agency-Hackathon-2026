import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { fetchEntityCaseFile, fmtDollars, formatCurrency } from '../api';

const FLAG_LABELS = {
  same_year_loop:           { icon: '🔴', level: 'critical', text: () => 'Same-year funding loop detected — phantom tax receipts possible' },
  loop_participant:         { icon: '🔴', level: 'critical', text: (e) => `Participates in ${e.loop_count} circular funding loop${e.loop_count !== 1 ? 's' : ''}` },
  high_circular_dependency: { icon: '🔴', level: 'critical', text: (e) => `${(e.circular_outflow_pct * 100).toFixed(0)}% of revenue is circular outflow` },
  low_program_delivery:     { icon: '🟡', level: 'warning',  text: (e) => `Only ${(e.program_pct * 100).toFixed(0)}% of spending reaches programs` },
};

function buildNarrative(entity) {
  if (!entity) return '';
  const parts = [];

  const hasFlags = entity.flags?.length > 0;
  parts.push(
    `${entity.name} ${hasFlags ? 'has been flagged' : 'shows no major flags'} in our analysis of CRA T3010 filings. ` +
    (entity.loop_count > 0
      ? `The organization participated in ${entity.loop_count} circular funding loop${entity.loop_count !== 1 ? 's' : ''} — chains where money flows through multiple charities and returns to the origin.`
      : 'The organization does not appear in any identified circular funding loops.')
  );

  if (entity.flags?.includes('same_year_loop')) {
    parts.push(
      'In at least one loop, donations left and returned within the same fiscal year. ' +
      'This timing creates a structural opportunity to generate duplicate charitable tax receipts — ' +
      'the same dollar flowing through N organizations can produce N separate receipts, inflating apparent charitable activity.'
    );
  }

  const totalFunding = (entity.funding_history || []).reduce((s, r) => s + (r.total_govt || 0), 0);
  if (totalFunding > 0 || entity.program_pct > 0) {
    const progPct = entity.program_pct > 0 ? `${(entity.program_pct * 100).toFixed(0)}% of expenditures went to programs` : null;
    const circPct = entity.circular_outflow_pct > 0 ? `${(entity.circular_outflow_pct * 100).toFixed(0)}% was transferred out in circular flows` : null;
    const totalStr = totalFunding > 0 ? `Public money received totalled ${fmtDollars(totalFunding)} across all reporting years.` : '';
    parts.push([progPct, circPct].filter(Boolean).join(', while ') + (progPct || circPct ? '. ' : '') + totalStr);
  }

  return parts.join('\n\n');
}

function FilingAnomalies({ flags }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? flags : flags.slice(0, 3);
  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', fontWeight: 700 }}>
        Filing Anomalies — T3010 Arithmetic Violations ({flags.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map((f, i) => {
          const isCritical = (f.severity || '').toLowerCase() === 'error' || (f.severity || '').toLowerCase() === 'critical';
          return (
            <div key={i} style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '8px 12px',
              background: isCritical ? 'rgba(239,68,68,0.06)' : 'rgba(234,179,8,0.06)',
              border: `1px solid ${isCritical ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)'}`,
              borderRadius: 6,
              fontSize: 12,
            }}>
              <span style={{ color: isCritical ? 'var(--status-critical)' : 'var(--status-medium)', flexShrink: 0 }}>{isCritical ? '🔴' : '🟡'}</span>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0, minWidth: 40 }}>{f.fiscal_year}</span>
              <span style={{ color: isCritical ? 'var(--status-critical)' : 'var(--status-medium)', fontWeight: 600, flexShrink: 0, marginRight: 4 }}>{f.issue_type}:</span>
              <span style={{ color: 'var(--text-secondary)' }}>{f.description}</span>
            </div>
          );
        })}
      </div>
      {flags.length > 3 && (
        <button
          onClick={() => setShowAll(s => !s)}
          style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-purple)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {showAll ? 'Show less ↑' : `Show ${flags.length - 3} more ↓`}
        </button>
      )}
    </div>
  );
}

export default function EntityCaseFile() {
  const { bn } = useParams();
  const navigate = useNavigate();
  const [entity, setEntity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchEntityCaseFile(bn)
      .then(setEntity)
      .catch(() => setError('Could not load entity — check the BN or try another organization.'))
      .finally(() => setLoading(false));
  }, [bn]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 4 }}>
        <div className="loading-shimmer" style={{ height: 100, borderRadius: 'var(--radius-lg)' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
          <div className="loading-shimmer" style={{ height: 200, borderRadius: 'var(--radius-lg)' }} />
          <div className="loading-shimmer" style={{ height: 200, borderRadius: 'var(--radius-lg)' }} />
        </div>
        <div className="loading-shimmer" style={{ height: 160, borderRadius: 'var(--radius-lg)' }} />
      </div>
    );
  }

  if (error || !entity?.name) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--status-critical)', marginBottom: 8 }}>Entity Not Found</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>{error || `No data found for BN: ${bn}`}</div>
        <button onClick={() => navigate(-1)} style={{ padding: '8px 20px', background: 'var(--accent-purple)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
          ← Go Back
        </button>
      </div>
    );
  }

  const score = entity.red_flag_count || 0;
  const scoreColor = score >= 3 ? 'var(--status-critical)' : score >= 1 ? 'var(--status-medium)' : 'var(--status-low)';

  // Funding chart option
  const fundingYears = (entity.funding_history || []).map(r => r.year);
  const fundingValues = (entity.funding_history || []).map(r => r.total_govt || 0);
  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', formatter: (p) => `${p[0]?.name}: ${fmtDollars(p[0]?.value || 0)}` },
    xAxis: { type: 'category', data: fundingYears, axisLabel: { color: 'var(--text-muted)', fontSize: 11 }, axisLine: { lineStyle: { color: 'var(--border-primary)' } } },
    yAxis: { type: 'value', axisLabel: { formatter: v => fmtDollars(v), color: 'var(--text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--border-primary)', opacity: 0.5 } } },
    series: [{ type: 'bar', data: fundingValues, itemStyle: { color: '#7c3aed', borderRadius: [4, 4, 0, 0] } }],
    grid: { left: 64, right: 16, top: 16, bottom: 36 },
  };

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Back button */}
      <button onClick={() => navigate(-1)} style={{ alignSelf: 'flex-start', padding: '6px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
        ← Back
      </button>

      {/* Header */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{entity.name}</h2>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>BN: <span style={{ fontFamily: 'var(--font-mono)' }}>{entity.bn}</span></span>
              {entity.category && <span>Category: {entity.category}</span>}
              {entity.designation && <span>Designation: {entity.designation}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ background: `${scoreColor}22`, color: scoreColor, border: `1px solid ${scoreColor}`, borderRadius: 6, padding: '4px 14px', fontSize: 13, fontWeight: 700 }}>
              {score} Red Flag{score !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Zombie Status Banner */}
      {entity.zombie_status?.is_zombie && (
        <div style={{
          padding: '14px 20px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderLeft: '4px solid var(--status-critical)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>🧟</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--status-critical)', marginBottom: 2 }}>
              ZOMBIE RECIPIENT — Last filed {entity.zombie_status.last_filing_year}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Received <strong>{formatCurrency(entity.zombie_status.total_govt_funding || 0)}</strong> in public funds while{' '}
              <strong>{entity.zombie_status.govt_share_pct?.toFixed(0)}% government-dependent</strong>, then stopped filing.
              Source: CRA T3010
            </div>
          </div>
        </div>
      )}

      {/* Two-column: flags + funding chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
        {/* Red Flags Panel */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', fontWeight: 700 }}>Red Flags</h3>
          {(entity.flags || []).length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>✅ No flags detected.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(entity.flags || []).map(flag => {
                const def = FLAG_LABELS[flag];
                if (!def) return null;
                const text = def.text(entity);
                return (
                  <div key={flag} className="risk-flag" style={{ alignItems: 'flex-start' }}>
                    <span className="risk-flag-icon">{def.icon}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.4 }}>{text}</span>
                  </div>
                );
              })}
            </div>
          )}
          {/* Overhead ratio badge */}
          {(entity.overhead_history || []).length > 0 && (() => {
            const latest = entity.overhead_history[0];
            const pct = latest?.overhead_ratio != null ? Math.round(latest.overhead_ratio * 100) : null;
            if (pct == null) return null;
            const isHigh = pct > 35;
            return (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-primary)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Admin Overhead ({latest.fiscal_year})</div>
                <span style={{
                  display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                  background: isHigh ? 'rgba(239,68,68,0.12)' : 'var(--bg-tertiary)',
                  color: isHigh ? 'var(--status-critical)' : 'var(--text-secondary)',
                  border: `1px solid ${isHigh ? 'rgba(239,68,68,0.3)' : 'var(--border-primary)'}`,
                }}>
                  {isHigh ? '⚠️ ' : ''}{pct}% overhead{isHigh ? ' — above 35% threshold' : ''}
                </span>
              </div>
            );
          })()}
        </div>

        {/* Funding History Chart */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', fontWeight: 700 }}>Government Funding History</h3>
          {fundingYears.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>No government funding records found.</div>
          ) : (
            <ReactECharts option={chartOption} style={{ height: 200 }} />
          )}
        </div>
      </div>

      {/* Loop Participation Table */}
      {(entity.loops || []).length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', fontWeight: 700 }}>
            Loop Participation ({entity.loop_count}){entity.loop_count > 20 ? ' — top 20 by flow' : ''}
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th title="Number of organizations in this loop">Hops</th>
                <th title="Total annual flow through this loop">Flow</th>
                <th title="Money returned to origin within the same fiscal year — enables phantom tax receipts">Same-Year</th>
                <th>Active Years</th>
              </tr>
            </thead>
            <tbody>
              {(entity.loops || []).slice(0, 20).map((loop, i) => (
                <tr key={loop.loop_id || i}>
                  <td><span className="badge medium">{loop.hops}-hop</span></td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtDollars(loop.total_flow)}</td>
                  <td>{loop.same_year ? <span className="badge critical" style={{ fontSize: 11 }}>⚠️ Yes</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{loop.min_year}–{loop.max_year}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* T3010 Filing Anomalies */}
      {(entity.t3010_flags || []).length > 0 && (
        <FilingAnomalies flags={entity.t3010_flags} />
      )}

      {/* Directors */}
      {(entity.directors || []).length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', fontWeight: 700 }}>
            Board of Directors ({entity.directors.length})
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th title="Number of government-funded charity boards this person sits on">Boards</th>
              </tr>
            </thead>
            <tbody>
              {entity.directors.map((d, i) => {
                const multiBoard = (d.board_count || 1) >= 3;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{d.first_name} {d.last_name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{d.position || '—'}</td>
                    <td>
                      <span
                        style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: multiBoard ? 'rgba(239,68,68,0.12)' : 'var(--bg-tertiary)',
                          color: multiBoard ? 'var(--status-critical)' : 'var(--text-muted)',
                          cursor: multiBoard ? 'pointer' : 'default',
                        }}
                        onClick={() => multiBoard && navigate('/governance')}
                        title={multiBoard ? 'Sits on multiple funded boards — view in Governance' : ''}
                      >
                        {multiBoard ? '🕸️ ' : ''}{d.board_count || 1} board{(d.board_count || 1) !== 1 ? 's' : ''}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Federal Grants */}
      {(entity.federal_grants || []).length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', fontWeight: 700 }}>
            Federal Grants Received
          </h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Total: <strong style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(entity.federal_grants.reduce((s, r) => s + (r.amount || 0), 0))}
            </strong> · Source: Federal Proactive Disclosure
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Year</th>
                <th>Amount</th>
                <th>Program</th>
              </tr>
            </thead>
            <tbody>
              {entity.federal_grants.map((g, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 12 }}>{g.department || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{g.fiscal_year || '—'}</td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtDollars(g.amount || 0)}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.program || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Loop Partners */}
      {(entity.loop_partners || []).length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', fontWeight: 700 }}>
            Connected Through Funding Loops
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {entity.loop_partners.map((p, i) => (
              <span
                key={i}
                onClick={() => navigate(`/entity/${encodeURIComponent(p.partner_bn)}`)}
                style={{
                  padding: '6px 12px',
                  background: 'rgba(139,92,246,0.1)',
                  border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: 'var(--accent-purple)',
                  fontWeight: 500,
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,92,246,0.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(139,92,246,0.1)'}
                title={`BN: ${p.partner_bn}`}
              >
                🔄 {p.partner_name || p.partner_bn}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI Narrative */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', fontWeight: 700 }}>
          AI Investigative Summary
        </h3>
        <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>
          {buildNarrative(entity)}
        </div>
      </div>
    </div>
  );
}
