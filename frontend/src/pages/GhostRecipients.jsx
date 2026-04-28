import { useState, useEffect } from 'react';
import { fetchGhostRecipients, fmtDollars } from '../api';

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
        <span>How we detected this — Methodology</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{open ? '[ − ]' : '[ + ]'}</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Data source:</strong> Federal Proactive Disclosure dataset (1.27M records from 51+ departments, 2010–2024).
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Detection criteria:</strong> Recipients with cumulative grants of <strong>$500,000 or more</strong> who had
            no recorded grant activity for <strong>4 or more consecutive years</strong> following their last payment. Business numbers (9-digit CRA BN)
            were cross-referenced against the CRA charity registry — recipients without a matching BN are flagged as untraced.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Why it matters:</strong> Canada's Access to Information Act and the Proactive Disclosure regime require
            departments to publish grants over $25,000. When a recipient vanishes from all public records after receiving substantial public funding,
            there is no mechanism to verify how the money was spent or whether the organization still exists.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Limitations:</strong> Silence does not confirm fraud — organizations may have legitimately wound down.
            However, the absence of any public record (CRA filing, incorporation registry, federal grants) warrants audit-level scrutiny.
          </p>
        </div>
      )}
    </div>
  );
}

export default function GhostRecipients() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [bnFilter, setBnFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchGhostRecipients(500000, 200)
      .then(rows => setData(Array.isArray(rows) ? rows : []))
      .catch(err => setError(err?.message || 'Failed to load ghost recipient data'))
      .finally(() => setLoading(false));
  }, []);

  const provinces = [...new Set(data.map(r => r.recipient_province).filter(Boolean))].sort();

  const filtered = data.filter(r => {
    const matchSearch = !search
      || (r.recipient_legal_name || '').toLowerCase().includes(search.toLowerCase())
      || (r.bn9 || '').includes(search);
    const matchProvince = !provinceFilter || r.recipient_province === provinceFilter;
    const matchBn = !bnFilter || (bnFilter === 'untraced' ? r.no_bn : !r.no_bn);
    return matchSearch && matchProvince && matchBn;
  });

  const totalValue = data.reduce((s, r) => s + (r.total_received || 0), 0);
  const untracedCount = data.filter(r => r.no_bn).length;
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
          <strong style={{ color: 'var(--accent-amber)' }}>{fmtDollars(totalValue)}</strong> to organizations that subsequently
          disappeared from all public records. These are not bureaucratic oversights — they are entities that received substantial
          public funding and then ceased to exist in any verifiable form. No CRA filings. No incorporation records. No further
          federal activity. The money entered a void.
        </p>
        {!loading && data.length > 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 820 }}>
            Our analysis flagged <strong style={{ color: 'var(--accent-amber)' }}>{data.length.toLocaleString()} recipient–department combinations</strong>{' '}
            meeting the criteria: $500K+ in cumulative grants followed by {avgSilence}+ years of silence on average.{' '}
            <strong style={{ color: 'var(--status-critical)' }}>{untracedCount}</strong> of these have no traceable Business Number in the CRA registry.
          </p>
        )}
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 16 }}>
          {[
            { label: 'Total Funds at Risk', value: loading ? '...' : fmtDollars(totalValue), color: 'var(--accent-amber)' },
            { label: 'Ghost Recipients', value: loading ? '...' : data.length.toLocaleString(), color: 'var(--text-primary)' },
            { label: 'Untraced (No BN)', value: loading ? '...' : untracedCount.toLocaleString(), color: 'var(--status-critical)' },
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
            { key: 'untraced', label: 'Untraced BN' },
            { key: 'traced', label: 'Traced BN' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setBnFilter(opt.key)} style={{
              padding: '7px 14px', fontSize: 12, cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${bnFilter === opt.key ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
              background: bnFilter === opt.key ? 'rgba(251,191,36,0.15)' : 'var(--bg-tertiary)',
              color: bnFilter === opt.key ? 'var(--accent-amber)' : 'var(--text-secondary)',
            }}>{opt.label}</button>
          ))}
        </div>
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
                <th>Recipient</th>
                <th>Province</th>
                <th title="Total federal grants received across all departments">Total Received</th>
                <th title="Year of last recorded federal grant">Last Grant</th>
                <th title="Years elapsed since last federal grant with no public activity">Years Silent</th>
                <th title="Number of distinct grant disbursements"># Grants</th>
                <th title="Number of distinct federal departments that funded this recipient">Depts</th>
                <th title="Whether a valid 9-digit CRA Business Number was recorded">BN Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const silent = r.years_silent || 0;
                const silentColor = silent >= 8 ? 'var(--status-critical)' : silent >= 5 ? 'var(--status-medium)' : 'var(--text-secondary)';
                return (
                  <tr key={i}>
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
                    <td>
                      {r.no_bn
                        ? <span style={{ color: 'var(--status-critical)', fontWeight: 700, fontSize: 11, fontFamily: 'var(--font-mono)' }}>UNTRACED</span>
                        : <span style={{ color: 'var(--status-low)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>TRACED</span>}
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
