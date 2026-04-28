// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { TrendingUp, Flag, Repeat2, Banknote, Users, BookOpen, Skull, AlertTriangle, CheckCircle2, XCircle, Bot, Network } from 'lucide-react';
import { fetchEntityCaseFile, fmtDollars, formatCurrency } from '../api';
import RiskBadge from '../components/RiskBadge';
import FlagBadge from '../components/FlagBadge';

const TABS = [
  { id: 'funding',    label: 'Funding History', Icon: TrendingUp },
  { id: 'risk',       label: 'Risk Flags',       Icon: Flag },
  { id: 'loops',      label: 'Loop Map',         Icon: Repeat2 },
  { id: 'duplicate',  label: 'Duplicate Funding',Icon: Banknote },
  { id: 'governance', label: 'Governance',        Icon: Users },
  { id: 'notes',      label: 'Case Notes',        Icon: BookOpen },
];

function buildNarrative(entity) {
  if (!entity) return '';
  const parts = [];
  const hasFlags = entity.flags?.length > 0;
  parts.push(
    `${entity.name} ${hasFlags ? 'has been flagged' : 'shows no major flags'} in our analysis of CRA T3010 filings. ` +
    (entity.loop_count > 0
      ? `The organization participated in ${entity.loop_count} circular funding loop${entity.loop_count !== 1 ? 's' : ''}.`
      : 'The organization does not appear in any identified circular funding loops.')
  );
  const totalFunding = (entity.funding_history || []).reduce((s, r) => s + (r.total_govt || 0), 0);
  if (totalFunding > 0) {
    parts.push(`Public money received totalled ${fmtDollars(totalFunding)} across all reporting years. Source: CRA T3010 filings and Federal Proactive Disclosure.`);
  }
  return parts.join('\n\n');
}

function RiskFlagsTab({ entity }) {
  const breakdown = entity.risk_breakdown || {};
  const cards = [
    {
      id: 'zombie',
      Icon: Skull,
      label: 'Zombie Recipient',
      score: breakdown.zombie || 0,
      maxScore: 40,
      triggered: (breakdown.zombie || 0) > 0,
      criteria: [
        {
          text: 'Government funding ≥ 70% of total revenue',
          met: (entity.zombie_status?.govt_share_pct || 0) >= 70,
          value: entity.zombie_status?.govt_share_pct ? `${entity.zombie_status.govt_share_pct.toFixed(0)}%` : null,
        },
        {
          text: 'CRA filings ceased by 2022',
          met: entity.zombie_status?.is_zombie || false,
          value: entity.zombie_status?.last_filing_year ? `Last filed: ${entity.zombie_status.last_filing_year}` : null,
        },
        {
          text: 'Total government funding ≥ $500K',
          met: (entity.zombie_status?.total_govt_funding || 0) >= 500000,
          value: entity.zombie_status?.total_govt_funding ? formatCurrency(entity.zombie_status.total_govt_funding) : null,
        },
      ],
    },
    {
      id: 'loop',
      Icon: Repeat2,
      label: 'Circular Funding Loop',
      score: breakdown.loop || 0,
      maxScore: 25,
      triggered: (breakdown.loop || 0) > 0,
      criteria: [
        {
          text: 'Appears in at least one CRA circular funding loop',
          met: (entity.loop_count || 0) > 0,
          value: entity.loop_count > 0 ? `${entity.loop_count} loop${entity.loop_count !== 1 ? 's' : ''}` : null,
        },
        {
          text: 'Same-year loop detected (phantom receipts risk)',
          met: (entity.flags || []).includes('same_year_loop'),
          value: null,
        },
        {
          text: 'Loop involves > $100K total flow',
          met: (entity.loops || []).some(l => (l.total_flow || 0) > 100000),
          value: entity.loops?.length > 0 ? `Max flow: ${fmtDollars(Math.max(...entity.loops.map(l => l.total_flow || 0)))}` : null,
        },
      ],
    },
    {
      id: 'duplicate',
      Icon: Banknote,
      label: 'Duplicate Funding',
      score: breakdown.duplicate || 0,
      maxScore: 20,
      triggered: (breakdown.duplicate || 0) > 0,
      criteria: [
        {
          text: 'Receives both federal and Alberta government funding',
          met: (entity.fed_total || 0) > 0 && (entity.ab_total || 0) > 0,
          value: (entity.fed_total > 0 && entity.ab_total > 0)
            ? `Fed: ${formatCurrency(entity.fed_total)} · AB: ${formatCurrency(entity.ab_total)}`
            : null,
        },
        {
          text: 'Combined dual-source funding ≥ $250K',
          met: ((entity.fed_total || 0) + (entity.ab_total || 0)) >= 250000,
          value: ((entity.fed_total || 0) + (entity.ab_total || 0)) > 0
            ? `Combined: ${formatCurrency((entity.fed_total || 0) + (entity.ab_total || 0))}`
            : null,
        },
      ],
    },
    {
      id: 'governance',
      Icon: Users,
      label: 'Governance Network',
      score: breakdown.governance || 0,
      maxScore: 15,
      triggered: (breakdown.governance || 0) > 0,
      criteria: [
        {
          text: 'Director sits on 3+ government-funded boards',
          met: (entity.directors || []).some(d => (d.board_count || 1) >= 3),
          value: (() => {
            const top = (entity.directors || []).filter(d => (d.board_count || 1) >= 3);
            return top.length > 0 ? `${top.length} director${top.length !== 1 ? 's' : ''} flagged` : null;
          })(),
        },
        {
          text: 'Director sits on 5+ government-funded boards',
          met: (entity.directors || []).some(d => (d.board_count || 1) >= 5),
          value: null,
        },
      ],
    },
  ];

  return (
    <div className="risk-flag-cards">
      {cards.map(card => (
        <div key={card.id} className={`risk-flag-card${card.triggered ? ' triggered' : ''}`}>
          <div className="risk-flag-card-header">
            <div className="risk-flag-card-title">
              <card.Icon size={16} style={{ flexShrink: 0 }} /> {card.label}
            </div>
            <div className="risk-flag-card-score">
              {card.score}/{card.maxScore} pts
              {card.triggered
                ? <span style={{ marginLeft: 6, color: 'var(--status-critical)', fontSize: 11 }}>● TRIGGERED</span>
                : <span style={{ marginLeft: 6, color: 'var(--status-low)', fontSize: 11 }}>● CLEAR</span>
              }
            </div>
          </div>
          <ul className="risk-criteria-list">
            {card.criteria.map((c, i) => (
              <li key={i} className="risk-criteria-item">
                <span className="criterion-icon">{c.met ? <CheckCircle2 size={14} style={{ color: 'var(--status-low)' }} /> : <XCircle size={14} style={{ color: 'var(--status-critical)' }} />}</span>
                <div>
                  <div>{c.text}</div>
                  {c.value && <div className="criterion-value">{c.value}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function DuplicateFundingTab({ entity }) {
  const fedTotal = entity.fed_total || 0;
  const abTotal = entity.ab_total || 0;
  const combined = fedTotal + abTotal;
  const fedGrants = entity.federal_grants || [];
  const hasAb = abTotal > 0;
  const hasFed = fedTotal > 0;

  if (!hasFed && !hasAb) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
        No overlapping federal/provincial funding detected for this organization.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {hasFed && hasAb && (
        <div style={{
          padding: '16px 20px',
          background: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.25)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          gap: 32,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Federal Total</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa' }}>{formatCurrency(fedTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Alberta Total</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-emerald)' }}>{formatCurrency(abTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Combined</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-accent)' }}>{formatCurrency(combined)}</div>
          </div>
        </div>
      )}

      {fedGrants.length > 0 && (
        <div>
          <h4 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 12 }}>
            Federal Grants — {formatCurrency(fedTotal)}
          </h4>
          <table className="data-table">
            <thead>
              <tr><th>Department</th><th>Year</th><th>Amount</th><th>Program</th></tr>
            </thead>
            <tbody>
              {fedGrants.map((g, i) => (
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

      {hasAb && (
        <div style={{ padding: '14px 18px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-secondary)' }}>
          ✓ Alberta funding of <strong style={{ color: 'var(--accent-emerald)' }}>{formatCurrency(abTotal)}</strong> confirmed from Alberta Open Data. Detailed per-year breakdown available on the <a href="/duplicative-funding" style={{ color: 'var(--accent-cyan)' }}>Duplicative Funding</a> page.
        </div>
      )}
    </div>
  );
}

function CaseNotesTab({ bn }) {
  const storageKey = `case_notes_${bn}`;
  const statusKey  = `case_status_${bn}`;
  const [notes, setNotes]   = useState(() => localStorage.getItem(storageKey) || '');
  const [status, setStatus] = useState(() => localStorage.getItem(statusKey) || 'Open');
  const [saved, setSaved]   = useState(false);
  const timerRef = useRef(null);

  const persist = useCallback((newNotes, newStatus) => {
    localStorage.setItem(storageKey, newNotes);
    localStorage.setItem(statusKey, newStatus);
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSaved(false), 2000);
  }, [storageKey, statusKey]);

  const handleNotes = (e) => {
    const v = e.target.value;
    setNotes(v);
    persist(v, status);
  };

  const handleStatus = (e) => {
    const v = e.target.value;
    setStatus(v);
    persist(notes, v);
  };

  return (
    <div className="case-notes-container">
      <div className="case-status-row">
        <span className="case-status-label">Case Status:</span>
        <select className="case-status-select" value={status} onChange={handleStatus}>
          <option>Open</option>
          <option>Under Review</option>
          <option>Escalated</option>
          <option>Closed</option>
          <option>Cleared</option>
        </select>
        {saved && <span className="case-notes-saved">✓ Saved</span>}
      </div>
      <textarea
        className="case-notes-textarea"
        placeholder="Add investigation notes… Notes are saved to your browser and persist on page reload."
        value={notes}
        onChange={handleNotes}
      />
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Notes are stored locally in your browser (localStorage). They are private and not sent to any server.
      </div>
    </div>
  );
}

export default function EntityCaseFile() {
  const { bn } = useParams();
  const navigate = useNavigate();
  const [entity, setEntity]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [activeTab, setActiveTab] = useState('funding');

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
        <div className="loading-shimmer" style={{ height: 60, borderRadius: 'var(--radius-lg)' }} />
        <div className="loading-shimmer" style={{ height: 300, borderRadius: 'var(--radius-lg)' }} />
      </div>
    );
  }

  if (error || !entity?.name) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <AlertTriangle size={40} style={{ marginBottom: 12, color: 'var(--status-critical)' }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--status-critical)', marginBottom: 8 }}>Entity Not Found</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>{error || `No data found for BN: ${bn}`}</div>
        <button onClick={() => navigate(-1)} style={{ padding: '8px 20px', background: 'var(--accent-purple)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13 }}>
          ← Go Back
        </button>
      </div>
    );
  }

  const riskFlags: string[] = entity.risk_flags || [];
  const riskScore: number   = entity.risk_score ?? 0;
  const riskTier: string    = entity.risk_tier ?? 'low';

  // Funding chart
  const fundingYears  = (entity.funding_history || []).map(r => r.year);
  const fundingValues = (entity.funding_history || []).map(r => r.total_govt || 0);
  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', formatter: (p) => `${p[0]?.name}: ${fmtDollars(p[0]?.value || 0)}` },
    xAxis: { type: 'category', data: fundingYears, axisLabel: { color: 'var(--text-muted)', fontSize: 11 }, axisLine: { lineStyle: { color: 'var(--border-primary)' } } },
    yAxis: { type: 'value', axisLabel: { formatter: v => fmtDollars(v), color: 'var(--text-muted)', fontSize: 10 }, splitLine: { lineStyle: { color: 'var(--border-primary)', opacity: 0.5 } } },
    series: [{ type: 'bar', data: fundingValues, itemStyle: { color: '#F59E0B', borderRadius: [4, 4, 0, 0] } }],
    grid: { left: 64, right: 16, top: 16, bottom: 36 },
  };

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Back */}
      <button onClick={() => navigate(-1)} style={{ alignSelf: 'flex-start', padding: '6px 14px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
        ← Back
      </button>

      {/* Case File Header */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{entity.name}</h2>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>BN: <span style={{ fontFamily: 'var(--font-mono)' }}>{entity.bn}</span></span>
              {entity.category && <span>{entity.category}</span>}
              {entity.designation && <span>{entity.designation}</span>}
            </div>
            {riskFlags.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {riskFlags.map(f => <FlagBadge key={f} type={f as any} />)}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>
            <RiskBadge score={riskScore} tier={riskTier} />
          </div>
        </div>
      </div>

      {/* Zombie Banner (always shown if applicable) */}
      {entity.zombie_status?.is_zombie && (
        <div style={{ padding: '14px 20px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderLeft: '4px solid var(--status-critical)', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skull size={22} style={{ color: 'var(--status-critical)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--status-critical)', marginBottom: 2 }}>
              ZOMBIE RECIPIENT — Last filed {entity.zombie_status.last_filing_year}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Received <strong>{formatCurrency(entity.zombie_status.total_govt_funding || 0)}</strong> in public funds while{' '}
              <strong>{entity.zombie_status.govt_share_pct?.toFixed(0)}% government-dependent</strong>, then stopped filing. Source: CRA T3010
            </div>
          </div>
        </div>
      )}

      {/* AI Brief (always visible, above tabs) */}
      <div className="ai-brief-panel">
        <div className="ai-brief-header">
          <div className="ai-brief-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bot size={15} /> AI Investigation Brief</div>
        </div>
        <div className="ai-brief-text" style={{ whiteSpace: 'pre-line' }}>
          {buildNarrative(entity)}
        </div>
      </div>

      {/* 6-Tab Navigation */}
      <div className="card" style={{ padding: '0' }}>
        <div className="case-tabs" style={{ padding: '0 20px' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`case-tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><tab.Icon size={13} />{tab.label}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '24px 20px' }}>
          {/* Tab: Funding History */}
          {activeTab === 'funding' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Total government funding received by year · Source: CRA T3010
              </div>
              {fundingYears.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>No government funding records found.</div>
              ) : (
                <ReactECharts option={chartOption} style={{ height: 240 }} />
              )}
              {(entity.funding_history || []).length > 0 && (
                <table className="data-table" style={{ marginTop: 20 }}>
                  <thead><tr><th>Year</th><th>Govt Funding</th><th>Total Revenue</th></tr></thead>
                  <tbody>
                    {entity.funding_history.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{r.year}</td>
                        <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtDollars(r.total_govt || 0)}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{fmtDollars(r.total_revenue || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab: Risk Flags */}
          {activeTab === 'risk' && <RiskFlagsTab entity={entity} />}

          {/* Tab: Loop Map */}
          {activeTab === 'loops' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {(entity.loops || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                  No circular funding patterns detected for this organization.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Circular funding network involving this organization — {entity.loop_count} loop{entity.loop_count !== 1 ? 's' : ''} detected
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Hops</th>
                        <th>Flow</th>
                        <th>Same-Year</th>
                        <th>Active Years</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(entity.loops || []).slice(0, 25).map((loop, i) => (
                        <tr key={loop.loop_id || i}>
                          <td><span className="badge medium">{loop.hops}-hop</span></td>
                          <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{fmtDollars(loop.total_flow)}</td>
                          <td>{loop.same_year ? <span className="badge critical" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={10} /> Yes</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                          <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{loop.min_year}–{loop.max_year}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {(entity.loop_partners || []).length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Connected Organizations</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {entity.loop_partners.map((p, i) => (
                      <span
                        key={i}
                        onClick={() => navigate(`/entity/${encodeURIComponent(p.partner_bn)}`)}
                        style={{ padding: '6px 12px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer', color: 'var(--accent-purple)', fontWeight: 500, transition: 'all var(--transition-fast)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,92,246,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(139,92,246,0.1)'}
                      >
                        <Repeat2 size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{p.partner_name || p.partner_bn}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Duplicate Funding */}
          {activeTab === 'duplicate' && <DuplicateFundingTab entity={entity} />}

          {/* Tab: Governance */}
          {activeTab === 'governance' && (
            <div>
              {(entity.directors || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>No director records found for this organization.</div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                    Directors and their connections to other publicly-funded organizations. Source: CRA T3010
                  </div>
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
                                style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: multiBoard ? 'rgba(239,68,68,0.12)' : 'var(--bg-tertiary)', color: multiBoard ? 'var(--status-critical)' : 'var(--text-muted)', cursor: multiBoard ? 'pointer' : 'default' }}
                                onClick={() => multiBoard && navigate('/governance')}
                                title={multiBoard ? 'Sits on multiple funded boards — view in Governance' : ''}
                              >
                                {multiBoard && <Network size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />}{d.board_count || 1} board{(d.board_count || 1) !== 1 ? 's' : ''}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* Tab: Case Notes */}
          {activeTab === 'notes' && <CaseNotesTab bn={bn} />}
        </div>
      </div>
    </div>
  );
}
