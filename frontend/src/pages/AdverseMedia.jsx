import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAdverseMedia, fetchAlerts } from '../api';

function MethodologyPanel() {
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
        <span>How this works — Challenge #10 Adverse Media</span>
        <span style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Approach:</strong> We use AI to cross-reference entity profiles from our government spending
            database against known adverse media patterns. The AI generates targeted search queries for media databases,
            court records, and regulatory enforcement databases.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>What it detects:</strong> Fraud allegations, regulatory enforcement actions (CRA audits),
            safety incidents, criminal investigations, sanctions, and compliance violations. Not political controversy or op-eds.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Precision focus:</strong> The challenge is distinguishing genuine red-flag reporting from noise.
            Our AI analyzes the entity's funding profile, governance patterns, and existing flags to generate targeted,
            high-precision search queries rather than generic keyword searches.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdverseMedia() {
  const [entityName, setEntityName] = useState('');
  const [entityBn, setEntityBn] = useState('');
  const [loading, setLoading] = useState(false);
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

  async function handleAnalyze() {
    if (!entityName && !entityBn) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await fetchAdverseMedia(entityName, entityBn);
      setResult(data);
    } catch (err) {
      setError(err?.message || 'Failed to generate adverse media analysis');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-in">
      <div style={{
        marginBottom: 24, padding: '24px 28px',
        background: 'rgba(239,68,68,0.04)',
        border: '1px solid rgba(239,68,68,0.2)',
        borderTop: '3px solid var(--status-critical)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--status-critical)', marginBottom: 8 }}>
          Challenge #10 — Adverse Media
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 12, maxWidth: 820 }}>
          Which organizations receiving public funding are the subject of serious adverse media coverage?
          Enter an entity name or CRA Business Number and our AI will generate targeted investigative search queries
          for media databases, court records, and regulatory enforcement databases.
        </p>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          AI-powered adverse media risk assessment | Cross-references entity profile from our government spending database
        </div>
      </div>

      <MethodologyPanel />

      {/* Search form */}
      <div style={{
        marginBottom: 24, padding: '20px 24px',
        background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>
          Select an entity to assess
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Organization Name</label>
            <input
              type="text"
              placeholder="e.g. The Salvation Army"
              value={entityName}
              onChange={e => setEntityName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
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
              onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              style={{
                width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                padding: '10px 14px', fontSize: 13, outline: 'none', fontFamily: 'var(--font-mono)',
              }}
            />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={loading || (!entityName && !entityBn)}
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              borderRadius: 'var(--radius-md)', border: 'none',
              background: loading ? 'var(--bg-tertiary)' : 'var(--status-critical)',
              color: loading ? 'var(--text-muted)' : '#fff',
              opacity: (!entityName && !entityBn) ? 0.5 : 1,
            }}
          >
            {loading ? 'Analyzing...' : 'Run Adverse Media Check'}
          </button>
        </div>

        {suggestions.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Flagged entities:</span>
            {suggestions.map(s => (
              <button
                key={s.primary_bn || s.canonical_name}
                onClick={() => { setEntityName(s.canonical_name); setEntityBn((s.primary_bn || '').slice(0, 9)); }}
                style={{
                  padding: '4px 12px', fontSize: 11, cursor: 'pointer',
                  borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.06)', color: 'var(--text-secondary)',
                }}
              >
                {s.canonical_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 20, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', marginBottom: 24 }}>
          <div style={{ color: 'var(--status-critical)', fontSize: 13 }}>{error}</div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{
          padding: '24px 28px',
          background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Adverse Media Risk Assessment: {result.entity || result.bn}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {result.has_dossier ? 'Cross-referenced with government spending dossier' : 'Name-based analysis (no BN dossier available)'}
              </div>
            </div>
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

          {result.analysis ? (
            <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {result.analysis}
            </div>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
              AI analysis unavailable. Check that Anthropic API or AWS Bedrock credentials are configured.
            </div>
          )}

          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-primary)', paddingTop: 12 }}>
            Generated by Claude AI -- investigative queries should be validated against actual media databases and court records
          </div>
        </div>
      )}
    </div>
  );
}
