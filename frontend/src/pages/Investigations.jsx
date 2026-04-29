import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchInvestigation, fetchAlerts, formatCurrency } from '../api';

function MethodologyPanel({ queries }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 24, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', padding: '12px 20px',
          background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
        }}
      >
        <span>Methodology &mdash; OSINT &amp; WEBINT Investigation</span>
        <span style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>&#9660;</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Approach:</strong> We combine internal government records (CRA T3010 filings, federal grants, Alberta procurement)
            with external web intelligence gathered via DuckDuckGo search. The AI cross-references both data sources to produce a unified investigation report.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>External sources:</strong> Web search results include news articles, CRA registry pages, court records,
            regulatory enforcement databases, and organizational websites. All sources are cited with URLs.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Limitations:</strong> Web search results reflect publicly available information at the time of the query.
            Sentiment analysis is based on available media coverage and may not reflect the full picture. All findings should be verified by investigators.
          </p>
          {queries && queries.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Search queries used:</strong>
              <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                {queries.map((q, i) => <li key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{q}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReportSection({ title, color, children, icon }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
      borderLeft: `4px solid ${color}`, borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', textAlign: 'left', padding: '16px 20px',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}>&#9660;</span>
      </button>
      {!collapsed && (
        <div style={{ padding: '0 20px 16px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

function renderMarkdown(text) {
  if (!text) return null;
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent-cyan)">$1</a>')
    .replace(/\n/g, '<br/>');
}

function PriorityBadge({ text }) {
  let bg = 'rgba(34,197,94,0.15)';
  let color = 'var(--status-low)';
  const upper = (text || '').toUpperCase();
  if (upper.startsWith('IMMEDIATE')) { bg = 'rgba(239,68,68,0.15)'; color = 'var(--status-critical)'; }
  else if (upper.startsWith('HIGH')) { bg = 'rgba(249,115,22,0.15)'; color = 'var(--status-high)'; }
  else if (upper.startsWith('MEDIUM')) { bg = 'rgba(234,179,8,0.15)'; color = 'var(--status-medium)'; }
  const label = upper.split(':')[0];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--radius-md)',
      fontSize: 10, fontWeight: 700, background: bg, color, marginRight: 8,
      letterSpacing: '0.05em',
    }}>
      {label}
    </span>
  );
}

export default function Investigations() {
  const [entityName, setEntityName] = useState('');
  const [entityBn, setEntityBn] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchAlerts(2, 5)
      .then(d => {
        const rows = Array.isArray(d) ? d : d?.results || [];
        setSuggestions(rows.filter(r => r.canonical_name).slice(0, 5));
      })
      .catch(() => {});
  }, []);

  async function handleInvestigate() {
    if (!entityName && !entityBn) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPhase('Fetching internal records...');
    try {
      const timer = setTimeout(() => setPhase('Searching external sources...'), 2000);
      const timer2 = setTimeout(() => setPhase('AI analyzing & generating report...'), 5000);
      const data = await fetchInvestigation(entityName, entityBn);
      clearTimeout(timer);
      clearTimeout(timer2);
      setResult(data);
    } catch (err) {
      setError(err?.message || 'Investigation failed');
    } finally {
      setLoading(false);
      setPhase('');
    }
  }

  const actionItems = result?.report?.action_items || [];
  const actionList = Array.isArray(actionItems) ? actionItems : (typeof actionItems === 'string' ? actionItems.split('\n').filter(Boolean) : []);

  return (
    <div className="animate-in">
      {/* Header */}
      <div style={{
        marginBottom: 24, padding: '24px 28px',
        background: 'rgba(34,211,238,0.04)',
        border: '1px solid rgba(34,211,238,0.2)',
        borderTop: '3px solid var(--accent-cyan)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-cyan)', marginBottom: 8 }}>
          OSINT &amp; WEBINT Investigations
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 12, maxWidth: 820 }}>
          Go beyond our internal datasets. This tool pulls external web data &mdash; news articles, CRA registry records,
          court filings, and media coverage &mdash; then cross-references with our government spending database to generate
          a comprehensive investigation report with sourced findings, sentiment analysis, and actionable recommendations.
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--accent-indigo-light)', fontWeight: 600 }}>Internal</span> CRA T3010 + Federal Grants + Alberta Data
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>External</span> DuckDuckGo Web + News Search
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>AI</span> Claude-powered cross-reference analysis
          </div>
        </div>
      </div>

      <MethodologyPanel queries={result?.search_queries_used} />

      {/* Search form */}
      <div style={{
        marginBottom: 24, padding: '20px 24px',
        background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          Select an entity to investigate
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Organization Name</label>
            <input
              type="text"
              placeholder="e.g. The Salvation Army"
              value={entityName}
              onChange={e => setEntityName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvestigate()}
              style={{
                width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                padding: '10px 14px', fontSize: 13, outline: 'none',
              }}
            />
          </div>
          <div style={{ width: 180 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>CRA Business Number</label>
            <input
              type="text"
              placeholder="e.g. 119253746"
              value={entityBn}
              onChange={e => setEntityBn(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvestigate()}
              style={{
                width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                padding: '10px 14px', fontSize: 13, outline: 'none', fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
          <button
            onClick={handleInvestigate}
            disabled={loading || (!entityName && !entityBn)}
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              borderRadius: 'var(--radius-md)', border: 'none',
              background: loading ? 'var(--bg-tertiary)' : 'var(--accent-cyan)',
              color: loading ? 'var(--text-muted)' : '#000',
              opacity: (!entityName && !entityBn) ? 0.5 : 1,
            }}
          >
            {loading ? 'Investigating...' : 'Run OSINT Investigation'}
          </button>
        </div>

        {suggestions.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>High-risk entities:</span>
            {suggestions.map(s => (
              <button
                key={s.primary_bn || s.canonical_name}
                onClick={() => { setEntityName(s.canonical_name); setEntityBn((s.primary_bn || '').slice(0, 9)); }}
                style={{
                  padding: '4px 12px', fontSize: 11, cursor: 'pointer',
                  borderRadius: 'var(--radius-md)', border: '1px solid rgba(34,211,238,0.3)',
                  background: 'rgba(34,211,238,0.06)', color: 'var(--text-secondary)',
                }}
              >
                {s.canonical_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          padding: 40, textAlign: 'center',
          background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)', marginBottom: 24,
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{
              width: 40, height: 40, margin: '0 auto',
              border: '3px solid var(--border-primary)', borderTopColor: 'var(--accent-cyan)',
              borderRadius: '50%', animation: 'spin 1s linear infinite',
            }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{phase}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>This may take 10-20 seconds as we search external sources and run AI analysis</div>
          <div className="loading-shimmer" style={{ height: 120, marginTop: 20, borderRadius: 'var(--radius-lg)' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: 20, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', marginBottom: 24 }}>
          <div style={{ color: 'var(--status-critical)', fontSize: 13 }}>{error}</div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Report header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                Investigation Report: {result.entity || result.bn}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Generated {new Date(result.generated_at).toLocaleString()} &mdash; {result.external_sources?.length || 0} external sources found
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {result.bn && (
                <button
                  onClick={() => navigate(`/entity/${encodeURIComponent(result.bn)}`)}
                  style={{
                    padding: '8px 16px', fontSize: 12, cursor: 'pointer',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--accent-indigo)',
                    background: 'rgba(99,102,241,0.1)', color: 'var(--accent-indigo-light)',
                    fontWeight: 600,
                  }}
                >
                  View Full Dossier
                </button>
              )}
            </div>
          </div>

          {/* Section 1: Internal Summary */}
          <ReportSection title="Internal Data Record" color="var(--accent-indigo-light, #818cf8)" icon="&#128202;">
            {result.internal_record ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <div className="stat-card" style={{ padding: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Red Flags</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: result.internal_record.flags?.length > 0 ? 'var(--status-critical)' : 'var(--status-low)' }}>
                      {result.internal_record.flags?.length || 0}
                    </div>
                  </div>
                  <div className="stat-card" style={{ padding: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Funding Loops</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{result.internal_record.loop_count || 0}</div>
                  </div>
                  <div className="stat-card" style={{ padding: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Directors</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{result.internal_record.director_count || 0}</div>
                  </div>
                  <div className="stat-card" style={{ padding: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fed Grants</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{result.internal_record.federal_grant_count || 0}</div>
                  </div>
                  <div className="stat-card" style={{ padding: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Zombie</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: result.internal_record.zombie_status?.is_zombie ? 'var(--status-critical)' : 'var(--status-low)' }}>
                      {result.internal_record.zombie_status?.is_zombie ? 'YES' : 'No'}
                    </div>
                  </div>
                </div>
                {result.report?.internal_summary && (
                  <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8 }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(result.report.internal_summary) }} />
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No internal dossier available (BN not found in our databases). External-only investigation.
              </div>
            )}
          </ReportSection>

          {/* Section 2: External Findings */}
          <ReportSection title="External Data & Sources" color="var(--accent-cyan)" icon="&#127760;">
            {result.report?.external_findings && (
              <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, marginBottom: 16 }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(result.report.external_findings) }} />
            )}
            {result.external_sources?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Sources ({result.external_sources.length})
                </div>
                {result.external_sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block', padding: '10px 14px',
                      background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-md)', textDecoration: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-cyan)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-primary)'}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: 4 }}>{src.title || 'Untitled'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{(src.snippet || '').slice(0, 200)}</div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{(src.url || '').slice(0, 60)}...</span>
                      {src.date && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{src.date}</span>}
                      {src.source && <span className="badge info" style={{ fontSize: 9, padding: '1px 6px' }}>{src.source}</span>}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>No external sources found.</div>
            )}
          </ReportSection>

          {/* Section 3: Sentiment Analysis */}
          <ReportSection title="Public Sentiment Analysis" color="var(--accent-amber, #fbbf24)" icon="&#128200;">
            {result.report?.sentiment_analysis ? (
              <div>
                {(() => {
                  const text = (result.report.sentiment_analysis || '').toUpperCase();
                  let sentiment = 'NEUTRAL';
                  let sColor = 'var(--text-muted)';
                  let sBg = 'rgba(100,100,100,0.15)';
                  if (text.includes('NEGATIVE')) { sentiment = 'NEGATIVE'; sColor = 'var(--status-critical)'; sBg = 'rgba(239,68,68,0.15)'; }
                  else if (text.includes('POSITIVE')) { sentiment = 'POSITIVE'; sColor = 'var(--status-low)'; sBg = 'rgba(34,197,94,0.15)'; }
                  else if (text.includes('MIXED')) { sentiment = 'MIXED'; sColor = 'var(--status-medium)'; sBg = 'rgba(234,179,8,0.15)'; }
                  return (
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 'var(--radius-md)',
                      fontSize: 11, fontWeight: 700, background: sBg, color: sColor,
                      letterSpacing: '0.05em', marginBottom: 12,
                    }}>
                      {sentiment}
                    </span>
                  );
                })()}
                <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8 }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(result.report.sentiment_analysis) }} />
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sentiment analysis unavailable.</div>
            )}
          </ReportSection>

          {/* Section 4: Action Items */}
          <ReportSection title="Recommended Government Actions" color="var(--accent-emerald, #34d399)" icon="&#128221;">
            {actionList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {actionList.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 14px', background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)',
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', minWidth: 24 }}>{i + 1}.</span>
                    <div style={{ flex: 1 }}>
                      <PriorityBadge text={item} />
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(item.replace(/^(IMMEDIATE|HIGH|MEDIUM|LOW):\s*/i, '')) }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>No action items generated.</div>
            )}
          </ReportSection>

          {/* Footer */}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
            Generated by Claude AI with OSINT web intelligence &mdash; all findings should be verified by investigators before action
          </div>
        </div>
      )}
    </div>
  );
}
