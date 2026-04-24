import { useState, useEffect } from 'react';
import { fetchAlerts, formatCurrency } from '../api';

const FLAG_META = {
  zombie: { icon: '🧟', label: 'Zombie Recipient', color: 'var(--status-critical)', bg: 'rgba(239,68,68,0.08)' },
  loop: { icon: '🔄', label: 'Funding Loop', color: 'var(--accent-purple)', bg: 'rgba(167,139,250,0.08)' },
  governance: { icon: '🕸️', label: 'Governance Risk', color: 'var(--accent-cyan)', bg: 'rgba(34,211,238,0.08)' },
  sole_source: { icon: '📋', label: 'Contract Risk', color: 'var(--accent-amber)', bg: 'rgba(245,158,11,0.08)' },
  dependency: { icon: '⚠️', label: 'Gov Dependency', color: 'var(--accent-amber)', bg: 'rgba(245,158,11,0.08)' },
  concentration: { icon: '🎯', label: 'Concentration', color: 'var(--accent-indigo-light)', bg: 'rgba(99,102,241,0.08)' },
};

export default function Alerts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [minFlags, setMinFlags] = useState(2);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchAlerts(minFlags, 20)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [minFlags]);

  const alerts = data?.results || [];
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

      {/* Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Min Flags:
          <select
            value={minFlags}
            onChange={(e) => setMinFlags(Number(e.target.value))}
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
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {alerts.length} entities found
        </span>
      </div>

      {/* Alert Cards */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading cross-challenge alerts...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {alerts.map((alert, i) => {
            const isExpanded = expanded === i;
            const severityColor = alert.alarm_count >= 3 ? 'var(--status-critical)' : 'var(--accent-amber)';
            const severityBg = alert.alarm_count >= 3 ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)';
            const severityBorder = alert.alarm_count >= 3 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)';

            return (
              <div
                key={alert.id}
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
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {alert.flags.map((flag, fi) => {
                        const meta = FLAG_META[flag.type] || FLAG_META.zombie;
                        return (
                          <span
                            key={fi}
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
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Total Public $</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: severityColor, fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(alert.total_public_funding)}
                    </div>
                    {alert.addresses?.[0] && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {alert.addresses[0].city}, {alert.addresses[0].province}
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: 14, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', color: 'var(--text-muted)', flexShrink: 0 }}>
                    ▼
                  </span>
                </div>

                {/* Expanded: individual flag details */}
                {isExpanded && (
                  <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${severityBorder}` }}>
                    <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {alert.flags.map((flag, fi) => {
                        const meta = FLAG_META[flag.type] || FLAG_META.zombie;
                        const sev = flag.severity;
                        const sevColor = sev === 'critical' ? 'var(--status-critical)' : sev === 'high' ? 'var(--accent-amber)' : 'var(--accent-indigo-light)';
                        return (
                          <div
                            key={fi}
                            style={{
                              padding: '14px 16px',
                              background: meta.bg,
                              border: `1px solid ${meta.color}30`,
                              borderRadius: 'var(--radius-md)',
                              borderLeft: `3px solid ${meta.color}`,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 16 }}>{meta.icon}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: meta.color }}>{flag.label}</span>
                              <span className={`badge ${sev}`} style={{ marginLeft: 'auto', fontSize: 10 }}>
                                {sev}
                              </span>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              {flag.detail}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      BN: {alert.bn_root} · Entity ID: {alert.entity_id}
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
