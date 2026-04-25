import { useState, useEffect, useRef, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchLoops, fetchLoopGraph, fetchLoopsStats, fetchLoopCharities, fetchLoopsStatsEnriched, fetchLoopDetail, fetchLoopsEnriched, formatCurrency, formatNumber, fmtDollars, classificationBadge } from '../api';

const RISK_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const PAGE_SIZE = 20;

function RangeSlider({ label, min, max, value, onChange, format }) {
  return (
    <div className="filter-slider-group">
      <div className="filter-slider-header">
        <span className="filter-label">{label}</span>
        <span className="filter-value">{format ? format(value) : value}</span>
      </div>
      <input
        type="range" min={min} max={max}
        value={Math.min(value, max)}
        onChange={e => onChange(Number(e.target.value))}
        className="filter-range"
      />
      <div className="filter-range-bounds">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

function DualRangeSlider({ label, min, max, value, onChange }) {
  const [lo, hi] = value;
  const range = max - min || 1;
  const lowPct = ((lo - min) / range) * 100;
  const highPct = ((hi - min) / range) * 100;
  return (
    <div className="filter-slider-group">
      <div className="filter-slider-header">
        <span className="filter-label">{label}</span>
        <span className="filter-value">{lo} – {hi}</span>
      </div>
      <div style={{ position: 'relative', height: 32, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', width: '100%', height: 4, background: 'var(--border-primary)', borderRadius: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: `${lowPct}%`, width: `${Math.max(0, highPct - lowPct)}%`, height: 4, background: 'var(--accent-purple)', borderRadius: 2, pointerEvents: 'none' }} />
        <input type="range" min={min} max={max} value={lo}
          onChange={e => { const v = Math.min(Number(e.target.value), hi); onChange([v, hi]); }}
          className="filter-range dual-range"
          style={{ position: 'absolute', width: '100%', zIndex: lo === hi ? 5 : 3 }}
        />
        <input type="range" min={min} max={max} value={hi}
          onChange={e => { const v = Math.max(Number(e.target.value), lo); onChange([lo, v]); }}
          className="filter-range dual-range"
          style={{ position: 'absolute', width: '100%', zIndex: 4 }}
        />
      </div>
      <div className="filter-range-bounds">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function buildSuspicionTooltip(loop) {
  const score = loop.suspicion_score ?? null;
  if (score === null) return undefined;
  const parts = [];
  if (loop.same_year) parts.push('Same-year loop (+3)');
  if ((loop.avg_circular_pct || 0) > 0.30) parts.push(`High circular outflow ${((loop.avg_circular_pct || 0) * 100).toFixed(0)}% (+2)`);
  if ((loop.avg_program_pct || 0) > 0 && (loop.avg_program_pct || 0) < 0.40) parts.push(`Low program delivery ${((loop.avg_program_pct || 0) * 100).toFixed(0)}% (+2)`);
  if ((loop.hops || 0) <= 3 && !loop.has_hub) parts.push('Short loop (+1)');
  if (loop.has_hub) parts.push('Known hub org (−3)');
  return `Suspicion score ${score}/8${parts.length ? ' · ' + parts.join(' · ') : ''}`;
}

function FilterPanel({ hopsRange, setHopsRange, maxHops, flowMax, maxFlow, setMaxFlow,
  sameYearOnly, setSameYearOnly, riskFilter, setRiskFilter, searchTerm, setSearchTerm, resultCount }) {
  return (
    <aside className="filter-panel">
      <div className="filter-panel-header">
        <span style={{ fontWeight: 700, fontSize: 13 }}>Filters</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{resultCount != null ? `${resultCount} loops` : '…'}</span>
      </div>

      <div className="filter-section">
        <DualRangeSlider
          label="Hops (cycle length)"
          min={2} max={maxHops || 6}
          value={hopsRange}
          onChange={setHopsRange}
        />
      </div>

      <div className="filter-section">
        <RangeSlider
          label="Max Total Flow"
          min={0} max={flowMax || 5_000_000}
          value={maxFlow}
          onChange={setMaxFlow}
          format={v => v === 0 ? 'No limit' : formatCurrency(v)}
        />
      </div>

      <div className="filter-section">
        <div className="filter-label" style={{ marginBottom: 10 }}>Risk Level</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['', 'high', 'medium', 'low'].map(r => (
            <button
              key={r}
              className={`filter-chip ${riskFilter === r ? 'active' : ''}`}
              style={riskFilter === r && r ? { background: RISK_COLOR[r] + '22', borderColor: RISK_COLOR[r], color: RISK_COLOR[r] } : {}}
              onClick={() => setRiskFilter(r)}
            >
              {r === '' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-section">
        <label className="filter-toggle">
          <input type="checkbox" checked={sameYearOnly} onChange={e => setSameYearOnly(e.target.checked)} />
          <span className="filter-toggle-track" />
          <span className="filter-label">Same-year only</span>
        </label>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          All donations in a single fiscal year — indicates receipt inflation
        </div>
      </div>

      <div className="filter-section">
        <div className="filter-label" style={{ marginBottom: 8 }}>Search</div>
        <input
          className="filter-search"
          placeholder="Charity name or BN…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>
    </aside>
  );
}

function StatsBar({ stats, loading }) {
  const suspiciousCount = (stats?.high_alert_count ?? 0) + (stats?.suspicious_count ?? 0);
  const items = [
    { label: 'Circular Loops', value: stats?.total_loops, format: formatNumber, color: 'var(--accent-purple)' },
    { label: 'Total Flow', value: stats?.total_flow, format: fmtDollars, color: 'var(--accent-indigo)' },
    { label: 'Same-Year Loops', value: stats?.same_year_count, format: formatNumber, color: 'var(--status-medium)' },
    { label: 'High Risk', value: stats?.high_risk_count, format: formatNumber, color: 'var(--status-critical)' },
    { label: 'Suspicious Loops', value: suspiciousCount, format: formatNumber, color: 'var(--status-medium)', title: 'High Alert + Suspicious classifications' },
    { label: 'Phantom Receipts', value: stats?.phantom_receipts_total, format: fmtDollars, color: 'var(--status-critical)', title: 'Estimated charitable tax receipts generated by same-year circular loops (total_flow × hops)' },
  ];
  return (
    <div className="loops-stats-bar">
      {items.map(item => (
        <div key={item.label} className="loops-stat-item" title={item.title}>
          <div className="loops-stat-value" style={{ color: item.color }}>
            {loading ? '…' : (item.value != null ? item.format(item.value) : '—')}
          </div>
          <div className="loops-stat-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function LoopsTable({ loops, searchTerm, page, setPage, selectedLoop, setSelectedLoop, sortField, setSortField, sortDir, setSortDir, expandedLoopId, expandedDetail, detailLoading, onRowClick }) {
  const filtered = loops.filter(l => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return (l.path_display || '').toLowerCase().includes(s) ||
      (l.path_bns || []).some(bn => bn.includes(searchTerm));
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = parseFloat(a[sortField]) || 0;
    const bv = parseFloat(b[sortField]) || 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortTh = ({ field, children, title }) => (
    <th onClick={() => toggleSort(field)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title={title}>
      {children} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );

  return (
    <div>
      <div className="data-table-container" style={{ marginBottom: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Path</th>
              <SortTh field="hops">Hops</SortTh>
              <SortTh field="total_flow">Total Flow</SortTh>
              <SortTh field="bottleneck_amt">Bottleneck</SortTh>
              <th>Same-Year</th>
              <SortTh field="suspicion_score" title="Risk classification based on same-year timing, circular outflow ratio, and program delivery rate">Suspicion</SortTh>
              <SortTh field="phantom_receipts" title="Estimated tax receipts this loop generates (total_flow × hops). Non-zero only for same-year loops.">Phantom Receipts</SortTh>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((loop, i) => {
              const rank = (page - 1) * PAGE_SIZE + i + 1;
              const isOpen = selectedLoop?.id === loop.id;
              const isExpanded = expandedLoopId === loop.id;
              const risk = loop.risk_level || 'low';
              const badge = classificationBadge(loop.classification);
              const phantomAmt = parseFloat(loop.phantom_receipts) || 0;
              return [
                <tr
                  key={loop.id}
                  onClick={() => { setSelectedLoop(isOpen ? null : loop); if (onRowClick) onRowClick(loop); }}
                  style={{ cursor: 'pointer', background: isOpen ? 'var(--bg-tertiary)' : undefined }}
                >
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{rank}</td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}
                    title={loop.path_display}>
                    {loop.path_display || '—'}
                  </td>
                  <td>
                    <span className={`badge ${risk}`} style={{ fontSize: 11 }}>{loop.hops}</span>
                  </td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {fmtDollars(parseFloat(loop.total_flow) || 0)}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {fmtDollars(parseFloat(loop.bottleneck_amt) || 0)}
                  </td>
                  <td>
                    {loop.same_year
                      ? <span className="badge critical" style={{ fontSize: 11 }}>Yes ⚠️</span>
                      : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No</span>}
                  </td>
                  <td>
                    <span
                      title={buildSuspicionTooltip(loop)}
                      style={{
                        background: `${badge.color}22`,
                        color: badge.color,
                        border: `1px solid ${badge.color}`,
                        borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                        cursor: loop.suspicion_score != null ? 'help' : 'default',
                      }}
                    >
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: phantomAmt > 0 ? 'var(--status-critical)' : 'var(--text-muted)' }}>
                    {phantomAmt > 0 ? fmtDollars(phantomAmt) : '—'}
                  </td>
                  <td>
                    <span className={`badge ${risk}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>{risk}</span>
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${loop.id}-detail`}>
                    <td colSpan={9} style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-primary)' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Full path (BN chain):</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {(loop.path_bns || []).map((bn, j) => (
                          <span key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 4 }}>{bn}</span>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        {[
                          { label: 'Total Flow', value: fmtDollars(parseFloat(loop.total_flow) || 0) },
                          { label: 'Bottleneck', value: fmtDollars(parseFloat(loop.bottleneck_amt) || 0) },
                          { label: 'Min Year', value: loop.min_year || '—' },
                          { label: 'Max Year', value: loop.max_year || '—' },
                        ].map(kv => (
                          <div key={kv.label}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{kv.label}</div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{kv.value}</div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ),
                isExpanded && (
                  <tr key={`${loop.id}-expanded`}>
                    <td colSpan={9} style={{ padding: '14px 18px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-primary)' }}>
                      {detailLoading ? (
                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Loading participant details...</div>
                      ) : expandedDetail?.participants?.length > 0 ? (
                        <div>
                          {/* Follow The Money header */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--accent-purple)' }}>Follow The Money</span>
                            {loop.same_year && (
                              <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--status-critical)', fontWeight: 600 }}>
                                ⚠️ Same-year loop — CRA could see <strong>{fmtDollars(parseFloat(loop.phantom_receipts) || 0)}</strong> in receipts for <strong>{fmtDollars(parseFloat(loop.total_flow) || 0)}</strong> actual flow
                              </span>
                            )}
                          </div>
                          {/* Hop-by-hop chain */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {expandedDetail.participants.map((p, idx) => (
                              <div key={p.bn || idx}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border-primary)' }}>
                                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{idx + 1}</div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.bn}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.bn}</div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                                    <div style={{ textAlign: 'center', width: 90 }}>
                                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Circular Outflow</div>
                                      <div style={{ width: '100%', height: 5, background: 'var(--border-primary)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.min(100, (p.circular_outflow_pct || 0) * 100)}%`, height: '100%', background: (p.circular_outflow_pct || 0) > 0.3 ? 'var(--status-critical)' : 'var(--accent-purple)', borderRadius: 3 }} />
                                      </div>
                                      <div style={{ fontSize: 11, color: (p.circular_outflow_pct || 0) > 0.3 ? 'var(--status-critical)' : 'var(--text-secondary)', marginTop: 2, fontWeight: 600 }}>{((p.circular_outflow_pct || 0) * 100).toFixed(0)}%</div>
                                    </div>
                                    <div style={{ textAlign: 'center', width: 90 }}>
                                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>To Programs</div>
                                      <div style={{ width: '100%', height: 5, background: 'var(--border-primary)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.min(100, (p.program_pct || 0) * 100)}%`, height: '100%', background: (p.program_pct || 0) < 0.3 ? 'var(--status-critical)' : 'var(--accent-cyan)', borderRadius: 3 }} />
                                      </div>
                                      <div style={{ fontSize: 11, color: (p.program_pct || 0) < 0.3 ? 'var(--status-critical)' : 'var(--text-secondary)', marginTop: 2, fontWeight: 600 }}>{((p.program_pct || 0) * 100).toFixed(0)}%</div>
                                    </div>
                                  </div>
                                </div>
                                {idx < expandedDetail.participants.length - 1 ? (
                                  <div style={{ padding: '3px 26px', fontSize: 13, color: 'var(--accent-purple)', opacity: 0.8 }}>↓ transfers to</div>
                                ) : (
                                  <div style={{ padding: '3px 26px', fontSize: 12, color: 'var(--status-critical)', fontWeight: 700 }}>↩ returns to Hop 1 — loop closes</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No participant details available</div>
                      )}
                    </td>
                  </tr>
                )
              ];
            })}
            {paged.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                No loops match the current filters
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Page {page} of {totalPages} · {sorted.length.toLocaleString()} results
          </span>
          <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

function GraphTab({ graphData }) {
  const [selectedNode, setSelectedNode] = useState(null);
  const chartRef = useRef(null);

  const nodes = (graphData?.nodes || []).slice(0, 25);
  const nodeIds = new Set(nodes.map(n => n.bn || n.id));
  const links = (graphData?.links || []).filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        if (params.dataType === 'node') {
          const n = params.data._raw;
          return `<div style="font-family:var(--font-sans);font-size:12px;max-width:200px">
            <strong>${n.name}</strong><br/>
            Loops: ${n.loops_count}<br/>
            Revenue: ${formatCurrency(n.revenue)}<br/>
            Circular outflow: ${formatCurrency(n.circular_outflow)}<br/>
            Risk: <span style="text-transform:capitalize;color:${RISK_COLOR[n.risk]}">${n.risk}</span>
          </div>`;
        }
        if (params.dataType === 'edge') {
          return `Flow: ${formatCurrency(params.data.value || 0)}`;
        }
        return '';
      },
      backgroundColor: '#111827',
      borderColor: 'rgba(55,65,81,0.5)',
      textStyle: { color: '#f1f5f9' },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      animation: true,
      force: {
        repulsion: 400,
        edgeLength: [100, 200],
        gravity: 0.1,
        layoutAnimation: true,
      },
      data: nodes.map(n => ({
        id: n.bn || n.id,
        name: (n.name || '').length > 22 ? (n.name || '').slice(0, 20) + '…' : (n.name || ''),
        symbolSize: Math.min(30, Math.max(8, Math.sqrt((n.revenue || 0) / 200_000) * 10 + 6)),
        itemStyle: {
          color: RISK_COLOR[n.risk] || RISK_COLOR.low,
          borderColor: '#fff',
          borderWidth: 1,
          shadowBlur: n.risk === 'high' ? 12 : 4,
          shadowColor: RISK_COLOR[n.risk] || RISK_COLOR.low,
        },
        label: {
          show: true,
          formatter: '{b}',
          fontSize: 10,
          color: '#f1f5f9',
          distance: 6,
        },
        emphasis: { itemStyle: { borderWidth: 3, borderColor: '#fff' } },
        _raw: n,
      })),
      links: links.map(l => ({
        source: l.source,
        target: l.target,
        value: l.flow || 0,
        lineStyle: {
          width: Math.min(4, Math.max(1, Math.log10((l.flow || 1) + 1) - 1)),
          curveness: 0.25,
          opacity: 0.7,
          color: 'source',
        },
        emphasis: { lineStyle: { width: 4, opacity: 1 } },
      })),
      lineStyle: { color: 'source', curveness: 0.2 },
      emphasis: { focus: 'adjacency' },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: 8,
    }],
  };

  const onEvents = {
    click: (params) => {
      if (params.dataType === 'node') {
        setSelectedNode(params.data._raw);
      }
    },
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: 540 }}>
      <div style={{ flex: 1, position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, fontSize: 11, color: 'var(--text-muted)' }}>
          Showing top {nodes.length} charities · Scroll to zoom · Drag to pan
        </div>
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(RISK_COLOR).map(([risk, color]) => (
            <div key={risk} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
              {risk.charAt(0).toUpperCase() + risk.slice(1)} risk
            </div>
          ))}
        </div>
        <ReactECharts
          ref={chartRef}
          option={option}
          onEvents={onEvents}
          style={{ width: '100%', height: '100%' }}
          notMerge={false}
          lazyUpdate={true}
        />
      </div>

      {selectedNode && (
        <div style={{ width: 240, background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, flex: 1, marginRight: 8 }}>{selectedNode.name}</div>
            <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <span className={`badge ${selectedNode.risk}`} style={{ alignSelf: 'flex-start', textTransform: 'capitalize' }}>{selectedNode.risk} risk</span>
          {[
            { label: 'BN', value: selectedNode.bn, mono: true },
            { label: 'Loops involved', value: selectedNode.loops_count },
            { label: 'Revenue', value: formatCurrency(selectedNode.revenue) },
            { label: 'Circular outflow', value: formatCurrency(selectedNode.circular_outflow) },
            { label: 'Outflow ratio', value: selectedNode.revenue > 0 ? ((selectedNode.circular_outflow / selectedNode.revenue) * 100).toFixed(1) + '%' : '—' },
          ].map(kv => (
            <div key={kv.label}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{kv.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: kv.mono ? 'var(--font-mono)' : undefined }}>{kv.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CharitiesTab({ charities, loading }) {
  const [riskFilter, setRiskFilter] = useState('');
  const [search, setSearch] = useState('');

  const filtered = charities.filter(c => {
    if (riskFilter && c.risk !== riskFilter) return false;
    if (search && !(c.name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="filter-search" placeholder="Search charity…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ width: 220 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {['', 'high', 'medium', 'low'].map(r => (
            <button key={r}
              className={`filter-chip ${riskFilter === r ? 'active' : ''}`}
              style={riskFilter === r && r ? { background: RISK_COLOR[r] + '22', borderColor: RISK_COLOR[r], color: RISK_COLOR[r] } : {}}
              onClick={() => setRiskFilter(r)}
            >
              {r === '' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {filtered.length} charities
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {[...Array(8)].map((_, i) => <div key={i} className="loading-shimmer" style={{ height: 140, borderRadius: 'var(--radius-md)' }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.map(c => (
            <div key={c.bn} className="loop-charity-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, flex: 1, marginRight: 8 }}
                  title={c.name}>{(c.name || '').length > 40 ? c.name.slice(0, 38) + '…' : c.name}</div>
                <span className={`badge ${c.risk}`} style={{ fontSize: 10, flexShrink: 0, textTransform: 'capitalize' }}>{c.risk}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                {[
                  { label: 'Loops', value: c.loops_count, color: 'var(--accent-purple)' },
                  { label: 'Circ. Outflow', value: formatCurrency(c.circular_outflow) },
                  { label: 'Revenue', value: formatCurrency(c.revenue) },
                  { label: 'Outflow %', value: c.revenue > 0 ? ((c.circular_outflow / c.revenue) * 100).toFixed(1) + '%' : '—', color: c.outflow_pct > 0.5 ? 'var(--status-critical)' : undefined },
                ].map(kv => (
                  <div key={kv.label}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{kv.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: kv.color }}>{kv.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.bn}</div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
              No charities match the current filters
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FundingLoops() {
  // ── Filter state ──────────────────────────────────────────────────────────
  const [hopsRange, setHopsRange] = useState([2, 6]);
  const [maxFlow, setMaxFlow] = useState(0);
  const [sameYearOnly, setSameYearOnly] = useState(false);
  const [riskFilter, setRiskFilter] = useState('');
  const [classification, setClassification] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // ── Data state ────────────────────────────────────────────────────────────
  const [loopsData, setLoopsData] = useState([]);
  const [graphData, setGraphData] = useState(null);
  const [charities, setCharities] = useState([]);
  const [statsData, setStatsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [graphLoading, setGraphLoading] = useState(false);
  const [charitiesLoading, setCharitiesLoading] = useState(true);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('table');
  const [selectedLoop, setSelectedLoop] = useState(null);
  const [expandedLoopId, setExpandedLoopId] = useState(null);
  const [expandedDetail, setExpandedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sortField, setSortField] = useState('total_flow');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  // ── Initial load: stats + charities + first loops batch ───────────────────
  useEffect(() => {
    fetchLoopsStatsEnriched()
      .then(setStatsData)
      .catch(() => setStatsData({ total_loops: 0, total_flow: 0, same_year_count: 0, high_risk_count: 0, max_flow: 5_000_000, max_hops: 6, phantom_receipts_total: 0, high_alert_count: 0, suspicious_count: 0 }));

    fetchLoopCharities(100)
      .then(setCharities)
      .catch(() => {})
      .finally(() => setCharitiesLoading(false));

    fetchLoopsEnriched(2, 6, 0, 0, false, '', '', 200)
      .then(d => setLoopsData(d.results ?? d.loops ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));

    fetchLoopGraph(25)
      .then(setGraphData)
      .catch(() => {});
  }, []);

  // ── Refetch loops when filters change (debounced 400ms, skip initial mount) ─
  const filtersRef = useRef({ hopsRange, maxFlow, sameYearOnly, riskFilter, classification });
  filtersRef.current = { hopsRange, maxFlow, sameYearOnly, riskFilter, classification };
  const isMountedRef = useRef(false);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      const { hopsRange, maxFlow, sameYearOnly, riskFilter, classification } = filtersRef.current;
      setLoading(true);
      setPage(1);
      fetchLoopsEnriched(hopsRange[0], hopsRange[1], 0, maxFlow, sameYearOnly, riskFilter, classification, 200)
        .then(d => setLoopsData(d.results ?? d.loops ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [hopsRange, maxFlow, sameYearOnly, riskFilter, classification]);

  const TABS = [
    { id: 'table', label: '📋 Loops Table' },
    { id: 'graph', label: '🕸️ Network Graph' },
    { id: 'charities', label: '🏛️ Top Charities' },
    { id: 'suspicious_tab', label: '🔴 Suspicious Loops' },
  ];

  const flowMax = statsData?.max_flow || 5_000_000;

  // Handle row click for expanded detail
  const handleRowClick = (row) => {
    if (expandedLoopId === row.id) {
      setExpandedLoopId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedLoopId(row.id);
    setDetailLoading(true);
    fetchLoopDetail(row.id)
      .then(setExpandedDetail)
      .catch(() => setExpandedDetail(null))
      .finally(() => setDetailLoading(false));
  };

  // Classification filter buttons
  const classificationOptions = [
    { key: '', label: 'All Loops' },
    { key: 'high_alert', label: '🔴 High Alert', count: statsData?.high_alert_count },
    { key: 'suspicious', label: '🟡 Suspicious', count: statsData?.suspicious_count },
    { key: 'normal', label: '✅ Normal', count: statsData?.normal_count },
  ];

  // Handle tab changes including suspicious tab
  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    if (tab === 'graph' && !graphData) {
      setGraphLoading(true);
      fetchLoopGraph(25)
        .then(setGraphData)
        .catch(() => {})
        .finally(() => setGraphLoading(false));
    }
    if (tab === 'suspicious_tab') {
      setClassification('high_alert,suspicious');
    }
  }, [graphData]);

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StatsBar stats={statsData} loading={!statsData} />

      {/* Classification filter buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {classificationOptions.map(opt => (
          <button
            key={opt.key}
            onClick={() => setClassification(opt.key)}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${classification === opt.key ? 'var(--accent-purple)' : 'var(--border-primary)'}`,
              background: classification === opt.key ? 'var(--accent-purple)' : 'var(--bg-tertiary)',
              color: classification === opt.key ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {opt.label}{opt.count != null ? ` (${opt.count.toLocaleString()})` : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <FilterPanel
          hopsRange={hopsRange} setHopsRange={setHopsRange}
          maxHops={statsData?.max_hops || 6}
          flowMax={flowMax}
          maxFlow={maxFlow} setMaxFlow={setMaxFlow}
          sameYearOnly={sameYearOnly} setSameYearOnly={setSameYearOnly}
          riskFilter={riskFilter} setRiskFilter={setRiskFilter}
          searchTerm={searchTerm} setSearchTerm={setSearchTerm}
          resultCount={loading ? null : loopsData.length}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border-primary)', paddingBottom: 0 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                style={{
                  padding: '8px 16px',
                  fontSize: 13, fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '2px solid var(--accent-purple)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--accent-purple)' : 'var(--text-muted)',
                  marginBottom: -1,
                  transition: 'color var(--transition-fast)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {(activeTab === 'table' || activeTab === 'suspicious_tab') && (
            loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...Array(8)].map((_, i) => <div key={i} className="loading-shimmer" style={{ height: 44, borderRadius: 6 }} />)}
              </div>
            ) : (
              <LoopsTable
                loops={activeTab === 'suspicious_tab'
                  ? loopsData.filter(l => (l.suspicion_score ?? 0) >= 3).sort((a, b) => (b.phantom_receipts || 0) - (a.phantom_receipts || 0))
                  : loopsData}
                searchTerm={searchTerm}
                page={page} setPage={setPage}
                selectedLoop={selectedLoop} setSelectedLoop={setSelectedLoop}
                sortField={sortField} setSortField={setSortField}
                sortDir={sortDir} setSortDir={setSortDir}
                expandedLoopId={expandedLoopId}
                expandedDetail={expandedDetail}
                detailLoading={detailLoading}
                onRowClick={handleRowClick}
              />
            )
          )}

          {activeTab === 'graph' && (
            graphLoading ? (
              <div className="loading-shimmer" style={{ height: 540, borderRadius: 'var(--radius-lg)' }} />
            ) : (
              <GraphTab graphData={graphData} />
            )
          )}

          {activeTab === 'charities' && (
            <CharitiesTab charities={charities} loading={charitiesLoading} />
          )}
        </div>
      </div>
    </div>
  );
}
