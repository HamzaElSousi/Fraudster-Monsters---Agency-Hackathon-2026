// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, AlertTriangle, Bot, Building2, Network, Banknote, Search } from 'lucide-react';
import {
  fetchDuplicativeFunding,
  fetchDuplicativeFundingStats,
  fetchRelatedParties,
  fetchDuplicativeFundingSummary,
  fetchEntitySummary,
  formatCurrency,
  formatNumber,
  fmtDollars,
} from '../api';

// ── Shared styles ────────────────────────────────────────────────────────────

const INPUT_STYLE = {
  background: 'var(--bg-tertiary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try { return JSON.parse(raw).filter(Boolean); } catch { return []; }
}

function computeFlags(row) {
  const flags = [];
  const fedDepts = parseJsonList(row.fed_departments);
  const abMins = parseJsonList(row.ab_ministries);

  if ((row.combined_gov_funding || 0) > 50_000_000)
    flags.push({ text: `${formatCurrency(row.combined_gov_funding)} combined — major dual-source recipient`, severity: 'critical' });
  else if ((row.combined_gov_funding || 0) > 10_000_000)
    flags.push({ text: `${formatCurrency(row.combined_gov_funding)} combined — high-value dual-source`, severity: 'medium' });

  if ((row.ab_pct || 0) >= 40 && (row.ab_pct || 0) <= 60)
    flags.push({ text: 'Evenly split funding — no dominant funder, harder to audit', severity: 'medium' });

  if (fedDepts.length > 3)
    flags.push({ text: `Funded by ${fedDepts.length} federal departments simultaneously`, severity: 'critical' });
  else if (fedDepts.length > 1)
    flags.push({ text: `Funded by ${fedDepts.length} federal departments`, severity: 'medium' });

  if (abMins.length > 3)
    flags.push({ text: `Funded by ${abMins.length} Alberta ministries simultaneously`, severity: 'critical' });
  else if (abMins.length > 1)
    flags.push({ text: `Funded by ${abMins.length} Alberta ministries`, severity: 'medium' });

  return flags;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatTile({ label, value, color = 'var(--accent-purple)' }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 120 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function SplitBar({ abPct }) {
  const fedPct = 100 - (abPct || 0);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', background: 'var(--bg-tertiary)' }}>
        <div style={{ width: `${fedPct}%`, background: 'var(--accent-indigo)', transition: 'width 0.3s' }} />
        <div style={{ width: `${abPct || 0}%`, background: 'var(--accent-amber)', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {Math.round(fedPct)}% Fed / {Math.round(abPct || 0)}% AB
      </span>
    </div>
  );
}

function FlagItem({ text, severity }) {
  const colors = {
    critical: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', Icon: ShieldAlert, text: 'var(--status-critical)' },
    medium: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)', Icon: AlertTriangle, text: 'var(--status-medium)' },
  };
  const c = colors[severity] || colors.medium;
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: '7px 10px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 'var(--radius-sm)',
      fontSize: 12,
      color: c.text,
      lineHeight: 1.4,
    }}>
      <c.Icon size={13} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{text}</span>
    </div>
  );
}

function PillList({ items, color, emptyMsg }) {
  if (!items || items.length === 0) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emptyMsg}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item, i) => (
        <span key={i} style={{
          padding: '3px 10px',
          borderRadius: 20,
          fontSize: 11,
          fontWeight: 500,
          background: `${color}18`,
          color,
          border: `1px solid ${color}30`,
        }}>
          {item}
        </span>
      ))}
    </div>
  );
}

function OrgCard({ row, index }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const bn = row.bn_root || row.id;
  const flags = useMemo(() => computeFlags(row), [row]);
  const fedDepts = useMemo(() => parseJsonList(row.fed_departments), [row.fed_departments]);
  const abMins = useMemo(() => parseJsonList(row.ab_ministries), [row.ab_ministries]);

  const handleGenerateAI = async (e) => {
    e.stopPropagation();
    setAiLoading(true);
    try {
      const result = await fetchEntitySummary({
        name: row.canonical_name,
        fed_total: row.fed_total,
        ab_total: row.ab_total,
        fed_departments: fedDepts,
        ab_ministries: abMins,
        entity_type: row.entity_type,
        city: row.city,
      });
      setAiSummary(result.summary || '⚠ AI analysis unavailable — no response from model.');
    } catch {
      setAiSummary('⚠ AI analysis unavailable — request failed.');
    }
    setAiLoading(false);
  };

  const collapsedFlags = flags.slice(0, 2);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${flags.some(f => f.severity === 'critical') ? 'rgba(239,68,68,0.3)' : 'var(--border-primary)'}`,
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px',
      animation: `fadeInUp 0.3s ease-out ${Math.min(index * 40, 400)}ms both`,
      transition: 'border-color 0.15s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.3 }}>
          {row.canonical_name || '—'}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent-purple)', whiteSpace: 'nowrap' }}>
          {formatCurrency(row.combined_gov_funding)}
        </div>
      </div>

      {(row.city || row.province) && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          {[row.city, row.province].filter(Boolean).join(', ')}
        </div>
      )}

      {/* Funding amounts */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Federal: </span>
          <span style={{ color: 'var(--accent-indigo-light)', fontWeight: 600 }}>{formatCurrency(row.fed_total)}</span>
          {(row.fed_grant_count || 0) > 0 && (
            <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({formatNumber(row.fed_grant_count)} grants)</span>
          )}
        </div>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Alberta: </span>
          <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>{formatCurrency(row.ab_total)}</span>
          {(row.ab_payment_count || 0) > 0 && (
            <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({formatNumber(row.ab_payment_count)} payments)</span>
          )}
        </div>
      </div>

      <SplitBar abPct={row.ab_pct} />

      {/* Collapsed flags (up to 2) */}
      {collapsedFlags.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          {collapsedFlags.map((f, i) => <FlagItem key={i} {...f} />)}
          {flags.length > 2 && !expanded && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 4 }}>
              +{flags.length - 2} more flag{flags.length - 2 !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Entity type badge */}
      {row.entity_type && row.entity_type !== 'unknown' && (
        <span className="badge info" style={{ marginTop: 10, display: 'inline-block', fontSize: 11 }}>
          {row.entity_type}
        </span>
      )}

      {/* Expand / collapse button */}
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            padding: '5px 12px', fontSize: 12, border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)',
            color: 'var(--accent-purple)', cursor: 'pointer', fontWeight: 500,
          }}
        >
          {expanded ? '▲ Collapse' : '▼ Details'}
        </button>
        {bn && (
          <button
            onClick={() => navigate(`/entity/${bn}`)}
            style={{
              padding: '5px 12px', fontSize: 12, border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 'var(--radius-sm)', background: 'rgba(167,139,250,0.08)',
              color: 'var(--accent-purple)', cursor: 'pointer', fontWeight: 500,
            }}
          >
            View Case File →
          </button>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* All flags */}
          {flags.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Risk Flags
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {flags.map((f, i) => <FlagItem key={i} {...f} />)}
              </div>
            </div>
          )}

          {/* Federal departments */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--accent-indigo-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Federal Departments ({fedDepts.length})
            </div>
            <PillList items={fedDepts} color="var(--accent-indigo-light)" emptyMsg="No department data" />
          </div>

          {/* Alberta ministries */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--accent-amber)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Alberta Ministries ({abMins.length})
            </div>
            <PillList items={abMins} color="var(--accent-amber)" emptyMsg="No ministry data" />
          </div>

          {/* Per-org AI analysis */}
          <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--accent-purple)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              AI Analysis
            </div>
            {aiLoading ? (
              <div className="loading-shimmer" style={{ height: 48, borderRadius: 'var(--radius-sm)' }} />
            ) : aiSummary ? (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(167,139,250,0.07)',
                border: '1px solid rgba(167,139,250,0.2)',
                borderLeft: '3px solid var(--accent-purple)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}>
                {aiSummary}
              </div>
            ) : (
              <button
                onClick={handleGenerateAI}
                style={{
                  padding: '7px 14px', fontSize: 12,
                  border: '1px solid rgba(167,139,250,0.3)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(167,139,250,0.08)',
                  color: 'var(--accent-purple)',
                  cursor: 'pointer', fontWeight: 500,
                }}
              >
                <Bot size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Generate AI Analysis
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DirectorCard({ row, index }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const organizations = row.organizations || [];
  const bnRoots = row.bn_roots || [];

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-primary)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 20px',
      animation: `fadeInUp 0.3s ease-out ${Math.min(index * 40, 400)}ms both`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
          {row.first_name} {row.last_name}
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-cyan)', whiteSpace: 'nowrap' }}>
          {fmtDollars(row.total_gov_funding)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="badge critical" style={{ fontSize: 11 }}>
          {row.org_count} orgs
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          governs organizations receiving both federal + Alberta funding
        </span>
      </div>

      {/* Preview of first 2 orgs when collapsed */}
      {!expanded && organizations.slice(0, 2).map((org, i) => (
        <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 8, borderLeft: '2px solid var(--border-primary)', marginBottom: 4 }}>
          {org}
        </div>
      ))}
      {!expanded && organizations.length > 2 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 8, marginBottom: 4 }}>
          + {organizations.length - 2} more organization{organizations.length - 2 !== 1 ? 's' : ''}
        </div>
      )}

      {/* Expand button */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          marginTop: 8, padding: '5px 12px', fontSize: 12,
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)',
          color: 'var(--accent-cyan)', cursor: 'pointer', fontWeight: 500,
        }}
      >
        {expanded ? '▲ Collapse' : `▼ Show All ${organizations.length} Organizations`}
      </button>

      {/* Expanded org list */}
      {expanded && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {organizations.map((org, i) => {
            const bn = bnRoots[i];
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-primary)',
                gap: 8,
              }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>{org}</span>
                {bn && (
                  <button
                    onClick={() => navigate(`/entity/${bn}`)}
                    style={{
                      padding: '3px 10px', fontSize: 11,
                      border: '1px solid rgba(34,211,238,0.3)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(34,211,238,0.06)',
                      color: 'var(--accent-cyan)',
                      cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    → Investigate
                  </button>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 4 }}>
            Total controlled: <strong style={{ color: 'var(--accent-cyan)' }}>{fmtDollars(row.total_gov_funding)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DuplicativeFunding() {
  const [tab, setTab] = useState('orgs');
  const [orgs, setOrgs] = useState([]);
  const [directors, setDirectors] = useState([]);
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [directorsLoading, setDirectorsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fundingMix, setFundingMix] = useState('all');
  const [minFedInput, setMinFedInput] = useState('1000000');
  const [minAbInput, setMinAbInput] = useState('1000000');
  const [minFed, setMinFed] = useState(1_000_000);
  const [minAb, setMinAb] = useState(1_000_000);
  const [minOrgs, setMinOrgs] = useState(3);
  const [minOrgsInput, setMinOrgsInput] = useState('3');

  useEffect(() => {
    fetchDuplicativeFundingStats()
      .then(d => { setStats(d); setStatsLoading(false); })
      .catch(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    fetchDuplicativeFundingSummary()
      .then(d => { setSummary(d.summary || ''); setSummaryLoading(false); })
      .catch(() => setSummaryLoading(false));
  }, []);

  useEffect(() => {
    setOrgsLoading(true);
    fetchDuplicativeFunding(minFed, minAb, 200)
      .then(d => { setOrgs(d.results || []); setOrgsLoading(false); })
      .catch(() => setOrgsLoading(false));
  }, [minFed, minAb]);

  useEffect(() => {
    setDirectorsLoading(true);
    fetchRelatedParties(minOrgs, 100)
      .then(d => { setDirectors(d.results || []); setDirectorsLoading(false); })
      .catch(() => setDirectorsLoading(false));
  }, [minOrgs]);

  const applyMinFed = () => { const v = parseFloat(minFedInput); if (!isNaN(v) && v >= 0) setMinFed(v); };
  const applyMinAb = () => { const v = parseFloat(minAbInput); if (!isNaN(v) && v >= 0) setMinAb(v); };
  const applyMinOrgs = () => { const v = parseInt(minOrgsInput, 10); if (!isNaN(v) && v >= 2) setMinOrgs(v); };

  const filteredOrgs = useMemo(() => {
    let data = orgs;
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(r =>
        (r.canonical_name || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.province || '').toLowerCase().includes(q)
      );
    }
    if (fundingMix === 'fed-heavy') data = data.filter(r => (r.ab_pct || 0) < 25);
    if (fundingMix === 'ab-heavy') data = data.filter(r => (r.ab_pct || 0) > 75);
    if (fundingMix === 'split') data = data.filter(r => (r.ab_pct || 0) >= 25 && (r.ab_pct || 0) <= 75);
    return data;
  }, [orgs, search, fundingMix]);

  const filteredDirectors = useMemo(() => {
    if (!search) return directors;
    const q = search.toLowerCase();
    return directors.filter(r =>
      `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase().includes(q) ||
      (r.organizations || []).some(o => o.toLowerCase().includes(q))
    );
  }, [directors, search]);

  const MIX_OPTIONS = [
    { value: 'all', label: 'All mixes' },
    { value: 'fed-heavy', label: 'Fed-heavy (>75%)' },
    { value: 'split', label: 'Split (25–75%)' },
    { value: 'ab-heavy', label: 'AB-heavy (>75%)' },
  ];

  return (
    <div className="animate-in">
      {/* AI Summary Banner */}
      {summaryLoading ? (
        <div className="loading-shimmer" style={{ height: 72, borderRadius: 'var(--radius-lg)', marginBottom: 20 }} />
      ) : summary ? (
        <div style={{
          background: 'rgba(167,139,250,0.07)',
          border: '1px solid rgba(167,139,250,0.25)',
          borderLeft: '4px solid var(--accent-purple)',
          borderRadius: 'var(--radius-lg)',
          padding: '14px 20px',
          marginBottom: 20,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <Bot size={18} style={{ flexShrink: 0, color: 'var(--accent-purple)' }} />
          <div>
            <div style={{ fontSize: 11, color: 'var(--accent-purple)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              AI Investigative Summary
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{summary}</div>
          </div>
        </div>
      ) : null}

      {/* Stat Strip */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap',
        padding: '20px 24px',
        background: 'rgba(167,139,250,0.06)',
        border: '1px solid rgba(167,139,250,0.15)',
        borderRadius: 'var(--radius-lg)',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, color: 'var(--accent-purple)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Challenges #6 + #8 — Duplicative Funding & Related Parties
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Organizations receiving federal, Alberta, and CRA funding simultaneously.
            Directors governing multiple dual-funded organizations.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <StatTile label="Dual-funded orgs" value={statsLoading ? '…' : formatNumber(stats?.total_orgs)} color="var(--accent-purple)" />
          <StatTile label="Federal total" value={statsLoading ? '…' : formatCurrency(stats?.total_fed)} color="var(--accent-indigo-light)" />
          <StatTile label="Alberta total" value={statsLoading ? '…' : formatCurrency(stats?.total_ab)} color="var(--accent-amber)" />
          <StatTile label="Combined" value={statsLoading ? '…' : formatCurrency(stats?.total_combined)} color="var(--status-critical)" />
        </div>
      </div>

      {/* Tab Bar + Search + Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 2 }}>
          {[{ id: 'orgs', label: 'Organizations', Icon: Building2 }, { id: 'directors', label: 'Related Parties', Icon: Network }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '6px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
              background: tab === t.id ? 'var(--accent-purple)' : 'transparent',
              color: tab === t.id ? '#fff' : 'var(--text-secondary)',
              fontWeight: tab === t.id ? 600 : 400,
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}><t.Icon size={13} />{t.label}</button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder={tab === 'orgs' ? 'Search org name, city...' : 'Search director name, org...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...INPUT_STYLE, paddingLeft: 32, width: '100%' }}
          />
        </div>

        {/* Org filters */}
        {tab === 'orgs' && (
          <>
            <select value={fundingMix} onChange={e => setFundingMix(e.target.value)} style={{ ...INPUT_STYLE, cursor: 'pointer' }}>
              {MIX_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Min Fed $</span>
              <input type="number" value={minFedInput} onChange={e => setMinFedInput(e.target.value)}
                onBlur={applyMinFed} onKeyDown={e => e.key === 'Enter' && applyMinFed()}
                style={{ ...INPUT_STYLE, width: 110 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Min AB $</span>
              <input type="number" value={minAbInput} onChange={e => setMinAbInput(e.target.value)}
                onBlur={applyMinAb} onKeyDown={e => e.key === 'Enter' && applyMinAb()}
                style={{ ...INPUT_STYLE, width: 110 }} />
            </div>
          </>
        )}

        {/* Director filters */}
        {tab === 'directors' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Min orgs</span>
            <input type="number" min={2} max={20} value={minOrgsInput}
              onChange={e => setMinOrgsInput(e.target.value)}
              onBlur={applyMinOrgs} onKeyDown={e => e.key === 'Enter' && applyMinOrgs()}
              style={{ ...INPUT_STYLE, width: 70 }} />
          </div>
        )}

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {tab === 'orgs'
            ? `${filteredOrgs.length.toLocaleString()} organizations`
            : `${filteredDirectors.length.toLocaleString()} directors`}
        </span>
      </div>

      {/* Organizations tab */}
      {tab === 'orgs' && (
        orgsLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="loading-shimmer" style={{ height: 160, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : filteredOrgs.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)' }}>
            <Banknote size={36} style={{ marginBottom: 12, color: 'var(--text-muted)' }} />
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No organizations match your filters</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Try lowering the minimum amounts or clearing the search.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {filteredOrgs.map((row, i) => <OrgCard key={row.id || i} row={row} index={i} />)}
          </div>
        )
      )}

      {/* Directors tab */}
      {tab === 'directors' && (
        directorsLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="loading-shimmer" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : filteredDirectors.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)' }}>
            <Network size={36} style={{ marginBottom: 12, color: 'var(--text-muted)' }} />
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No directors match your filters</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Try lowering the minimum organizations or clearing the search.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {filteredDirectors.map((row, i) => (
              <DirectorCard key={`${row.first_name}-${row.last_name}-${i}`} row={row} index={i} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
