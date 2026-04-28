import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStats, fetchDashboardFeatured, fetchLoopsStatsEnriched, fetchAlerts, formatCurrency, formatNumber, fmtDollars } from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [featured, setFeatured] = useState([]);
  const [loopStats, setLoopStats] = useState(null);
  const [killShot, setKillShot] = useState(null);
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

    fetchLoopsStatsEnriched()
      .then(setLoopStats)
      .catch(() => {});

    fetchAlerts(2, 5)
      .then(d => {
        const results = d?.results || [];
        if (results.length > 0) setKillShot(results[0]);
      })
      .catch(() => {});
  }, []);

  if (error) {
    return (
      <div style={{ padding: '40px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}></div>
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

  const findingCards = [
    {
      icon: '',
      label: 'Zombie Recipients',
      value: stats?.zombie_count,
      detail: stats?.at_risk_funding ? `${formatCurrency(stats.at_risk_funding)} at risk` : null,
      sub: '≥70% govt-dependent · stopped filing by 2022',
      color: 'var(--status-critical)',
      border: 'rgba(239,68,68,0.3)',
      bg: 'rgba(239,68,68,0.05)',
      path: '/zombies',
    },
    {
      icon: '',
      label: 'Funding Loops',
      value: stats?.total_funding_loops,
      detail: loopStats?.phantom_receipts_total ? `${fmtDollars(loopStats.phantom_receipts_total)} phantom receipts (est.)` : null,
      sub: 'Circular gift chains detected in CRA schedules',
      color: 'var(--accent-purple)',
      border: 'rgba(139,92,246,0.3)',
      bg: 'rgba(139,92,246,0.05)',
      path: '/loops',
    },
    {
      icon: '',
      label: 'Multi-Board Directors',
      value: stats?.multi_board_directors,
      detail: 'Directors on 5+ govt-funded charity boards',
      sub: 'High-confidence: 5+ boards makes coincidental name match unlikely',
      color: 'var(--accent-cyan)',
      border: 'rgba(34,211,238,0.3)',
      bg: 'rgba(34,211,238,0.05)',
      path: '/governance',
    },
  ];

  return (
    <div className="animate-in">
      {/* Breadcrumb */}
      <div style={{ marginBottom: 16 }}>
        <a href="/" style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 500 }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-indigo-light)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          ← Home
        </a>
      </div>

      {/* Executive Briefing Hero */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginBottom: 28,
        padding: '28px 32px',
        background: 'var(--gradient-glass)',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-xl)',
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Investigation Dashboard · Fraudster Monsters · Agency 2026
        </div>
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.2, background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          We mapped {stats ? formatNumber(stats.total_charities) : '…'} Canadian charities,{' '}
          {stats ? formatNumber(stats.total_fed_grants) : '…'} federal grant records,
          and {stats ? formatNumber(stats.total_sole_source) : '…'} procurement contracts.
          Here is what we found.
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          Sources: CRA T3010 charity filings · Federal Proactive Disclosure (51+ departments) · Alberta Open Procurement · All public records
        </div>
      </div>

      {/* 3 Key Findings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
        {findingCards.map((card) => (
          <div
            key={card.label}
            onClick={() => navigate(card.path)}
            style={{
              padding: '20px 24px',
              background: card.bg,
              border: `1px solid ${card.border}`,
              borderTop: `3px solid ${card.color}`,
              borderRadius: 'var(--radius-lg)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>{card.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: card.color }}>{card.label}</span>
            </div>
            <div style={{ fontSize: 42, fontWeight: 900, color: card.color, lineHeight: 1, marginBottom: 6 }}>
              {card.value != null ? card.value.toLocaleString() : '…'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{card.detail || ' '}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>{card.sub}</div>
            <div style={{ fontSize: 12, color: card.color, fontWeight: 700 }}>Investigate →</div>
          </div>
        ))}
      </div>

      {/* Kill Shot Card — top multi-flag alert */}
      {killShot && (
        <div
          onClick={() => navigate(`/entity/${encodeURIComponent(killShot.bn)}`)}
          style={{
            padding: '20px 24px',
            marginBottom: 24,
            background: 'rgba(239,68,68,0.05)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderLeft: '4px solid var(--status-critical)',
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.09)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.05)'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--status-critical)', marginBottom: 6 }}>
                Highest-Priority Case
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{killShot.canonical_name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Received <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(killShot.total_govt_funding || 0)}</strong> in public funds
                {killShot.govt_share_pct ? ` (${Number(killShot.govt_share_pct).toFixed(0)}% of revenue from government)` : ''}.
                Flagged across <strong style={{ color: 'var(--status-critical)' }}>{killShot.alarm_count} challenge categories</strong>
                {(killShot.flags || []).includes('zombie') && killShot.last_filing_year ? ` and stopped filing after ${killShot.last_filing_year}` : ''}.
                {' '}All data from public CRA T3010 filings.
              </div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', marginBottom: 10 }}>
                {(killShot.flags || []).map(f => (
                  <span key={f} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: 'var(--status-critical)', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 600 }}>
                    {f === 'zombie' ? 'Zombie' : f === 'loop' ? 'Loop' : f === 'governance' ? 'Governance' : f}
                  </span>
                ))}
              </div>
              <span style={{ fontSize: 13, color: 'var(--status-critical)', fontWeight: 700 }}>Investigate → </span>
            </div>
          </div>
        </div>
      )}

      {/* Start Here — Featured Cases */}
      {featured.length > 0 && (
        <div style={{ marginBottom: 0 }}>
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
                       {f}
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
    </div>
  );
}
