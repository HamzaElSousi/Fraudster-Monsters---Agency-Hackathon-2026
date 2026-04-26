import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchStats, fetchFlaggedOrgs, formatCurrency, formatNumber } from '../api';
import OrgCard, { FlaggedOrg } from '../components/OrgCard';

const FILTER_OPTIONS = [
  { key: 'all',        label: 'All' },
  { key: 'zombie',     label: '🧟 Zombie' },
  { key: 'loop',       label: '🔄 Loop' },
  { key: 'duplicate',  label: '💰 Duplicate' },
  { key: 'governance', label: '👥 Governance' },
];

const SORT_OPTIONS = [
  { value: 'risk_score',      label: 'Risk Score' },
  { value: 'funding_amount',  label: 'Funding Amount' },
  { value: 'recent',          label: 'Most Recent' },
];

const PROBLEM_CARDS = [
  {
    icon: '🧟',
    title: 'Zombie Orgs',
    desc: 'Received public funding then dissolved shortly after — money may not have reached stated purpose.',
  },
  {
    icon: '🔄',
    title: 'Circular Loops',
    desc: 'Charity money cycling between related entities, inflating revenue with no real program output.',
  },
  {
    icon: '💰',
    title: 'Duplicate Funding',
    desc: 'Same organization funded by both federal and provincial governments for the same purpose.',
  },
  {
    icon: '👥',
    title: 'Governance Networks',
    desc: 'Same directors controlling multiple funded organizations — conflicts of interest at scale.',
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
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--status-critical)', marginBottom: 8 }}>Backend Unavailable</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{error}</div>
      </div>
    );
  }

  return (
    <div className="animate-in">

      {/* ── Hero ── */}
      <div className="hero-section">
        <h1 className="hero-headline">
          Public money.<br />
          <span>Accountable to the public.</span>
        </h1>
        <p className="hero-subtitle">
          AuditLens surfaces funding anomalies across {stats ? formatNumber(stats.total_charities) : '…'}+ government records —
          giving auditors an AI-generated investigation brief in seconds, not weeks.
        </p>
        <form className="hero-search" onSubmit={handleHeroSearch}>
          <input
            className="hero-search-input"
            type="text"
            placeholder="Search by organization name, Business Number, or keyword…"
            value={heroSearch}
            onChange={e => setHeroSearch(e.target.value)}
          />
          <button className="hero-search-btn" type="submit">Search</button>
        </form>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          Or browse high-risk orgs below ↓
        </div>
      </div>

      {/* ── Problem Strip ── */}
      <div className="problem-strip">
        <div className="problem-strip-title">The Problem We're Solving</div>
        <div className="problem-strip-grid">
          {PROBLEM_CARDS.map(c => (
            <div className="problem-card" key={c.title}>
              <div className="problem-card-icon">{c.icon}</div>
              <div className="problem-card-title">{c.title}</div>
              <div className="problem-card-desc">{c.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          "Without a tool like AuditLens, investigating one organization takes an auditor 2–3 weeks of manual cross-referencing. We reduce that to under 3 minutes."
        </div>
      </div>

      {/* ── Live Stats Bar ── */}
      <div className="stats-bar">
        {[
          { num: stats?.zombie_count,        label: 'Zombie Recipients',    loading },
          { num: stats?.total_funding_loops, label: 'Funding Loops',        loading },
          { num: stats?.multi_board_directors, label: 'Multi-Board Directors', loading },
          { num: stats?.total_fed_grants,    label: 'Federal Grant Records', loading },
        ].map(({ num, label, loading: l }) => (
          <div className="stats-bar-item" key={label}>
            {l ? (
              <div className="loading-shimmer" style={{ height: 32, width: '60%', margin: '0 auto 6px' }} />
            ) : (
              <div className="stats-bar-number">{num != null ? Number(num).toLocaleString() : '—'}</div>
            )}
            <div className="stats-bar-label">{label}</div>
          </div>
        ))}
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
          <div className="feed-title">Today's Highest-Risk Recipients</div>
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
