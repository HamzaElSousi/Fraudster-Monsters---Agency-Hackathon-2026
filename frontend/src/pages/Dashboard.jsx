import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStats, fetchDashboardFeatured, formatCurrency, formatNumber, fmtDollars } from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [featured, setFeatured] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch((err) => {
        console.error('Stats error:', err);
        setError('Backend unavailable — start the server with bash start.sh');
      })
      .finally(() => setLoading(false));

    fetchDashboardFeatured()
      .then(d => setFeatured(Array.isArray(d) ? d : (d.results || [])))
      .catch(() => {});
  }, []);

  if (error) {
    return (
      <div style={{ padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--status-critical)', marginBottom: 8 }}>
          Backend Unavailable
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="stats-grid">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="stat-card">
            <div className="loading-shimmer" style={{ height: 20, width: '60%', marginBottom: 12 }} />
            <div className="loading-shimmer" style={{ height: 36, width: '80%', marginBottom: 8 }} />
            <div className="loading-shimmer" style={{ height: 14, width: '50%' }} />
          </div>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      icon: '🏛️', color: 'indigo', label: 'Tracked Entities',
      value: formatNumber(stats?.total_entities),
      subtitle: 'Canonical organizations across all datasets',
    },
    {
      icon: '🧟', color: 'rose', label: 'Zombie Recipients',
      value: formatNumber(stats?.zombie_count),
      subtitle: 'Funded then dissolved/revoked',
      onClick: () => navigate('/zombies'),
    },
    {
      icon: '🔄', color: 'purple', label: 'Funding Loops',
      value: formatNumber(stats?.total_funding_loops),
      subtitle: 'Circular gift patterns detected',
      onClick: () => navigate('/loops'),
    },
    {
      icon: '🕸️', color: 'cyan', label: 'Multi-Board Directors',
      value: formatNumber(stats?.multi_board_directors),
      subtitle: 'Directors on 3+ funded charity boards',
      onClick: () => navigate('/governance'),
    },
    {
      icon: '🇨🇦', color: 'emerald', label: 'Federal Grants',
      value: formatNumber(stats?.total_fed_grants),
      subtitle: 'Records from 51+ departments',
    },
    {
      icon: '🏔️', color: 'amber', label: 'Alberta Records',
      value: formatNumber(stats?.total_ab_grants),
      subtitle: 'Grant payments tracked',
    },
    {
      icon: '📋', color: 'indigo', label: 'Charities',
      value: formatNumber(stats?.total_charities),
      subtitle: 'Registered Canadian charities',
    },
    {
      icon: '⚠️', color: 'rose', label: 'Sole-Source Contracts',
      value: formatNumber(stats?.total_sole_source),
      subtitle: 'Non-competitive procurements',
    },
  ];

  return (
    <div className="animate-in">
      {/* Executive Briefing Hero */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginBottom: 32,
        padding: '28px 32px',
        background: 'var(--gradient-glass)',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-xl)',
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          AI Accountability Dashboard · Agency 2026 Ottawa
        </div>
        <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          We analyzed {stats?.total_public_funding ? formatCurrency(stats.total_public_funding) : '$89.4B'} in public funding.<br />
          Here is what we found.
        </div>
        <div style={{ display: 'flex', gap: 32, marginTop: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Zombie Recipients', value: stats?.zombie_count, color: 'var(--status-critical)', path: '/zombies' },
            { label: 'Funding Loops', value: stats?.total_funding_loops, color: 'var(--accent-purple)', path: '/loops' },
            { label: 'Multi-Board Directors', value: stats?.multi_board_directors, color: 'var(--accent-cyan)', path: '/governance' },
            { label: 'At-Risk Funding', value: stats?.at_risk_funding ? formatCurrency(stats.at_risk_funding) : null, color: 'var(--status-critical)', raw: true },
          ].map((item, i) => (
            <div key={i} onClick={() => item.path && navigate(item.path)} style={{ cursor: item.path ? 'pointer' : 'default' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: item.color }}>
                {item.value == null ? '…' : item.raw ? item.value : Number(item.value).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        {statCards.map((card, i) => (
          <div
            key={i}
            className="stat-card"
            style={{ cursor: card.onClick ? 'pointer' : 'default', animationDelay: `${i * 50}ms` }}
            onClick={card.onClick}
          >
            <div className="stat-card-header">
              <div className={`stat-card-icon ${card.color}`}>{card.icon}</div>
              <span className="stat-card-label">{card.label}</span>
            </div>
            <div className="stat-card-value">{card.value}</div>
            <div className="stat-card-subtitle">{card.subtitle}</div>
          </div>
        ))}
      </div>

      {/* Start Here — Featured Cases */}
      {featured.length > 0 && (
        <div style={{ marginTop: 28, marginBottom: 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Start Here — High-Priority Cases
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {featured.map((org, i) => (
              <div
                key={org.bn || i}
                onClick={() => navigate(`/entity/${encodeURIComponent(org.bn)}`)}
                style={{
                  padding: '16px 20px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-primary)',
                  borderLeft: '3px solid var(--status-critical)',
                  borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--status-critical)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderLeftColor = 'var(--status-critical)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, flex: 1 }}>{org.name}</div>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: 'var(--status-critical)', border: '1px solid rgba(239,68,68,0.3)', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 600 }}>
                    {org.loops_count || org.loop_count || 0} loops
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  {(org.flags || []).slice(0, 2).map(f => (
                    <span key={f} style={{ fontSize: 11, color: 'var(--status-critical)', background: 'rgba(239,68,68,0.08)', padding: '2px 6px', borderRadius: 4 }}>
                      🔴 {f}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {org.circular_outflow > 0 ? `${fmtDollars(org.circular_outflow)} circular` : `${org.loops_count || 0} loops`}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--accent-purple)', fontWeight: 600 }}>Investigate →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Investigation Prompts */}
      <div style={{
        marginTop: 32,
        padding: '24px 28px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          🔍 Quick Investigations
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {[
            { icon: '🧟', title: 'Zombie Recipients', desc: 'Organizations that received $6M+ then vanished', path: '/zombies', color: 'var(--status-critical)' },
            { icon: '🔄', title: 'Largest Funding Loop', desc: 'Circular gift patterns cycling through multiple charities', path: '/loops', color: 'var(--accent-purple)' },
            { icon: '🕸️', title: 'Top Power Broker', desc: 'Director on multiple funded charity boards — conflicts of interest mapped', path: '/governance', color: 'var(--accent-cyan)' },
            { icon: '🤖', title: 'Ask AI', desc: '"Show me organizations in Alberta that dissolved after receiving funding"', path: '/chat', color: 'var(--accent-indigo)' },
          ].map((item, i) => (
            <div
              key={i}
              onClick={() => navigate(item.path)}
              style={{
                padding: '16px 20px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = item.color;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-primary)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: item.color }}>{item.title}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
