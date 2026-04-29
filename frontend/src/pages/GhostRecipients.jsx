import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchGhostRecipients, fmtDollars } from '../api';

const CRA_STATUS_META = {
  cra_inactive: { label: 'CRA INACTIVE', color: 'var(--status-critical)', bg: 'rgba(239,68,68,0.1)' },
  not_in_cra:   { label: 'NOT IN CRA',   color: 'var(--accent-amber)',    bg: 'rgba(251,191,36,0.1)' },
  no_bn:        { label: 'NO BN',         color: 'var(--text-muted)',      bg: 'rgba(148,163,184,0.1)' },
  cra_active:   { label: 'CRA ACTIVE',    color: 'var(--status-low)',      bg: 'rgba(34,197,94,0.08)' },
};

function SuspicionBadge({ score }) {
  const color = score >= 70 ? 'var(--status-critical)' : score >= 40 ? 'var(--status-medium)' : 'var(--text-secondary)';
  const bg = score >= 70 ? 'rgba(239,68,68,0.12)' : score >= 40 ? 'rgba(234,179,8,0.1)' : 'rgba(148,163,184,0.08)';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--radius-sm)',
      fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 13,
      color, background: bg, border: `1px solid ${color}30`,
    }}>
      {score}
    </span>
  );
}

function CraStatusBadge({ status }) {
  const meta = CRA_STATUS_META[status] || CRA_STATUS_META.no_bn;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
      padding: '2px 6px', borderRadius: 'var(--radius-sm)',
      color: meta.color, background: meta.bg, border: `1px solid ${meta.color}30`,
    }}>
      {meta.label}
    </span>
  );
}

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
        <span>How we detected this — Challenge #2 Ghost Recipients</span>
        <span style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Data source:</strong> Federal Proactive Disclosure dataset (1.27M records from 51+ departments, 2010–2024),
            cross-referenced with CRA T3010 charity registry filing history.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Detection criteria:</strong> Recipients with <strong>2 or more grants</strong> totaling
            <strong> $500,000+</strong> who had no recorded grant activity for <strong>4+ consecutive years</strong>.
            The minimum grant count requirement filters out one-time project funding and surfaces recipients with an established pattern that suddenly stopped.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>CRA cross-reference:</strong> Each recipient's Business Number is checked against CRA T3010 filing records.
            Organizations that stopped filing with CRA ("CRA Inactive") or have no CRA record at all ("Not in CRA") receive higher suspicion scores.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Suspicion score (0–100):</strong> Weighted composite of years silent (max 35), funding magnitude (max 25),
            grant pattern depth (max 20), and CRA filing status (max 20). Higher scores indicate stronger investigative leads.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Limitations:</strong> Silence does not confirm fraud — organizations may have legitimately wound down.
            However, the combination of sustained public funding followed by disappearance from all public registries warrants audit-level scrutiny.
          </p>
        </div>
      )}
    </div>
  );
}

export default function GhostRecipients() {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [craFilter, setCraFilter] = useState('');
  const [sortBy, setSortBy] = useState('suspicion_score');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchGhostRecipients(500000, 200)
      .then(rows => setData(Array.isArray(rows) ? rows : []))
      .catch(err => setError(err?.message || 'Failed to load ghost recipient data'))
      .finally(() => setLoading(false));
  }, []);

  const provinces = [...new Set(data.map(r => r.recipient_province).filter(Boolean))].sort();

  const filtered = useMemo(() => {
    let rows = data.filter(r => {
      const matchSearch = !search
        || (r.recipient_legal_name || '').toLowerCase().includes(search.toLowerCase())
        || (r.bn9 || '').includes(search);
      const matchProvince = !provinceFilter || r.recipient_province === provinceFilter;
      const matchCra = !craFilter || r.cra_status === craFilter;
      return matchSearch && matchProvince && matchCra;
    });
    rows.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
    return rows;
  }, [data, search, provinceFilter, craFilter, sortBy]);

  const totalValue = data.reduce((s, r) => s + (r.total_received || 0), 0);
  const highSuspicion = data.filter(r => (r.suspicion_score || 0) >= 70).length;
  const craInactive = data.filter(r => r.cra_status === 'cra_inactive' || r.cra_status === 'not_in_cra').length;
  const avgSilence = data.length > 0
    ? Math.round(data.reduce((s, r) => s + (r.years_silent || 0), 0) / data.length)
    : 0;

  return (
    <div className="animate-in">

      {/* Investigative header */}
      <div style={{
        marginBottom: 24, padding: '24px 28px',
        background: 'rgba(251,191,36,0.04)',
        border: '1px solid rgba(251,191,36,0.2)',
        borderTop: '3px solid var(--accent-amber)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-amber)', marginBottom: 8 }}>
          Challenge #2 — Ghost Recipients
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 12, maxWidth: 820 }}>
          Between 2010 and 2024, the federal government sent over{' '}
          <strong style={{ color: 'var(--accent-amber)' }}>{fmtDollars(totalValue)}</strong> to organizations that received
          multiple grants and then disappeared from all public records. These are entities with an established funding pattern
          that suddenly ceased — no CRA filings, no further federal activity.
        </p>
        {!loading && data.length > 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 820 }}>
            Our analysis flagged <strong style={{ color: 'var(--accent-amber)' }}>{data.length.toLocaleString()} recipients</strong>{' '}
            meeting the criteria: 2+ grants totaling $500K+ followed by {avgSilence}+ years of silence on average.{' '}
            <strong style={{ color: 'var(--status-critical)' }}>{highSuspicion}</strong> scored 70+ on our suspicion index, and{' '}
            <strong style={{ color: 'var(--status-critical)' }}>{craInactive}</strong> have no active CRA filing record.
          </p>
        )}
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 16 }}>
          {[
            { label: 'Total Funds at Risk', value: loading ? '...' : fmtDollars(totalValue), color: 'var(--accent-amber)' },
            { label: 'Ghost Recipients', value: loading ? '...' : data.length.toLocaleString(), color: 'var(--text-primary)' },
            { label: 'High Suspicion (70+)', value: loading ? '...' : highSuspicion.toLocaleString(), color: 'var(--status-critical)' },
            { label: 'CRA Inactive/Missing', value: loading ? '...' : craInactive.toLocaleString(), color: 'var(--status-critical)' },
            { label: 'Avg Years Silent', value: loading ? '...' : `${avgSilence}y`, color: 'var(--text-secondary)' },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{stat.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.color, fontFamily: 'var(--font-mono)' }}>{stat.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          Source: Federal Proactive Disclosure (51+ departments) · Grants 2010–2024 · Cross-referenced with CRA T3010 registry
        </div>
      </div>

      <MethodologyPanel />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search recipient or BN..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
            padding: '8px 14px', fontSize: 13, outline: 'none', width: 260,
          }}
        />
        <select
          value={provinceFilter}
          onChange={e => setProvinceFilter(e.target.value)}
          style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)', color: provinceFilter ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: '8px 12px', fontSize: 13, outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="">All Provinces</option>
          {provinces.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: '', label: 'All' },
            { key: 'cra_inactive', label: 'CRA Inactive' },
            { key: 'not_in_cra', label: 'Not in CRA' },
            { key: 'no_bn', label: 'No BN' },
            { key: 'cra_active', label: 'CRA Active' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setCraFilter(opt.key)} style={{
              padding: '7px 14px', fontSize: 12, cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${craFilter === opt.key ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
              background: craFilter === opt.key ? 'rgba(251,191,36,0.15)' : 'var(--bg-tertiary)',
              color: craFilter === opt.key ? 'var(--accent-amber)' : 'var(--text-secondary)',
            }}>{opt.label}</button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
            padding: '8px 12px', fontSize: 13, outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="suspicion_score">Sort: Suspicion Score</option>
          <option value="total_received">Sort: Total Received</option>
          <option value="years_silent">Sort: Years Silent</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length.toLocaleString()} results
        </span>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <div className="data-table-header">
          <span className="data-table-title">Ghost Recipients — Federal Grant Vanishing Act ({filtered.length})</span>
          {data.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--accent-amber)', fontWeight: 600 }}>
              {data.length} recipients · {fmtDollars(totalValue)} total
            </span>
          )}
        </div>
        {error ? (
          <div style={{ padding: 32, textAlign: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', margin: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--status-critical)' }}>Data Load Failed</div>
            <div style={{ color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>{error}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Check backend at <code>http://localhost:8000/api/ghost-recipients</code></div>
          </div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading ghost recipient analysis...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No results match your current filters.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th title="Suspicion score 0-100 based on silence, funding, pattern, CRA status">Score</th>
                <th>Recipient</th>
                <th>Province</th>
                <th title="Total federal grants received across all departments">Total Received</th>
                <th title="Year of last recorded federal grant">Last Grant</th>
                <th title="Years elapsed since last federal grant">Years Silent</th>
                <th title="Number of distinct grant disbursements"># Grants</th>
                <th title="Number of distinct federal departments that funded this recipient">Depts</th>
                <th title="CRA filing status cross-reference">CRA Status</th>
                <th title="Last year the organization filed with CRA">CRA Last Filed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const silent = r.years_silent || 0;
                const silentColor = silent >= 8 ? 'var(--status-critical)' : silent >= 5 ? 'var(--status-medium)' : 'var(--text-secondary)';
                return (
                  <tr key={i} onClick={() => r.bn9 && r.bn9.length >= 9 && navigate(`/entity/${encodeURIComponent(r.bn9)}`)} style={{ cursor: r.bn9 && r.bn9.length >= 9 ? 'pointer' : 'default' }}>
                    <td><SuspicionBadge score={r.suspicion_score || 0} /></td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.recipient_legal_name || '—'}</div>
                      {r.bn9 && r.bn9.length >= 9 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{r.bn9}</div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.recipient_province || '—'}</td>
                    <td>
                      <span className="funding-amount large">{fmtDollars(r.total_received)}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {r.last_grant ? r.last_grant.slice(0, 4) : '—'}
                    </td>
                    <td>
                      <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 14, color: silentColor }}>
                        {silent > 0 ? `${silent}y` : '—'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {r.grant_count?.toLocaleString() || '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {r.dept_count || '—'}
                    </td>
                    <td><CraStatusBadge status={r.cra_status} /></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      {r.cra_last_filing > 0 ? r.cra_last_filing : '—'}
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
