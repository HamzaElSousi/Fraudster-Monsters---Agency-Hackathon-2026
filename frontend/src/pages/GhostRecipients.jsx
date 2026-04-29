import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
        <span>How we detected this — Challenge #2 Ghost Capacity</span>
        <span style={{ fontSize: 11, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Data sources:</strong> CRA T3010 annual filings (compensation schedule + financial data) cross-referenced with
            government funding dependency from govt_funding_by_charity.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Detection criteria:</strong> Organizations that (1) are still actively filing with CRA (not zombies),
            (2) receive <strong>80%+ of revenue from government</strong>, (3) have cumulative govt funding of <strong>$500K+</strong>, and
            (4) report <strong>3 or fewer employees</strong> across all CRA T3010 compensation filings.
          </p>
          <p style={{ marginBottom: 10 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Why it matters:</strong> Ghost Capacity organizations persist indefinitely. They are not zombies — zombies die.
            These entities continue receiving public money year after year but show no evidence of actually delivering services.
            Revenue flows almost entirely from government, and expenditures are primarily compensation for a very small number of individuals
            or further transfers to other entities.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Risk tiers:</strong>{' '}
            <strong style={{ color: 'var(--status-critical)' }}>Critical</strong> = 0 employees + 95%+ govt dependency |{' '}
            <strong style={{ color: '#f59e0b' }}>High</strong> = 0-1 employees + 90%+ |{' '}
            <strong style={{ color: 'var(--status-medium)' }}>Medium</strong> = 2-3 employees + 80%+
          </p>
        </div>
      )}
    </div>
  );
}

const riskColors = {
  critical: 'var(--status-critical)',
  high: '#f59e0b',
  medium: 'var(--status-medium)',
  low: 'var(--text-muted)',
};

export default function GhostRecipients() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchGhostRecipients(500000, 200)
      .then(rows => setData(Array.isArray(rows) ? rows : []))
      .catch(err => setError(err?.message || 'Failed to load ghost capacity data'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data.filter(r => {
    const matchSearch = !search
      || (r.legal_name || '').toLowerCase().includes(search.toLowerCase())
      || (r.bn || '').includes(search);
    const matchRisk = !riskFilter || r.ghost_risk === riskFilter;
    return matchSearch && matchRisk;
  });

  const totalGovt = data.reduce((s, r) => s + (r.total_govt_funding || 0), 0);
  const criticalCount = data.filter(r => r.ghost_risk === 'critical').length;
  const highCount = data.filter(r => r.ghost_risk === 'high').length;
  const zeroEmpCount = data.filter(r => r.max_employees === 0).length;

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
          Challenge #2 — Ghost Capacity
        </div>
        <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 12, maxWidth: 820 }}>
          These organizations are not dead — they are hollow. They continue filing with CRA, continue receiving government money,
          but report <strong style={{ color: 'var(--accent-amber)' }}>zero to three employees</strong> while drawing{' '}
          <strong style={{ color: 'var(--accent-amber)' }}>80%+ of their revenue from government</strong>.
          Where does the money go? Mostly to compensation for a tiny number of individuals or onward transfers to other entities.
        </p>
        {!loading && data.length > 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 820 }}>
            We found <strong style={{ color: 'var(--accent-amber)' }}>{data.length.toLocaleString()} ghost capacity organizations</strong> receiving{' '}
            <strong style={{ color: 'var(--accent-amber)' }}>{fmtDollars(totalGovt)}</strong> in total government funding.{' '}
            <strong style={{ color: 'var(--status-critical)' }}>{zeroEmpCount}</strong> report zero employees across all filings.
          </p>
        )}
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 16 }}>
          {[
            { label: 'Govt Funding at Risk', value: loading ? '...' : fmtDollars(totalGovt), color: 'var(--accent-amber)' },
            { label: 'Ghost Orgs', value: loading ? '...' : data.length.toLocaleString(), color: 'var(--text-primary)' },
            { label: 'Critical Risk', value: loading ? '...' : criticalCount.toLocaleString(), color: 'var(--status-critical)' },
            { label: 'High Risk', value: loading ? '...' : highCount.toLocaleString(), color: '#f59e0b' },
            { label: 'Zero Employees', value: loading ? '...' : zeroEmpCount.toLocaleString(), color: 'var(--status-critical)' },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{stat.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: stat.color, fontFamily: 'var(--font-mono)' }}>{stat.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          Source: CRA T3010 Compensation + Financial Data | Cross-referenced with govt_funding_by_charity
        </div>
      </div>

      <MethodologyPanel />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search organization or BN..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
            padding: '8px 14px', fontSize: 13, outline: 'none', width: 260,
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: '', label: 'All' },
            { key: 'critical', label: 'Critical' },
            { key: 'high', label: 'High' },
            { key: 'medium', label: 'Medium' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setRiskFilter(opt.key)} style={{
              padding: '7px 14px', fontSize: 12, cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${riskFilter === opt.key ? 'var(--accent-amber)' : 'var(--border-primary)'}`,
              background: riskFilter === opt.key ? 'rgba(251,191,36,0.15)' : 'var(--bg-tertiary)',
              color: riskFilter === opt.key ? 'var(--accent-amber)' : 'var(--text-secondary)',
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
          <span className="data-table-title">Ghost Capacity Organizations ({filtered.length})</span>
        </div>
        {error ? (
          <div style={{ padding: 32, textAlign: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', margin: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--status-critical)' }}>Data Load Failed</div>
            <div style={{ color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>{error}</div>
          </div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading ghost capacity analysis...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No results match your current filters.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Organization</th>
                <th title="Ghost capacity risk level based on employee count and govt dependency">Risk</th>
                <th title="Total government funding received across all years">Govt Funding</th>
                <th title="Percentage of revenue from government sources">Govt %</th>
                <th title="Maximum number of permanent employees reported across all CRA filings">Max Employees</th>
                <th title="Total compensation paid across all filing years">Total Compensation</th>
                <th title="Most recent CRA filing year">Last Filing</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.legal_name || '--'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {r.bn || '--'}{r.designation ? ` | ${r.designation}` : ''}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${r.ghost_risk === 'critical' ? 'critical' : r.ghost_risk}`}
                      style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>
                      {r.ghost_risk}
                    </span>
                  </td>
                  <td>
                    <span className="funding-amount large">{fmtDollars(r.total_govt_funding)}</span>
                  </td>
                  <td style={{ fontWeight: 700, color: r.govt_share_pct >= 95 ? 'var(--status-critical)' : r.govt_share_pct >= 90 ? '#f59e0b' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {r.govt_share_pct?.toFixed(1)}%
                  </td>
                  <td style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: 16, color: r.max_employees === 0 ? 'var(--status-critical)' : 'var(--text-secondary)', textAlign: 'center' }}>
                    {r.max_employees}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {r.total_compensation > 0 ? fmtDollars(r.total_compensation) : '--'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {r.last_year || '--'}
                  </td>
                  <td>
                    {r.bn && r.bn.length >= 9 && (
                      <button
                        onClick={() => navigate(`/entity/${encodeURIComponent(r.bn)}`)}
                        style={{
                          padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                          borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)',
                          background: 'var(--bg-tertiary)', color: 'var(--accent-indigo-light)',
                        }}
                      >
                        Investigate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
