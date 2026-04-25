import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { fetchEntityCaseFile, fmtDollars } from '../api';

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
