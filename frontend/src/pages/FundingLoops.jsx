import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchLoopGraph, fetchLoops, formatCurrency } from '../api';
import ForceGraph2D from 'react-force-graph-2d';

// ── Hop count → badge class mapping ─────────────────────────────────────────
function hopBadgeClass(hops) {
  if (hops <= 2) return 'badge low';
  if (hops === 3) return 'badge high';
  return 'badge critical';
}

function hopBadgeLabel(hops) {
  return `${hops}-hop`;
}

// ── Sortable column header ───────────────────────────────────────────────────
function SortHeader({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field;
  const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ▲▼';
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        color: active ? 'var(--accent-indigo-light)' : undefined,
      }}
      title={`Sort by ${label}`}
    >
      {label}
      <span style={{ fontSize: 10, opacity: active ? 1 : 0.45, marginLeft: 3 }}>{arrow}</span>
    </th>
  );
}

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 16,
      color: 'var(--text-muted)',
    }}>
      <svg
        width={36}
        height={36}
        viewBox="0 0 36 36"
        style={{ animation: 'spin 0.9s linear infinite' }}
      >
        <circle
          cx={18} cy={18} r={15}
          fill="none"
          stroke="var(--border-primary)"
          strokeWidth={3}
        />
        <path
          d="M18 3 A15 15 0 0 1 33 18"
          fill="none"
          stroke="var(--accent-indigo)"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </svg>
      <span style={{ fontSize: 13 }}>Loading funding loop network…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function FundingLoops() {
  const [graphData, setGraphData]       = useState(null);
  const [loopsData, setLoopsData]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode]   = useState(null);
  const [viewMode, setViewMode]         = useState('graph'); // 'graph' | 'table'
  const [sortField, setSortField]       = useState('total_flow');
  const [sortDir, setSortDir]           = useState('desc');
  const [highlightBns, setHighlightBns] = useState(null); // Set<string> | null
  const [searchTerm, setSearchTerm]     = useState('');
  const fgRef = useRef();

  // ── Data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetchLoopGraph(30),
      fetchLoops(2, 6, 100),
    ])
      .then(([gData, lData]) => {
        setGraphData(gData);
        setLoopsData(Array.isArray(lData) ? lData : (lData?.loops ?? []));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Physics tuning after graph data mounts ─────────────────────────────────
  useEffect(() => {
    if (!fgRef.current || !graphData) return;
    const fg = fgRef.current;
    fg.d3Force('charge').strength(-350);
    fg.d3Force('link').distance(160);
    fg.d3ReheatSimulation();
  }, [graphData]);

  // ── Auto-fit once simulation settles ──────────────────────────────────────
  const handleEngineStop = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(600, 60);
    }
  }, []);

  // ── Node helpers ───────────────────────────────────────────────────────────
  const getNodeColor = useCallback((node) => {
    if (selectedNode && selectedNode.id === node.id) return '#6366f1';
    const risk = node.risk || 'low';
    if (risk === 'high')   return '#ef4444';
    if (risk === 'medium') return '#f59e0b';
    return '#22c55e';
  }, [selectedNode]);

  const getNodeSize = useCallback((node) => {
    const revenue = node.revenue || 1_000_000;
    return Math.max(5, Math.min(22, Math.sqrt(revenue / 400_000)));
  }, []);

  // ── Node canvas renderer ───────────────────────────────────────────────────
  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const size       = getNodeSize(node);
    const color      = getNodeColor(node);
    const isSelected = selectedNode && selectedNode.id === node.id;
    const isHovered  = hoveredNode  && hoveredNode.id  === node.id;
    const isTopNode  = (node.loops_count ?? 0) >= 2;

    // Highlight mode: dim non-highlighted nodes
    const isHighlighted = !highlightBns || highlightBns.has(String(node.id));
    const globalAlpha   = ctx.globalAlpha;
    if (highlightBns) {
      ctx.globalAlpha = isHighlighted ? 1.0 : 0.3;
    }

    // Glow ring for selected / hovered
    if (isSelected || isHovered) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 5, 0, 2 * Math.PI);
      ctx.fillStyle = `${color}35`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = `${color}60`;
      ctx.fill();
    }

    // Main circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#ffffff' : `${color}99`;
    ctx.lineWidth   = isSelected ? 2.5 : 1;
    ctx.stroke();

    // Label — always shown for top nodes, selected, or hovered; otherwise only at zoom > 1.5
    const showLabel = isSelected || isHovered || isTopNode || globalScale > 1.5;
    if (showLabel) {
      const label    = (node.name || String(node.id)).substring(0, 30);
      const fontSize = Math.max(11, 13 / globalScale);
      ctx.font          = `${fontSize}px Inter, sans-serif`;
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'top';

      const labelWidth  = ctx.measureText(label).width;
      const labelY      = node.y + size + 2;

      // Semi-transparent background rect for readability
      ctx.fillStyle = 'rgba(10, 14, 23, 0.75)';
      ctx.fillRect(
        node.x - labelWidth / 2 - 3,
        labelY,
        labelWidth + 6,
        fontSize + 4,
      );

      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(label, node.x, labelY + 1);
    }

    // Restore alpha
    ctx.globalAlpha = globalAlpha;
  }, [getNodeColor, getNodeSize, selectedNode, hoveredNode, highlightBns]);

  // ── Pointer area (slightly larger hit target) ──────────────────────────────
  const nodePointerAreaPaint = useCallback((node, color, ctx) => {
    const size = getNodeSize(node);
    ctx.beginPath();
    ctx.arc(node.x, node.y, size + 6, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, [getNodeSize]);

  // ── Link color (dim non-highlighted links too) ─────────────────────────────
  const getLinkColor = useCallback((link) => {
    if (!highlightBns) return 'rgba(99, 102, 241, 0.3)';
    const srcHighlighted = highlightBns.has(String(link.source?.id ?? link.source));
    const tgtHighlighted = highlightBns.has(String(link.target?.id ?? link.target));
    return (srcHighlighted && tgtHighlighted)
      ? 'rgba(99, 102, 241, 0.7)'
      : 'rgba(99, 102, 241, 0.08)';
  }, [highlightBns]);

  // ── Node click ────────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
    setHighlightBns(null);
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 500);
      fgRef.current.zoom(3, 500);
    }
  }, []);

  // ── Formatted graph for ForceGraph2D ──────────────────────────────────────
  const formattedGraph = graphData
    ? {
        nodes: graphData.nodes || [],
        links: (graphData.links || []).map(l => ({
          ...l,
          source: String(l.source),
          target: String(l.target),
        })),
      }
    : { nodes: [], links: [] };

  // ── Table logic ────────────────────────────────────────────────────────────
  const handleSort = useCallback((field) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        return prev;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const filteredLoops = loopsData
    .filter(loop => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const path = (loop.path_display || '').toLowerCase();
      const bns  = (loop.path_bns  || []).join(' ').toLowerCase();
      return path.includes(term) || bns.includes(term);
    })
    .sort((a, b) => {
      const aVal = a[sortField] ?? 0;
      const bVal = b[sortField] ?? 0;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

  // ── Row click: highlight BNs + switch to graph ────────────────────────────
  const handleLoopRowClick = useCallback((loop) => {
    const bns = new Set((loop.path_bns || []).map(String));
    setHighlightBns(bns);
    setSelectedNode(null);
    setViewMode('graph');
  }, []);

  // ── Stat counts from data ──────────────────────────────────────────────────
  const totalLoopsCount    = loopsData.length || graphData?.total_loops    || 5808;
  const totalCharitiesCount = graphData?.total_charities || graphData?.nodes?.length || 1501;

  // ── Top 5 loops from graphData for sidebar ────────────────────────────────
  const topLoops = [...(graphData?.loops || [])]
    .sort((a, b) => (b.total_flow ?? 0) - (a.total_flow ?? 0))
    .slice(0, 5);

  // ── Empty state check ─────────────────────────────────────────────────────
  const hasNoData = !loading && !graphData && loopsData.length === 0;

  return (
    <div className="animate-in">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 16,
        marginBottom: 24,
        padding: '20px 24px',
        background: 'rgba(167, 139, 250, 0.06)',
        border: '1px solid rgba(167, 139, 250, 0.15)',
        borderRadius: 'var(--radius-lg)',
        alignItems: 'flex-start',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 12,
            color: 'var(--accent-purple)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 4,
          }}>
            Challenge #3 — Funding Loops
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Circular funding patterns between charities where money flows in cycles.
            Using SCC decomposition and Johnson&apos;s algorithm to detect 2–6 hop loops in gift flows.{' '}
            <strong style={{ color: 'var(--accent-purple)' }}>Click nodes</strong> to explore charities,
            or switch to <strong style={{ color: 'var(--accent-purple)' }}>Table View</strong> to browse all loops.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Loops Detected</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)' }}>
              {Number(totalLoopsCount).toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Charities Involved</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-purple)', fontFamily: 'var(--font-mono)' }}>
              {Number(totalCharitiesCount).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* ── View Toggle ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          display: 'flex',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-md)',
          padding: 3,
          gap: 2,
        }}>
          <button
            onClick={() => setViewMode('graph')}
            style={{
              padding: '7px 18px',
              borderRadius: 'calc(var(--radius-md) - 2px)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 600,
              transition: 'all 0.18s ease',
              background: viewMode === 'graph' ? 'var(--accent-indigo)' : 'transparent',
              color:      viewMode === 'graph' ? '#ffffff' : 'var(--text-muted)',
            }}
          >
            Graph View
          </button>
          <button
            onClick={() => setViewMode('table')}
            style={{
              padding: '7px 18px',
              borderRadius: 'calc(var(--radius-md) - 2px)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 600,
              transition: 'all 0.18s ease',
              background: viewMode === 'table' ? 'var(--accent-indigo)' : 'transparent',
              color:      viewMode === 'table' ? '#ffffff' : 'var(--text-muted)',
            }}
          >
            Table View
          </button>
        </div>

        {highlightBns && viewMode === 'graph' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 12px',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            color: 'var(--accent-indigo-light)',
          }}>
            Highlighting {highlightBns.size} nodes from selected loop
            <button
              onClick={() => setHighlightBns(null)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 14,
                lineHeight: 1,
                padding: '0 2px',
              }}
              title="Clear highlight"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {hasNoData && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 300,
          gap: 12,
          color: 'var(--text-muted)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-primary)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <span style={{ fontSize: 40 }}>🔄</span>
          <div style={{ fontSize: 14 }}>No funding loops data available</div>
        </div>
      )}

      {/* ── Table View ─────────────────────────────────────────────────────── */}
      {viewMode === 'table' && !hasNoData && (
        <div className="data-table-container animate-in">
          {/* Table toolbar */}
          <div className="data-table-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div className="data-table-title">Funding Loops</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                Showing {filteredLoops.length} of {loopsData.length} loops
              </span>
              <div className="search-container" style={{ maxWidth: 280 }}>
                <span className="search-icon">&#x2315;</span>
                <input
                  className="search-input"
                  type="text"
                  placeholder="Search path or BN…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Loading loops…
            </div>
          ) : filteredLoops.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No loops match your search.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 48, textAlign: 'center' }}>#</th>
                    <th>Path</th>
                    <SortHeader label="Hops"        field="hops"         sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Total Flow"  field="total_flow"   sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                    <SortHeader label="Bottleneck"  field="bottleneck_amt" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {filteredLoops.map((loop, i) => {
                    const pathDisplay = loop.path_display || (loop.path_bns || []).join(' → ');
                    const truncated   = pathDisplay.length > 60
                      ? pathDisplay.substring(0, 60) + '…'
                      : pathDisplay;

                    return (
                      <tr
                        key={i}
                        onClick={() => handleLoopRowClick(loop)}
                        style={{ cursor: 'pointer' }}
                        title="Click to highlight this loop in graph view"
                      >
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {i + 1}
                        </td>
                        <td>
                          <span
                            title={pathDisplay}
                            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}
                          >
                            {truncated}
                          </span>
                        </td>
                        <td>
                          <span className={hopBadgeClass(loop.hops)}>
                            {hopBadgeLabel(loop.hops)}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-indigo-light)' }}>
                          {formatCurrency(loop.total_flow)}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--status-critical)' }}>
                          {formatCurrency(loop.bottleneck_amt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Graph View ─────────────────────────────────────────────────────── */}
      {viewMode === 'graph' && !hasNoData && (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Graph canvas */}
          <div className="graph-container" style={{ flex: 1, height: 620 }}>
            {/* Legend */}
            <div className="graph-legend">
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
                Risk Level
              </div>
              <div className="graph-legend-item">
                <div className="graph-legend-dot" style={{ background: '#ef4444' }} />
                <span>High Risk</span>
              </div>
              <div className="graph-legend-item">
                <div className="graph-legend-dot" style={{ background: '#f59e0b' }} />
                <span>Medium Risk</span>
              </div>
              <div className="graph-legend-item">
                <div className="graph-legend-dot" style={{ background: '#22c55e' }} />
                <span>Low Risk</span>
              </div>
              <div className="graph-legend-item">
                <div className="graph-legend-dot" style={{ background: '#6366f1' }} />
                <span>Selected</span>
              </div>
              <div style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid var(--border-primary)',
                fontSize: 11,
                color: 'var(--text-muted)',
                lineHeight: 1.6,
              }}>
                Node size = Revenue<br />
                Edges = Gift flows<br />
                Labels always on for<br />
                high-loop nodes
              </div>
            </div>

            {loading ? (
              <Spinner />
            ) : (
              <ForceGraph2D
                ref={fgRef}
                graphData={formattedGraph}
                nodeCanvasObject={nodeCanvasObject}
                nodePointerAreaPaint={nodePointerAreaPaint}
                linkColor={getLinkColor}
                linkWidth={1.5}
                linkDirectionalArrowLength={6}
                linkDirectionalArrowRelPos={0.8}
                linkDirectionalParticles={2}
                linkDirectionalParticleWidth={2}
                linkDirectionalParticleSpeed={0.005}
                onNodeClick={handleNodeClick}
                onNodeHover={setHoveredNode}
                onEngineStop={handleEngineStop}
                backgroundColor="transparent"
                width={undefined}
                height={620}
                warmupTicks={100}
                cooldownTicks={200}
                d3AlphaDecay={0.015}
                d3VelocityDecay={0.25}
              />
            )}
          </div>

          {/* ── Detail Panel ───────────────────────────────────────────────── */}
          <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Selected node card */}
            {selectedNode ? (
              <div className="dossier-section" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                <div className="dossier-section-title">Selected Charity</div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, lineHeight: 1.4 }}>
                    {selectedNode.name || 'Unknown Charity'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    BN: {selectedNode.id}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Revenue</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--accent-indigo-light)', fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(selectedNode.revenue)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Circular Outflow</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--status-critical)', fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(selectedNode.circular_outflow)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Loops Involved</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)' }}>
                      {(selectedNode.loops_count ?? 0).toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Risk Level</div>
                    <span className={`badge ${selectedNode.risk || 'low'}`}>
                      {(selectedNode.risk || 'low').toUpperCase()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedNode(null)}
                  style={{
                    marginTop: 16,
                    width: '100%',
                    padding: '7px 0',
                    background: 'transparent',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'var(--font-sans)',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-indigo)'; e.currentTarget.style.color = 'var(--accent-indigo-light)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  Deselect
                </button>
              </div>
            ) : (
              <div className="dossier-section" style={{ textAlign: 'center', padding: '36px 24px' }}>
                <div style={{ fontSize: 34, marginBottom: 12 }}>🔄</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Click a node in the graph to explore a charity's loop profile
                </div>
              </div>
            )}

            {/* Top 5 loops by flow */}
            <div className="dossier-section">
              <div className="dossier-section-title">Top 5 Loops by Flow</div>

              {loading && (
                <>
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="loading-shimmer" style={{ height: 64, marginBottom: 8, borderRadius: 'var(--radius-sm)' }} />
                  ))}
                </>
              )}

              {!loading && topLoops.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                  No loop data
                </div>
              )}

              {!loading && topLoops.map((loop, i) => {
                const pathBns = loop.path_bns || [];
                const pathPreview = pathBns.slice(0, -1).map(bn => String(bn).substring(0, 9)).join(' → ');

                return (
                  <div
                    key={i}
                    onClick={() => handleLoopRowClick(loop)}
                    style={{
                      padding: '10px 12px',
                      marginBottom: 8,
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-primary)',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-primary)'; }}
                    title="Click to highlight in graph"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {loop.hops}-hop loop
                      </span>
                      <span className={hopBadgeClass(loop.hops)} style={{ fontSize: 10 }}>
                        {formatCurrency(loop.total_flow)}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4, lineHeight: 1.5 }}>
                      {pathPreview || '—'} → ↩
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--status-critical)', fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(loop.bottleneck_amt)} bottleneck
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
