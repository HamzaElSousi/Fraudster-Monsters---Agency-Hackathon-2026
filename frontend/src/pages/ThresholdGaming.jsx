import { useState, useEffect } from 'react';
import { fetchThresholdGaming, formatCurrency } from '../api';

function MethodologyPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 20, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '12px 20px', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
        <span>How we detected this — Challenge #9 Threshold Gaming</span>
        <span style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', borderTop: '1px solid var(--border-primary)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Data source:</strong> Federal Proactive Disclosure — 1,275,521 grants and contributions records from 51+ federal departments (<code>fed__grants_contributions</code>).</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Thresholds monitored:</strong> <strong>$25,000</strong>, <strong>$100,000</strong>, and <strong>$1,000,000</strong> — the three levels at which federal departments must proactively disclose grants to the public. Awards above these thresholds are reported individually; below them, they may be batched or omitted.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Detection window:</strong> We flag grants whose value falls between 85% and 99.9% of a threshold — the zone where a recipient or program officer could have stayed just below a reporting requirement. A minimum of 3 such grants for the same recipient–department pair is required before flagging, to eliminate coincidence.</div>
          <div style={{ marginBottom: 10 }}><strong style={{ color: 'var(--text-primary)' }}>Connection to financial crime:</strong> "Structuring" — deliberately splitting or sizing transactions to stay below a reporting threshold — is a recognized financial crime pattern (Proceeds of Crime Act, FINTRAC). This analysis applies the same detection logic to government grant data to surface similar patterns.</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}><strong>Limitations:</strong> Program officers and recipients often cannot control grant amounts, which are set by program rules. Some clustering in the 85–99.9% band is coincidental or reflects standard program grant sizes. Flags are statistical indicators, not evidence of intent. The analysis does not distinguish between recurring grants from multi-year programs and individual awards.</div>
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

function riskBadge(count) {
  if (count >= 10) return { label: ' High', color: 'var(--status-critical)', bg: 'rgba(239,68,68,0.12)' };
  if (count >= 5)  return { label: ' Medium', color: 'var(--status-medium)', bg: 'rgba(234,179,8,0.12)' };
  return { label: 'LOW', color: 'var(--text-muted)', bg: 'var(--bg-tertiary)' };
}

function fmtThreshold(t) {
  if (t >= 1e6) return '$1M';
  if (t >= 1e5) return '$100K';
  return '$25K';
}

export default function ThresholdGaming() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [thresholdFilter, setThresholdFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchThresholdGaming(200)
      .then(rows => setData(Array.isArray(rows) ? rows : []))
      .catch(err => setError(err?.message || 'Failed to load threshold gaming data'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data.filter(r => {
    const matchSearch = !search
      || (r.recipient_legal_name || '').toLowerCase().includes(search.toLowerCase())
      || (r.department || '').toLowerCase().includes(search.toLowerCase());
    const matchThreshold = !thresholdFilter || String(r.threshold) === thresholdFilter;
    return matchSearch && matchThreshold;
  });

  const totalRecipients = new Set(data.map(r => r.recipient_legal_name)).size;
  const totalValue = data.reduce((s, r) => s + (r.total_value || 0), 0);
  const thresholdCounts = { '25000': 0, '100000': 0, '1000000': 0 };
  data.forEach(r => { if (thresholdCounts[String(r.threshold)] != null) thresholdCounts[String(r.threshold)]++; });
  const mostGamed = Object.entries(thresholdCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="animate-in">
      {/* Investigative Narrative Header */}
      <div style={{
        marginBottom: 24,
        padding: '24px 28px',
        background: 'rgba(99,102,241,0.05)',
        border: '1px solid rgba(99,102,241,0.2)',
        borderTop: '3px solid var(--accent-indigo)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: 12, color: 'var(--accent-indigo-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          The Threshold Game — Challenge #9
        </div>
        <div style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 12 }}>
          Federal grants trigger proactive disclosure requirements at <strong>$25K</strong>, <strong>$100K</strong>, and <strong>$1M</strong>.
          When recipients repeatedly receive grants clustered just <em>below</em> these thresholds, it may signal deliberate structuring
          to avoid scrutiny — the same tactic used in financial crime known as "structuring."
          {data.length > 0 && (
            <> Our analysis flagged <strong style={{ color: 'var(--status-critical)' }}>{data.length.toLocaleString()} recipient–department–threshold combinations</strong> with
            3+ grants concentrated in the 85–99.9% band just below a threshold.</>
          )}
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Flagged Recipients', value: loading ? '…' : totalRecipients.toLocaleString(), color: 'var(--accent-indigo-light)' },
            { label: 'Total Value', value: loading ? '…' : fmtDollars(totalValue), color: 'var(--status-critical)' },
            { label: 'Most-Gamed Threshold', value: loading ? '…' : (mostGamed ? fmtThreshold(Number(mostGamed[0])) : '—'), color: 'var(--status-medium)' },
            { label: 'Combinations Found', value: loading ? '…' : data.length.toLocaleString(), color: 'var(--text-primary)' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          Source: Federal Proactive Disclosure · 1.27M grant records · Grants between 85%–99.9% of threshold with 3+ occurrences
        </div>
      </div>

      <MethodologyPanel />

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: '', label: 'All Thresholds' },
            { key: '25000', label: '$25K' },
            { key: '100000', label: '$100K' },
            { key: '1000000', label: '$1M' },
          ].map(opt => (
            <button
              key={opt.key}
              onClick={() => setThresholdFilter(opt.key)}
              style={{
                padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${thresholdFilter === opt.key ? 'var(--accent-indigo)' : 'var(--border-primary)'}`,
                background: thresholdFilter === opt.key ? 'var(--accent-indigo)' : 'var(--bg-tertiary)',
                color: thresholdFilter === opt.key ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {opt.label}
              {opt.key && thresholdCounts[opt.key] != null
                ? ` (${thresholdCounts[opt.key]})`
                : ''}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}></span>
          <input
            type="text"
            placeholder="Search recipient or department..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
              padding: '8px 12px 8px 36px', fontSize: 13, outline: 'none', width: 260,
            }}
          />
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length.toLocaleString()} results
        </span>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <div className="data-table-header">
          <span className="data-table-title">Threshold Gaming Detections ({filtered.length})</span>
        </div>
        {error ? (
          <div style={{ padding: 32, textAlign: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', margin: 16 }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>Data Load Failed</div>
            <div style={{ color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>{error}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Check that the backend is running at <code>http://localhost:8000/api/threshold-gaming</code></div>
          </div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Analyzing 1.27M federal grants for threshold patterns…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>No results match current filters.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Province</th>
                <th>Department</th>
                <th title="Accountability disclosure threshold being gamed">Threshold</th>
                <th title="Number of grants just below the threshold (85–99.9%)">Grants Below</th>
                <th title="Average grant value and % of threshold">Avg Value</th>
                <th>Total Value</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const badge = riskBadge(r.grants_just_below || 0);
                const pct = r.pct_of_threshold || 0;
                return (
                  <tr key={i}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.recipient_legal_name || '—'}</div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.recipient_province || '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.department}>{r.department || '—'}</td>
                    <td>
                      <span style={{
                        padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                        background: 'rgba(99,102,241,0.15)', color: 'var(--accent-indigo-light)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {fmtThreshold(r.threshold || 0)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 800, fontSize: 16, color: badge.color, fontFamily: 'var(--font-mono)' }}>
                        {r.grants_just_below}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13 }}>{fmtDollars(r.avg_value)}</div>
                      <div style={{ fontSize: 10, color: pct >= 95 ? 'var(--status-critical)' : 'var(--text-muted)', marginTop: 2 }}>
                        {pct.toFixed(1)}% of threshold
                      </div>
                    </td>
                    <td>
                      <span className="funding-amount medium-val">{fmtDollars(r.total_value)}</span>
                    </td>
                    <td>
                      <span style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color, border: `1px solid ${badge.color}40` }}>
                        {badge.label}
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
