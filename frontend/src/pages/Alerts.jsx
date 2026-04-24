import { useState, useEffect } from 'react';
import { fetchAlerts, formatCurrency } from '../api';

const FLAG_META = {
  zombie: { icon: '🧟', label: 'Zombie Recipient', color: 'var(--status-critical)', bg: 'rgba(239,68,68,0.1)' },
  loop: { icon: '🔄', label: 'Funding Loop', color: 'var(--accent-purple)', bg: 'rgba(167,139,250,0.1)' },
  governance: { icon: '🕸️', label: 'Governance Risk', color: 'var(--accent-cyan)', bg: 'rgba(6,182,212,0.1)' },
  sole_source: { icon: '📋', label: 'Sole Source', color: 'var(--accent-amber)', bg: 'rgba(245,158,11,0.1)' },
  dependency: { icon: '⚠️', label: 'Gov Dependency', color: 'var(--accent-amber)', bg: 'rgba(245,158,11,0.1)' },
  concentration: { icon: '🎯', label: 'Concentration', color: 'var(--accent-indigo-light)', bg: 'rgba(99,102,241,0.1)' },
};

export default function Alerts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minFlags, setMinFlags] = useState(2);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchAlerts(minFlags, 20)
      .then(setData)
      .catch(console.error)
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
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none', fontSize: 13,
          }}>
            🔍
          </span>
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
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading cross-challenge alerts...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: '48px 24px', textAlign: 'center',
          background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚨</div>
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
                            {meta.icon} {meta.label}
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

                {/* Expanded detail section */}
                {isExpanded && (
                  <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${severityBorder}` }}>
                    <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Flag detail cards */}
                      {flags.map((flagKey, fi) => {
                        const meta = FLAG_META[flagKey] || FLAG_META.zombie;
                        return (
                          <div
                            key={flagKey}
                            style={{
                              padding: '14px 16px',
                              background: meta.bg,
                              border: `1px solid ${meta.color}30`,
                              borderRadius: 'var(--radius-md)',
                              borderLeft: `3px solid ${meta.color}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 16 }}>{meta.icon}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Detail footer */}
                    <div style={{
                      marginTop: 16, padding: '12px 14px',
                      background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
                      display: 'flex', flexWrap: 'wrap', gap: 16,
                      fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                    }}>
                      <span>BN: {alert.bn}</span>
                      {alert.govt_share_pct != null && (
                        <span>Govt share: {Number(alert.govt_share_pct).toFixed(1)}%</span>
                      )}
                      {alert.last_filing_year && (
                        <span>Last filing: {alert.last_filing_year}</span>
                      )}
                      <span>Total govt funding: {formatCurrency(govtFunding)}</span>
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
