import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skull, Repeat2, Banknote, Users, AlertTriangle, LayoutGrid, List } from 'lucide-react';
import { fetchStats, fetchFlaggedOrgs, formatCurrency, formatNumber } from '../api';
import OrgCard, { FlaggedOrg } from '../components/OrgCard';

const FILTER_OPTIONS = [
  { key: 'all',        label: 'All' },
  { key: 'zombie',     label: 'Zombie' },
  { key: 'loop',       label: 'Loop' },
  { key: 'duplicate',  label: 'Duplicate' },
  { key: 'governance', label: 'Governance' },
];

const SORT_OPTIONS = [
  { value: 'risk_score',      label: 'Risk Score' },
  { value: 'funding_amount',  label: 'Funding Amount' },
  { value: 'recent',          label: 'Most Recent' },
];

const PROBLEM_CARDS = [
  {
    Icon: Skull,
    title: 'Zombie Orgs',
    desc: 'Received public funding then dissolved shortly after — money may not have reached stated purpose.',
    link: '/zombies',
  },
  {
    Icon: Repeat2,
    title: 'Circular Loops',
    desc: 'Charity money cycling between related entities, inflating revenue with no real program output.',
    link: '/loops',
  },
  {
    Icon: Banknote,
    title: 'Duplicate Funding',
    desc: 'Same organization funded by both federal and provincial governments for the same purpose.',
    link: '/duplicative-funding',
  },
  {
    Icon: Users,
    title: 'Governance Networks',
    desc: 'Same directors controlling multiple funded organizations — conflicts of interest at scale.',
    link: '/governance',
  },
];

export default function Dashboard() {
  const [stats, setStats]           = useState<any>(null);
  const [orgs, setOrgs]             = useState<FlaggedOrg[]>([]);
  const [loading, setLoading]       = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [filter, setFilter]         = useState('all');
  const [sort, setSort]             = useState('risk_score');
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [heroSearch, setHeroSearch] = useState('');
  const [viewMode, setViewMode]     = useState<'grid' | 'list'>('list');
  const navigate = useNavigate();
  const PAGE_SIZE = 24;

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => setError('Backend unavailable — run bash start.sh'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setFeedLoading(true);
    setPage(1);
    fetchFlaggedOrgs(filter, sort, PAGE_SIZE)
      .then(d => {
        const list = d.orgs || [];
        setOrgs(list);
        setHasMore(list.length === PAGE_SIZE);
      })
      .catch(() => setOrgs([]))
      .finally(() => setFeedLoading(false));
  }, [filter, sort]);

  const loadMore = () => {
    const next = page + 1;
    fetchFlaggedOrgs(filter, sort, next * PAGE_SIZE)
      .then(d => {
        const list = d.orgs || [];
        setOrgs(list);
        setHasMore(list.length === next * PAGE_SIZE);
        setPage(next);
      })
      .catch(() => {});
  };

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!heroSearch.trim()) return;
    navigate(`/alerts?q=${encodeURIComponent(heroSearch.trim())}`);
  };

  if (error) {
    return (
      <div style={{ padding: '40px 32px', textAlign: 'center' }}>
        <AlertTriangle size={48} style={{ marginBottom: 16, color: 'var(--status-critical)' }} />
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--status-critical)', marginBottom: 8 }}>Backend Unavailable</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{error}</div>
      </div>
    );
  }

  return (
    <div className="animate-in">

      {/* ── Live Stats Bar ── */}
      <div className="stats-bar">
        {[
          { num: stats?.zombie_count,          label: 'Zombie Recipients' },
          { num: stats?.total_funding_loops,   label: 'Funding Loops' },
          { num: stats?.multi_board_directors, label: 'Multi-Board Directors' },
          { num: stats?.total_fed_grants,      label: 'Federal Grant Records' },
        ].map(({ num, label }) => (
          <div className="stats-bar-item" key={label}>
            {loading ? (
              <div className="loading-shimmer" style={{ height: 32, width: '60%', margin: '0 auto 6px' }} />
            ) : (
              <div className="stats-bar-number">{num != null ? Number(num).toLocaleString() : '—'}</div>
            )}
            <div className="stats-bar-label">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Hero ── */}
      <div className="hero-section">
        <h1 className="hero-headline">
          Integrity Through<br />
          <span>Precision Analysis.</span>
        </h1>
        <p className="hero-subtitle">
          The most advanced platform for identifying institutional fraud, monitoring zombie entities, and unmasking hidden governance networks across{' '}
          {stats ? formatNumber(stats.total_charities) : '…'}+ government records.
        </p>
        <form className="hero-search" onSubmit={handleHeroSearch}>
          <input
            className="hero-search-input"
            type="text"
            placeholder="Search investigations, entities, or Business Numbers…"
            value={heroSearch}
            onChange={e => setHeroSearch(e.target.value)}
          />
          <button className="hero-search-btn" type="submit">Launch Intelligence →</button>
        </form>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          Or browse high-risk orgs below ↓
        </div>
      </div>

      {/* ── Mission Parameters ── */}
      <div className="problem-strip">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              Mission Parameters
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.15em', padding: '4px 12px', background: 'rgba(30,41,59,0.5)', borderRadius: 999, border: '1px solid var(--border-primary)' }}>
              Operational Focus
            </span>
            <div className="problem-view-toggle">
              <button className={`problem-view-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')} title="Grid view"><LayoutGrid size={14} /></button>
              <button className={`problem-view-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')} title="List view"><List size={14} /></button>
            </div>
          </div>
        </div>
        {viewMode === 'grid' ? (
          <div className="problem-strip-grid">
            {PROBLEM_CARDS.map(c => (
              <div className="problem-card" key={c.title} onClick={() => navigate(c.link)} style={{ cursor: 'pointer' }}>
                <div className="problem-card-icon"><c.Icon size={20} /></div>
                <div className="problem-card-title">{c.title}</div>
                <div className="problem-card-desc">{c.desc}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="problem-list">
            {PROBLEM_CARDS.map(c => (
              <div className="problem-list-row" key={c.title} onClick={() => navigate(c.link)} style={{ cursor: 'pointer' }}>
                <div className="problem-list-row-icon"><c.Icon size={22} /></div>
                <div className="problem-list-row-body">
                  <div className="problem-list-row-title">{c.title}</div>
                  <div className="problem-list-row-desc">{c.desc}</div>
                </div>
                <div className="problem-list-row-arrow">→</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── How It Works ── */}
      <div className="how-it-works">
        {[
          { n: '01', label: 'Search or browse' },
          { n: '02', label: 'AI scores & flags' },
          { n: '03', label: 'Review case file' },
          { n: '04', label: 'Escalate or export' },
        ].map(s => (
          <div className="how-step" key={s.n}>
            <div className="how-step-num">{s.n}</div>
            <div className="how-step-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Flagged Orgs Feed ── */}
      <div style={{ marginTop: 28 }}>
        <div className="feed-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="feed-title">Today's Highest-Risk Recipients</div>
            <a
              href={`${import.meta.env.VITE_API_URL || ''}/api/export/flagged-orgs.csv?filter=${filter}&sort=${sort}`}
              download
              className="feed-export-btn"
            >
              Export CSV
            </a>
          </div>
          <div className="feed-controls">
            {FILTER_OPTIONS.map(f => (
              <button
                key={f.key}
                className={`feed-filter-chip${filter === f.key ? ' active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
            <select
              className="feed-sort-select"
              value={sort}
              onChange={e => setSort(e.target.value)}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {feedLoading ? (
          <div className="feed-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="org-card">
                <div className="loading-shimmer" style={{ height: 18, width: '70%', marginBottom: 10 }} />
                <div className="loading-shimmer" style={{ height: 12, width: '40%', marginBottom: 14 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="loading-shimmer" style={{ height: 22, width: 70, borderRadius: 999 }} />
                  <div className="loading-shimmer" style={{ height: 22, width: 60, borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
            No organizations found for this filter.
          </div>
        ) : (
          <>
            <div className="feed-grid">
              {orgs.map(org => (
                <OrgCard key={org.bn_root} org={org} />
              ))}
            </div>
            {hasMore && (
              <button className="feed-load-more" onClick={loadMore}>
                Load More
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
