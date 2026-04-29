// @ts-nocheck
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skull, Repeat2, Network, FileSearch, AlertTriangle, Target, ShieldAlert, Search } from 'lucide-react';
import { fetchAlerts, formatCurrency } from '../api';

function buildNarrative(alert) {
  const name = alert.canonical_name || 'This organization';
  const amt = formatCurrency(parseFloat(alert.total_govt_funding) || 0);
  const pct = parseFloat(alert.govt_share_pct) || 0;
  const year = alert.last_filing_year || 'an unknown year';
  const flags = Array.isArray(alert.flags) ? alert.flags : [];
  const sentences = [];
  sentences.push(`${name} received ${amt} in tracked government funding, with ${pct.toFixed(1)}% of revenue from public sources.`);
  if (flags.includes('zombie')) sentences.push(`Despite this dependency, the organization stopped filing tax returns after ${year} — meaning it may no longer exist.`);
  if (flags.includes('loop')) sentences.push(`Government money passed through this organization in circular funding loops — the same dollars may have generated multiple charitable tax receipts.`);
  if (flags.includes('governance')) sentences.push(`Directors of this charity simultaneously sit on boards of other government-funded charities, creating a concentrated governance network.`);
  return sentences.join(' ');
}

const FLAG_META = {
  zombie:        { Icon: Skull,          label: 'Zombie Recipient', color: 'var(--status-critical)', bg: 'rgba(239,68,68,0.1)' },
  loop:          { Icon: Repeat2,        label: 'Funding Loop',     color: 'var(--accent-purple)',   bg: 'rgba(167,139,250,0.1)' },
  governance:    { Icon: Network,        label: 'Governance Risk',  color: 'var(--accent-cyan)',     bg: 'rgba(6,182,212,0.1)' },
  sole_source:   { Icon: FileSearch,     label: 'Sole Source',      color: 'var(--accent-amber)',    bg: 'rgba(245,158,11,0.1)' },
  dependency:    { Icon: AlertTriangle,  label: 'Gov Dependency',   color: 'var(--accent-amber)',    bg: 'rgba(245,158,11,0.1)' },
  concentration: { Icon: Target,         label: 'Concentration',    color: 'var(--accent-indigo-light)', bg: 'rgba(99,102,241,0.1)' },
};

export default function Alerts() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [minFlags, setMinFlags] = useState(2);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetchAlerts(minFlags, 20)
      .then(setData)
      .catch(err => setLoadError(err?.message || 'Failed to load alerts'))
      .finally(() => setLoading(false));
  }, [minFlags]);

  const alerts = data?.results || [];

  const filtered = alerts.filter(a =>
    !search || (a.canonical_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const critical = alerts.filter(a => a.alarm_count >= 3).length;
  const high = alerts.filter(a => a.alarm_count === 2).length;

  return (
    <div className="animate-in">
      {/* Header */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 24,
        padding: '20px 24px',
        background: 'rgba(239, 68, 68, 0.06)',
        border: '1px solid rgba(239, 68, 68, 0.15)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--status-critical)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Multi-Flag Alerts — Cross-Challenge Intersections
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Entities flagged across multiple challenge categories simultaneously.
            These represent the <strong style={{ color: 'var(--status-critical)' }}>highest-priority</strong> accountability
            failures — organizations where zombie status, funding loops, and governance risks converge.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Critical (3+ flags)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--status-critical)' }}>{critical}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>High (2 flags)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-amber)' }}>{high}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Min Flags:
          <select
            value={minFlags}
            onChange={(e) => { setMinFlags(Number(e.target.value)); setExpanded(null); }}
            style={{
              marginLeft: 8, padding: '6px 12px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
              fontSize: 13, outline: 'none',
            }}
          >
            <option value={2}>2+ flags</option>
            <option value={3}>3+ flags (critical only)</option>
          </select>
        </label>

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search organization..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setExpanded(null); }}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              padding: '8px 12px 8px 36px',
              fontSize: 13,
              outline: 'none',
              width: 220,
            }}
          />
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Showing {filtered.length} of {alerts.length} alerts
        </span>
      </div>

      {/* Alert Cards */}
      {loadError ? (
        <div style={{ padding: 32, textAlign: 'center', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-lg)', marginBottom: 16 }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>Alerts Failed to Load</div>
          <div style={{ color: 'var(--status-critical)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>{loadError}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Check backend at <code>http://localhost:8000/api/alerts</code></div>
        </div>
      ) : loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading cross-challenge alerts...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <ShieldAlert size={40} style={{ marginBottom: 12, color: 'var(--text-muted)' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
            No multi-flag alerts found
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Try reducing the minimum flags filter.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map((alert, i) => {
            const isExpanded = expanded === i;
            const severityColor = alert.alarm_count >= 3 ? 'var(--status-critical)' : 'var(--accent-amber)';
            const severityBg = alert.alarm_count >= 3 ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)';
            const severityBorder = alert.alarm_count >= 3 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)';

            // flags is an array of plain strings e.g. ["zombie", "loop"]
            const flags = Array.isArray(alert.flags) ? alert.flags : [];

            const govtFunding = typeof alert.total_govt_funding === 'number'
              ? alert.total_govt_funding
              : parseFloat(alert.total_govt_funding || 0);

            return (
              <div
                key={alert.bn || i}
                style={{
                  background: isExpanded ? severityBg : 'var(--bg-card)',
                  border: `1px solid ${isExpanded ? severityBorder : 'var(--border-primary)'}`,
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                  animation: `fadeInUp 0.4s ease-out ${i * 80}ms both`,
                }}
              >
                {/* Card Header */}
                <div
                  style={{ padding: '18px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}
                  onClick={() => setExpanded(isExpanded ? null : i)}
                >
                  {/* Alarm count badge */}
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                    background: severityBg,
                    border: `2px solid ${severityColor}`,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: severityColor, lineHeight: 1 }}>
                      {alert.alarm_count}
                    </div>
                    <div style={{ fontSize: 9, color: severityColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      flags
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                      {alert.canonical_name}
                    </div>
                    {/* Flag pills from plain string array */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {flags.map((flagKey, fi) => {
                        const meta = FLAG_META[flagKey] || FLAG_META.zombie;
                        return (
                          <span
                            key={flagKey}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px',
                              background: meta.bg,
                              border: `1px solid ${meta.color}40`,
                              borderRadius: 99,
                              fontSize: 11, color: meta.color, fontWeight: 600,
                            }}
                          >
                            <meta.Icon size={11} /> {meta.label}
                          </span>
                        );
                      })}
                    </div>
                    {/* Risk summary */}
                    {alert.risk_summary && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                        {alert.risk_summary}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Total Govt $</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: severityColor, fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(govtFunding)}
                    </div>
                    {alert.govt_share_pct != null && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Govt revenue: {Number(alert.govt_share_pct).toFixed(1)}%
                      </div>
                    )}
                    {alert.last_filing_year && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        Last filed: {alert.last_filing_year}
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: 14, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', color: 'var(--text-muted)', flexShrink: 0 }}>
                    ▼
                  </span>
                </div>

                {/* Narrative — always visible */}
                <div style={{ padding: '0 24px 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {buildNarrative(alert)}
                </div>

                {/* Expanded detail section */}
                {isExpanded && (
                  <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${severityBorder}` }}>
                    <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {flags.map((flagKey) => {
                        const meta = FLAG_META[flagKey] || FLAG_META.zombie;
                        return (
                          <div key={flagKey} style={{ padding: '14px 16px', background: meta.bg, border: `1px solid ${meta.color}30`, borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${meta.color}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <meta.Icon size={16} style={{ color: meta.color }} />
                              <span style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      <span>BN: {alert.bn}</span>
                      {alert.govt_share_pct != null && <span>Govt share: {Number(alert.govt_share_pct).toFixed(1)}%</span>}
                      {alert.last_filing_year && <span>Last filing: {alert.last_filing_year}</span>}
                      <span>Total govt funding: {formatCurrency(govtFunding)}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-sans)', fontSize: 11 }}>Source: CRA T3010</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/entity/${alert.bn}`); }}
                        style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)', background: severityColor, color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                      >
                        Investigate →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
