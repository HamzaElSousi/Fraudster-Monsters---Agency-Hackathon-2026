import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStats, formatNumber, formatCurrency } from '../api';

const TEAM = [
  { name: 'Hamza El Sousi', email: 'hamza.sousi1998@gmail.com', role: 'Lead SWE / AI', link: 'https://github.com/HamzaElSousi' },
  { name: 'Mansi Joshi', email: 'mansijoshi.mj04@gmail.com', role: 'Frontend SWE / AI', link: 'https://github.com/mansijoshi04' },
  { name: 'Farah Mohammed', email: 'mohameffarah1@gmail.com', role: 'Data / AI', link: 'https://github.com/FaraDuMatin' },
  { name: 'Keena Swanson', email: 'Keenas@gmail.com', role: 'SWE / AI', link: 'https://github.com/k334a' },
];

const CHALLENGES = [
  {
    num: '#1', name: 'Zombie Recipients',
    desc: 'Charities with 70%+ government revenue dependency that stopped filing tax returns — public money sent into the void.',
    statKey: 'zombie_count', statLabel: 'zombies found', path: '/zombies',
    color: 'var(--status-critical)', border: 'rgba(239,68,68,0.25)', bg: 'rgba(239,68,68,0.04)',
  },
  {
    num: '#2', name: 'Ghost Capacity',
    desc: 'Organizations that persist indefinitely — still filing, still funded — but report 0–3 employees and 80%+ government dependency. They never do anything.',
    statKey: null, statLabel: 'ghost capacity orgs', path: '/ghost-recipients',
    color: 'var(--accent-amber)', border: 'rgba(251,191,36,0.25)', bg: 'rgba(251,191,36,0.04)',
  },
  {
    num: '#3', name: 'Funding Loops',
    desc: 'Circular money flows between charities where the same dollar passes through multiple organizations, each issuing its own charitable tax receipt.',
    statKey: 'total_funding_loops', statLabel: 'circular loops detected', path: '/loops',
    color: 'var(--accent-purple)', border: 'rgba(167,139,250,0.25)', bg: 'rgba(167,139,250,0.04)',
  },
  {
    num: '#4', name: 'Sole-Source Contracts',
    desc: 'Alberta procurement contracts awarded without competitive bidding. We tracked amendment creep — contracts that grow far beyond their original scope.',
    statKey: 'total_sole_source', statLabel: 'no-bid contracts', path: '/sole-source',
    color: 'var(--accent-emerald)', border: 'rgba(52,211,153,0.25)', bg: 'rgba(52,211,153,0.04)',
  },
  {
    num: '#5', name: 'Vendor Concentration',
    desc: 'Where has incumbency replaced competition? We measure HHI concentration by department, sector, and region to find monopoly-level vendor lock-in.',
    statKey: 'vendor_concentration_count', statLabel: 'concentrated groups', path: '/vendor-concentration',
    color: '#f472b6', border: 'rgba(244,114,182,0.25)', bg: 'rgba(244,114,182,0.04)',
  },
  {
    num: '#6', name: 'Governance Networks',
    desc: 'Directors who simultaneously sit on the boards of multiple government-funded charities, concentrating oversight of public money in a small number of hands.',
    statKey: 'multi_board_directors', statLabel: 'multi-board directors (5+ boards)', path: '/governance',
    color: 'var(--accent-cyan)', border: 'rgba(34,211,238,0.25)', bg: 'rgba(34,211,238,0.04)',
  },
  {
    num: '#7', name: 'Policy Misalignment',
    desc: 'Is the money going where the government says its priorities are? We compare actual spending patterns against stated commitments on climate, housing, and healthcare.',
    statKey: null, statLabel: 'departments analyzed', path: '/policy-misalignment',
    color: 'var(--accent-indigo-light)', border: 'rgba(99,102,241,0.25)', bg: 'rgba(99,102,241,0.04)',
  },
  {
    num: '#8', name: 'Duplicative Funding',
    desc: 'Organizations funded by multiple levels of government for the same purpose — potentially without those governments knowing about each other.',
    statKey: null, statLabel: 'dual-funded orgs', path: '/duplicative-funding',
    color: '#818cf8', border: 'rgba(129,140,248,0.25)', bg: 'rgba(129,140,248,0.04)',
  },
  {
    num: '#9', name: 'Threshold Gaming',
    desc: 'Grants clustered just below $25K, $100K, and $1M disclosure thresholds — the same structuring tactic used in financial crime.',
    statKey: null, statLabel: 'structuring detections', path: '/threshold-gaming',
    color: '#fb923c', border: 'rgba(251,146,60,0.25)', bg: 'rgba(251,146,60,0.04)',
  },
  {
    num: '#10', name: 'Adverse Media',
    desc: 'AI-powered screening of funded entities against adverse media patterns — fraud allegations, enforcement actions, criminal investigations, and sanctions.',
    statKey: null, statLabel: 'AI-powered screening', path: '/adverse-media',
    color: '#f87171', border: 'rgba(248,113,113,0.25)', bg: 'rgba(248,113,113,0.04)',
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

        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.15em', color: 'var(--accent-indigo-light)', marginBottom: 12 }}>FOLLOW THE MONEY</div>
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
            { n: s?.zombie_count, label: 'Zombie Recipients', color: 'var(--status-critical)' },
            { n: s?.total_funding_loops, label: 'Funding Loops', color: 'var(--accent-purple)' },
            { n: s?.multi_board_directors, label: 'Multi-Board Directors', color: 'var(--accent-cyan)' },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: item.color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
                {item.n != null ? Number(item.n).toLocaleString() : '...'}
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
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: member.link ? 6 : 0 }}>{member.email}</div>
                {member.link && (
                  <a href={member.link} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 11, color: 'var(--accent-indigo-light)', textDecoration: 'none', fontWeight: 600 }}
                    onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                  >
                    {member.link.replace(/^https?:\/\//, '')}
                  </a>
                )}
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
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: ch.color,
                    background: `${ch.border.replace('0.25', '0.15')}`,
                    border: `1px solid ${ch.color}`,
                    borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.04em',
                  }}>{ch.num}</span>
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
