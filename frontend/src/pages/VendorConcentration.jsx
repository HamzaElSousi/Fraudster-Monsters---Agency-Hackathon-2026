// ── CHALLENGE 5 — Vendor Concentration ──────────────────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  fetchVendorConcentration,
  fetchVendorConcentrationStats,
  fetchVendorConcentrationDetail,
  fetchVendorConcentrationBrief,
  fetchVendorConcentrationAnalysis,
} from '../api';

function fmtDollars(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Number(n).toLocaleString()}`;
}

/* ── Small UI components ─────────────────────────────────────────────────── */

function HHIGauge({ value }) {
  const pct = Math.min((value / 10000) * 100, 100);
  const color = value > 2500 ? 'var(--status-critical)' : value > 1500 ? 'var(--accent-amber)' : 'var(--accent-emerald)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden', minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color, minWidth: 50, textAlign: 'right' }}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function ConcentrationBadge({ level }) {
  const styles = {
    'Highly Concentrated': { bg: 'rgba(239,68,68,0.1)', color: 'var(--status-critical)', border: 'rgba(239,68,68,0.3)', icon: '🔴' },
    'Moderately Concentrated': { bg: 'rgba(234,179,8,0.1)', color: 'var(--accent-amber)', border: 'rgba(234,179,8,0.3)', icon: '🟡' },
    'Competitive': { bg: 'rgba(34,211,153,0.1)', color: 'var(--accent-emerald)', border: 'rgba(34,211,153,0.3)', icon: '🟢' },
  };
  const s = styles[level] || styles['Competitive'];
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
    }}>
      {s.icon} {level}
    </span>
  );
}

/* ── AI Analysis Panel ───────────────────────────────────────────────────── */

function AIAnalysisPanel() {
  const [analysis, setAnalysis] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVendorConcentrationAnalysis()
      .then(d => { setAnalysis(d.analysis || ''); setSource(d.source || ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-shimmer" style={{ height: 80, borderRadius: 'var(--radius-lg)', marginBottom: 20 }} />;
  if (!analysis) return null;

  return (
    <div style={{
      background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.25)',
      borderLeft: '4px solid var(--accent-purple)', borderRadius: 'var(--radius-lg)',
      padding: '14px 20px', marginBottom: 20,
    }}>
      <div style={{ fontSize: 11, color: 'var(--accent-purple)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        🤖 AI Market Intelligence
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(167,139,250,0.15)', fontWeight: 500, textTransform: 'none' }}>
          {source === 'gemini' ? 'Gemini' : 'Rule-based'}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{analysis}</div>
    </div>
  );
}

/* ── Expanded Row with detail + charts ───────────────────────────────────── */

function ExpandedRow({ row, dimension }) {
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [brief, setBrief] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);

  useEffect(() => {
    setDetailLoading(true);
    fetchVendorConcentrationDetail(row.group_key, dimension, 15)
      .then(d => { setDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [row.group_key, dimension]);

  const handleBrief = async () => {
    setBriefLoading(true);
    const result = await fetchVendorConcentrationBrief({
      group_key: row.group_key, dimension, hhi: row.hhi, cr3_pct: row.cr3_pct,
      group_total: row.group_total, top3_names: row.top3_names,
      top3_millions: row.top3_millions, recipient_count: row.recipient_count,
    });
    setBrief(result.brief || ''); setBriefLoading(false);
  };

  const vendors = detail?.vendors || [];
  const trend = detail?.trend || [];

  // Market share pie chart
  const pieOption = vendors.length > 0 ? {
    tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
    legend: { show: false },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['50%', '50%'],
      itemStyle: { borderRadius: 4, borderColor: '#1a1b2e', borderWidth: 2 },
      label: { show: false },
      data: vendors.slice(0, 8).map((v, i) => ({
        name: v.vendor?.substring(0, 30) || `Vendor ${i+1}`,
        value: Math.round(v.total_value || 0),
        itemStyle: { color: ['#6366f1','#8b5cf6','#a78bfa','#c4b5fd','#818cf8','#6ee7b7','#fbbf24','#f87171'][i] },
      })),
    }],
  } : null;

  // Year-over-year trend chart
  const trendOption = trend.length > 1 ? {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: trend.map(t => t.year), axisLabel: { color: '#888', fontSize: 11 }, axisLine: { lineStyle: { color: '#333' } } },
    yAxis: [
      { type: 'value', name: 'Spending', axisLabel: { color: '#888', fontSize: 10, formatter: v => fmtDollars(v) }, splitLine: { lineStyle: { color: '#222' } } },
      { type: 'value', name: 'Vendors', axisLabel: { color: '#888', fontSize: 10 }, splitLine: { show: false } },
    ],
    series: [
      { type: 'bar', data: trend.map(t => t.total_value), itemStyle: { color: '#6366f1', borderRadius: [3,3,0,0] }, barWidth: '60%' },
      { type: 'line', yAxisIndex: 1, data: trend.map(t => t.vendor_count), lineStyle: { color: '#fbbf24', width: 2 }, itemStyle: { color: '#fbbf24' }, symbol: 'circle', symbolSize: 6 },
    ],
  } : null;

  return (
    <tr><td colSpan={7} style={{ padding: 0 }}>
      <div style={{ padding: '16px 20px', background: 'rgba(99,102,241,0.04)', borderTop: '1px solid var(--border-primary)', animation: 'fadeInUp 0.2s ease-out' }}>

        {detailLoading ? (
          <div className="loading-shimmer" style={{ height: 200, borderRadius: 'var(--radius-sm)' }} />
        ) : (
          <>
            {/* Charts row */}
            {(pieOption || trendOption) && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                {pieOption && (
                  <div style={{ flex: '1 1 250px', minWidth: 220, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', padding: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--accent-indigo-light)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Market Share</div>
                    <ReactECharts option={pieOption} style={{ height: 200 }} />
                  </div>
                )}
                {trendOption && (
                  <div style={{ flex: '2 1 350px', minWidth: 300, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', padding: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--accent-indigo-light)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Year-over-Year Spending & Vendor Count</div>
                    <ReactECharts option={trendOption} style={{ height: 200 }} />
                  </div>
                )}
              </div>
            )}

            {/* Vendor table */}
            {vendors.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--accent-indigo-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Top Recipients ({vendors.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {vendors.slice(0, 10).map((v, i) => {
                    const sharePct = v.market_share_pct || 0;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 14, color: i === 0 ? 'var(--status-critical)' : 'var(--text-muted)', width: 24 }}>{i + 1}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{v.vendor}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {v.grant_count || 0} grants · {v.program_count || 0} programs · {v.active_years || 0} yrs
                            {v.province && ` · ${v.province}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--accent-indigo-light)' }}>{fmtDollars(v.total_value)}</div>
                          <div style={{ fontSize: 11, color: sharePct > 50 ? 'var(--status-critical)' : 'var(--text-muted)' }}>{sharePct}% share</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* AI Brief */}
        <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--accent-purple)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            🤖 AI Concentration Intelligence Brief
          </div>
          {briefLoading ? (
            <div className="loading-shimmer" style={{ height: 64, borderRadius: 'var(--radius-sm)' }} />
          ) : brief ? (
            <div style={{
              padding: '12px 16px', background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)',
              borderLeft: '3px solid var(--accent-purple)', borderRadius: 'var(--radius-sm)',
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
            }}>{brief}</div>
          ) : (
            <button onClick={handleBrief} style={{
              padding: '8px 16px', fontSize: 12, border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 'var(--radius-sm)', background: 'rgba(167,139,250,0.08)',
              color: 'var(--accent-purple)', cursor: 'pointer', fontWeight: 500,
            }}>🔍 Generate Intelligence Brief</button>
          )}
        </div>
      </div>
    </td></tr>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */

export default function VendorConcentration() {
  const [dimension, setDimension] = useState('department');
  const [data, setData] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [minSpending, setMinSpending] = useState(1_000_000);
  const [minSpendingInput, setMinSpendingInput] = useState('1000000');
  const [sortBy, setSortBy] = useState('hhi');

  useEffect(() => {
    setStatsLoading(true);
    fetchVendorConcentrationStats()
      .then(d => { setStats(d); setStatsLoading(false); })
      .catch(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    setLoading(true); setExpandedIdx(null);
    fetchVendorConcentration(dimension, minSpending, 50)
      .then(d => { setData(d.results || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dimension, minSpending]);

  const applyMinSpending = () => {
    const v = parseFloat(minSpendingInput);
    if (!isNaN(v) && v >= 0) setMinSpending(v);
  };

  const filtered = useMemo(() => {
    let rows = data;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.group_key || '').toLowerCase().includes(q) ||
        (r.naics_label || '').toLowerCase().includes(q) ||
        (r.top3_names || []).some(n => n.toLowerCase().includes(q))
      );
    }
    // Sort
    rows = [...rows].sort((a, b) => {
      if (sortBy === 'hhi') return (b.hhi || 0) - (a.hhi || 0);
      if (sortBy === 'cr3') return (b.cr3_pct || 0) - (a.cr3_pct || 0);
      if (sortBy === 'spending') return (b.group_total || 0) - (a.group_total || 0);
      if (sortBy === 'vendors') return (a.recipient_count || 0) - (b.recipient_count || 0);
      return 0;
    });
    return rows;
  }, [data, search, sortBy]);

  const highlyConc = filtered.filter(r => r.hhi > 2500).length;
  const dimLabel = dimension === 'naics' ? 'NAICS Sector' : dimension === 'region' ? 'Province' : 'Department';

  return (
    <div className="animate-in">
      {/* Narrative Header */}
      <div style={{
        marginBottom: 24, padding: '24px 28px',
        background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)',
        borderTop: '3px solid var(--accent-indigo)', borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ fontSize: 12, color: 'var(--accent-indigo-light)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Challenge #5 — Vendor Concentration
        </div>
        <div style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-primary)', lineHeight: 1.7, marginBottom: 12 }}>
          In any given category of government spending, how many vendors are actually competing? Across{' '}
          <strong>{statsLoading ? '…' : stats?.total_depts_analyzed || 0}</strong> federal departments,{' '}
          <strong style={{ color: 'var(--status-critical)' }}>{statsLoading ? '…' : stats?.highly_concentrated || 0}</strong>{' '}
          are highly concentrated — a small number of vendors capture a disproportionate share.
          {!statsLoading && stats?.monopoly_programs > 0 && (
            <> There are <strong style={{ color: 'var(--status-critical)' }}>{stats.monopoly_programs.toLocaleString()} monopoly programs</strong> where
            a single recipient receives all funding above $1M.</>
          )}
          {!statsLoading && stats?.locked_in_spending > 0 && (
            <> Locked-in spending: <strong>{fmtDollars(stats.locked_in_spending)}</strong>.</>
          )}
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Depts Analyzed', value: statsLoading ? '…' : stats?.total_depts_analyzed?.toLocaleString() || '—', color: 'var(--accent-indigo-light)' },
            { label: 'Highly Concentrated', value: statsLoading ? '…' : stats?.highly_concentrated?.toLocaleString() || '—', color: 'var(--status-critical)' },
            { label: 'Monopoly Programs', value: statsLoading ? '…' : stats?.monopoly_programs?.toLocaleString() || '—', color: 'var(--accent-amber)' },
            { label: 'Locked-In Spending', value: statsLoading ? '…' : fmtDollars(stats?.locked_in_spending || 0), color: 'var(--text-primary)' },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          Source: Federal Grants &amp; Contributions (Open Canada) · HHI = Σ(market_share²) · CR-3 = top 3 vendor share
        </div>
      </div>

      {/* AI Analysis Panel */}
      <AIAnalysisPanel />

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Dimension tabs */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 2 }}>
          {[
            { id: 'department', label: '🏛️ Department' },
            { id: 'naics', label: '🏭 NAICS Sector' },
            { id: 'region', label: '📍 Province' },
          ].map(t => (
            <button key={t.id} onClick={() => setDimension(t.id)} style={{
              padding: '6px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
              borderRadius: 'var(--radius-sm)',
              background: dimension === t.id ? 'var(--accent-indigo)' : 'transparent',
              color: dimension === t.id ? '#fff' : 'var(--text-secondary)',
              fontWeight: dimension === t.id ? 600 : 400, transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
          background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
          padding: '8px 12px', fontSize: 13, outline: 'none', cursor: 'pointer',
        }}>
          <option value="hhi">Sort: HHI ↓</option>
          <option value="cr3">Sort: CR-3 ↓</option>
          <option value="spending">Sort: Spending ↓</option>
          <option value="vendors">Sort: Fewest Vendors</option>
        </select>

        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}>🔍</span>
          <input type="text" placeholder={`Search ${dimLabel.toLowerCase()} or vendor...`}
            value={search} onChange={e => setSearch(e.target.value)}
            style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
              padding: '8px 12px 8px 32px', fontSize: 13, outline: 'none', width: '100%',
            }}
          />
        </div>

        {/* Min spending */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Min $</span>
          <input type="number" value={minSpendingInput}
            onChange={e => setMinSpendingInput(e.target.value)}
            onBlur={applyMinSpending} onKeyDown={e => e.key === 'Enter' && applyMinSpending()}
            style={{
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
              padding: '8px 12px', fontSize: 13, outline: 'none', width: 120,
            }}
          />
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          {filtered.length} {dimLabel.toLowerCase()}s · {highlyConc} highly concentrated
        </span>
      </div>

      {/* Data Table */}
      <div className="data-table-container">
        <div className="data-table-header">
          <span className="data-table-title">📊 Concentration by {dimLabel} ({filtered.length})</span>
          <span className="badge info">duckdb-live</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading concentration analysis...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No results match your filters. Try lowering the minimum spending.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{dimLabel}</th>
                <th>HHI</th>
                <th>Level</th>
                <th>CR-3</th>
                <th>Total Spending</th>
                <th>Vendors</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const isExpanded = expandedIdx === i;
                const cr3Color = row.cr3_pct > 80 ? 'var(--status-critical)' : row.cr3_pct > 50 ? 'var(--accent-amber)' : 'var(--accent-emerald)';
                const displayName = dimension === 'naics' && row.naics_label
                  ? `${row.naics_label} (${row.group_key})`
                  : row.group_key;
                return (
                  <React.Fragment key={row.group_key || i}>
                    <tr onClick={() => setExpandedIdx(isExpanded ? null : i)}
                      style={{ cursor: 'pointer', background: isExpanded ? 'rgba(99,102,241,0.06)' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{displayName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {(row.top3_names || []).slice(0, 2).join(', ')}{row.top3_names?.length > 2 ? '…' : ''}
                        </div>
                      </td>
                      <td><HHIGauge value={row.hhi} /></td>
                      <td><ConcentrationBadge level={row.concentration_level} /></td>
                      <td>
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
                          borderRadius: 99, fontFamily: 'var(--font-mono)', fontWeight: 700,
                          fontSize: 13, color: cr3Color,
                          background: `${cr3Color}15`, border: `1px solid ${cr3Color}30`,
                        }}>{row.cr3_pct}%</div>
                      </td>
                      <td><span className="funding-amount large">{fmtDollars(row.group_total)}</span></td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: row.recipient_count <= 3 ? 'var(--status-critical)' : 'var(--text-secondary)' }}>
                          {row.recipient_count}
                        </span>
                      </td>
                      <td><span style={{ fontSize: 12, color: 'var(--accent-indigo-light)' }}>{isExpanded ? '▲' : '▼'}</span></td>
                    </tr>
                    {isExpanded && <ExpandedRow row={row} dimension={dimension} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
// ── END CHALLENGE 5 ─────────────────────────────────────────────────────────
