import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStats, formatNumber, formatCurrency } from '../api';

const TEAM = [
  { name: 'Team Member 1', email: 'member1@example.com', role: 'Data Engineering' },
  { name: 'Team Member 2', email: 'member2@example.com', role: 'Backend / AI' },
  { name: 'Team Member 3', email: 'member3@example.com', role: 'Frontend / UX' },
  { name: 'Team Member 4', email: 'member4@example.com', role: 'Investigations' },
];

const CHALLENGES = [
  {
    icon: '🧟',
    name: 'Zombie Recipients',
    desc: 'Charities with 70%+ government revenue dependency that stopped filing tax returns — public money sent into the void.',
    statKey: 'zombie_count',
    statLabel: 'zombies found',
    path: '/zombies',
    color: 'var(--status-critical)',
    border: 'rgba(239,68,68,0.25)',
    bg: 'rgba(239,68,68,0.04)',
  },
  {
    icon: '👻',
    name: 'Ghost Recipients',
    desc: 'Federal grant recipients who received $500K+ then went silent for 4+ years with no traceable business number.',
    statKey: null,
    statLabel: 'challenge #2',
    path: '/zombies',
    color: 'var(--accent-amber)',
    border: 'rgba(251,191,36,0.25)',
    bg: 'rgba(251,191,36,0.04)',
  },
  {
    icon: '🔄',
    name: 'Funding Loops',
    desc: 'Circular money flows between charities where the same dollar passes through multiple organizations, each issuing its own tax receipt.',
    statKey: 'total_funding_loops',
    statLabel: 'circular loops',
    path: '/loops',
    color: 'var(--accent-purple)',
    border: 'rgba(167,139,250,0.25)',
    bg: 'rgba(167,139,250,0.04)',
  },
  {
    icon: '🕸️',
    name: 'Governance Networks',
    desc: 'Directors who simultaneously control multiple government-funded charities, concentrating oversight of public money in few hands.',
    statKey: 'multi_board_directors',
    statLabel: 'multi-board directors',
    path: '/governance',
    color: 'var(--accent-cyan)',
    border: 'rgba(34,211,238,0.25)',
    bg: 'rgba(34,211,238,0.04)',
  },
  {
    icon: '📋',
    name: 'Sole-Source Contracts',
    desc: 'Alberta procurement contracts awarded without competitive bidding, showing amendment creep and extreme vendor concentration.',
    statKey: 'total_sole_source',
    statLabel: 'no-bid contracts',
    path: '/sole-source',
    color: 'var(--accent-emerald)',
    border: 'rgba(52,211,153,0.25)',
    bg: 'rgba(52,211,153,0.04)',
  },
  {
    icon: '📊',
    name: 'Threshold Gaming',
    desc: 'Federal grant recipients who repeatedly receive grants clustered just below $25K, $100K, and $1M proactive disclosure thresholds.',
    statKey: null,
    statLabel: 'challenge #9',
    path: '/threshold-gaming',
    color: 'var(--accent-indigo-light)',
    border: 'rgba(99,102,241,0.25)',
    bg: 'rgba(99,102,241,0.04)',
  },
];

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #6366f1, #a78bfa)',
  'linear-gradient(135deg, #06b6d4, #6366f1)',
  'linear-gradient(135deg, #ef4444, #f97316)',
  'linear-gradient(135deg, #22c55e, #06b6d4)',
];

export default function Home() {
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
  }, []);

  const s = stats;

  return (
    <div className="animate-in" style={{ maxWidth: 1100, margin: '0 auto', padding: '0 8px 64px' }}>

      {/* ── Hero ── */}
      <div style={{
        textAlign: 'center',
        padding: '64px 32px 48px',
        marginBottom: 48,
        background: 'var(--gradient-glass)',
        border: '1px solid var(--border-accent)',
        borderRadius: 'var(--radius-xl)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* background glow */}
        <div style={{
          position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)',
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ fontSize: 56, marginBottom: 12, lineHeight: 1 }}>💀</div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
          Agency 2026 · Ottawa · April 29, 2026
        </div>
        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 64px)',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          lineHeight: 1.05,
          marginBottom: 16,
          background: 'var(--gradient-primary)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          FRAUDSTER MONSTERS
        </h1>

        <p style={{ fontSize: 17, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 680, margin: '0 auto 28px', fontWeight: 400 }}>
          We mapped{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{s ? formatNumber(s.total_charities) : '91,129'}</strong> Canadian charities,{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{s ? formatNumber(s.total_fed_grants) : '1,275,521'}</strong> federal grant records,
          and <strong style={{ color: 'var(--text-primary)' }}>{s ? formatNumber(s.total_sole_source) : '15,533'}</strong> procurement contracts.
          Then we looked for patterns no human could trace by hand.
        </p>

        {/* Key numbers strip */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', marginBottom: 32 }}>
          {[
            { n: s?.zombie_count ?? 219, label: 'Zombie Recipients', color: 'var(--status-critical)' },
            { n: s?.total_funding_loops ?? 5808, label: 'Funding Loops', color: 'var(--accent-purple)' },
            { n: s?.multi_board_directors ?? 2841, label: 'Multi-Board Directors', color: 'var(--accent-cyan)' },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: item.color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
                {Number(item.n).toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/dashboard')}
          style={{
            padding: '14px 36px',
            fontSize: 15,
            fontWeight: 700,
            background: 'var(--gradient-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-glow)',
            transition: 'all var(--transition-fast)',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 0 32px rgba(99,102,241,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-glow)'; }}
        >
          → Enter Investigation Dashboard
        </button>
      </div>

      {/* ── Team ── */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 16, paddingLeft: 4 }}>
          The Team
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {TEAM.map((member, i) => (
            <div key={i} style={{
              padding: '20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: 10,
            }}>
              <div style={{
                width: 52, height: 52,
                background: AVATAR_GRADIENTS[i],
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 800, color: '#fff',
                boxShadow: '0 0 16px rgba(99,102,241,0.3)',
              }}>
                {initials(member.name)}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{member.name}</div>
                <div style={{ fontSize: 11, color: 'var(--accent-indigo-light)', marginBottom: 4, fontWeight: 500 }}>{member.role}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{member.email}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Challenges ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 16, paddingLeft: 4 }}>
          Challenges Investigated
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {CHALLENGES.map((ch) => {
            const statVal = ch.statKey && s?.[ch.statKey] != null ? Number(s[ch.statKey]).toLocaleString() : null;
            return (
              <div
                key={ch.name}
                onClick={() => navigate(ch.path)}
                style={{
                  padding: '20px 22px',
                  background: ch.bg,
                  border: `1px solid ${ch.border}`,
                  borderTop: `3px solid ${ch.color}`,
                  borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 22 }}>{ch.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: ch.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {ch.name}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
                  {ch.desc}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {statVal ? (
                    <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: ch.color }}>
                      {statVal} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontSize: 11 }}>{ch.statLabel}</span>
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ch.statLabel}</span>
                  )}
                  <span style={{ fontSize: 12, color: ch.color, fontWeight: 700 }}>View →</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Data provenance footer ── */}
      <div style={{
        marginTop: 48,
        padding: '16px 24px',
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-lg)',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--text-muted)',
        lineHeight: 1.7,
      }}>
        All data from <strong style={{ color: 'var(--text-secondary)' }}>official Canadian government open data portals</strong>.
        Nothing scraped, nothing estimated (except labelled phantom receipt upper bounds).
        <br />
        Sources: CRA T3010 charity filings · Federal Proactive Disclosure (51+ departments) · Alberta Open Procurement
      </div>
    </div>
  );
}
