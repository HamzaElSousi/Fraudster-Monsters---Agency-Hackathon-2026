import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStats, formatCurrency, formatNumber } from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch((err) => {
        console.error('Stats error:', err);
        setError('Backend unavailable — start the server with bash start.sh');
      })
      .finally(() => setLoading(false));
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
      {/* Hero Stats */}
      <div style={{
        display: 'flex',
        gap: 24,
        marginBottom: 32,
        padding: '28px 32px',
        background: 'var(--gradient-glass)',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-xl)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Total Public Funding Tracked
          </div>
          <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {stats?.total_public_funding ? formatCurrency(stats.total_public_funding) : '—'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
            Across CRA T3010, Federal Grants & Contributions, and Alberta Open Data
          </div>
        </div>
        <div style={{
          padding: '16px 24px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 180,
        }}>
          <div style={{ fontSize: 11, color: 'var(--status-critical)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            At-Risk Funding
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--status-critical)' }}>
            {stats?.at_risk_funding ? formatCurrency(stats.at_risk_funding) : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Linked to flagged entities
          </div>
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
