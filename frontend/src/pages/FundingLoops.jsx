import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchLoopGraph, formatCurrency } from '../api';
import ForceGraph2D from 'react-force-graph-2d';

export default function FundingLoops() {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const fgRef = useRef();

  useEffect(() => {
    fetchLoopGraph(50)
      .then(setGraphData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const nodeColor = useCallback((node) => {
    if (selectedNode && selectedNode.id === node.id) return '#6366f1';
    const risk = node.risk || 'low';
    if (risk === 'high') return '#ef4444';
    if (risk === 'medium') return '#f59e0b';
    return '#22c55e';
  }, [selectedNode]);

  const nodeSize = useCallback((node) => {
    const revenue = node.revenue || 1_000_000;
    return Math.max(4, Math.min(20, Math.sqrt(revenue / 500_000)));
  }, []);

  const linkColor = useCallback(() => 'rgba(99, 102, 241, 0.3)', []);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 500);
      fgRef.current.zoom(3, 500);
    }
  }, []);

  const nodeCanvasObject = useCallback((node, ctx, globalScale) => {
    const size = nodeSize(node);
    const color = nodeColor(node);
    const isSelected = selectedNode && selectedNode.id === node.id;
    const isHovered = hoveredNode && hoveredNode.id === node.id;

    // Glow effect
    if (isSelected || isHovered) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI);
      ctx.fillStyle = `${color}40`;
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#fff' : `${color}80`;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();

    // Label
    if (globalScale > 1.5 || isSelected || isHovered) {
      const label = node.name || node.id;
      const fontSize = Math.max(10, 12 / globalScale);
      ctx.font = `${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(label.substring(0, 25), node.x, node.y + size + 3);
    }
  }, [nodeColor, nodeSize, selectedNode, hoveredNode]);

  const formattedGraph = graphData ? {
    nodes: graphData.nodes || [],
    links: (graphData.links || []).map(l => ({
      ...l,
      source: String(l.source),
      target: String(l.target),
    }))
  } : { nodes: [], links: [] };

  return (
    <div className="animate-in">
      {/* Header */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 24,
        padding: '20px 24px',
        background: 'rgba(167, 139, 250, 0.06)',
        border: '1px solid rgba(167, 139, 250, 0.15)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--accent-purple)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Challenge #3 — Funding Loops
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Circular funding patterns between charities where money flows in cycles.
            Using SCC decomposition and Johnson's algorithm to detect 2-6 hop loops in gift flows.
            <strong style={{ color: 'var(--accent-purple)' }}> Click nodes</strong> to explore individual charities.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loops Detected</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-purple)' }}>5,808</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Charities Involved</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent-purple)' }}>1,501</div>
          </div>
        </div>
      </div>

      {/* Graph + Details */}
      <div style={{ display: 'flex', gap: 20 }}>
        {/* Graph */}
        <div className="graph-container" style={{ flex: 1, height: 600 }}>
          <div className="graph-legend">
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>Risk Level</div>
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
            <div className="graph-legend-item" style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              Node size = Revenue<br />
              Edges = Gift flows
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              Loading funding loop network...
            </div>
          ) : (
            <ForceGraph2D
              ref={fgRef}
              graphData={formattedGraph}
              nodeCanvasObject={nodeCanvasObject}
              nodePointerAreaPaint={(node, color, ctx) => {
                const size = nodeSize(node);
                ctx.beginPath();
                ctx.arc(node.x, node.y, size + 5, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();
              }}
              linkColor={linkColor}
              linkWidth={2}
              linkDirectionalArrowLength={6}
              linkDirectionalArrowRelPos={0.8}
              linkDirectionalParticles={2}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticleSpeed={0.005}
              onNodeClick={handleNodeClick}
              onNodeHover={setHoveredNode}
              backgroundColor="transparent"
              width={undefined}
              height={600}
              d3AlphaDecay={0.02}
              d3VelocityDecay={0.3}
              warmupTicks={80}
              cooldownTicks={100}
            />
          )}
        </div>

        {/* Detail Panel */}
        <div style={{ width: 320, flexShrink: 0 }}>
          {selectedNode ? (
            <div className="dossier-section" style={{ animation: 'fadeInUp 0.3s' }}>
              <div className="dossier-section-title">Selected Charity</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{selectedNode.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  BN: {selectedNode.id}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Revenue</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-indigo-light)' }}>
                    {formatCurrency(selectedNode.revenue)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Circular Outflow</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--status-critical)' }}>
                    {formatCurrency(selectedNode.circular_outflow)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loops Involved</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-amber)' }}>
                    {selectedNode.loops_count || 0}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Risk Level</div>
                  <span className={`badge ${selectedNode.risk || 'low'}`}>
                    {(selectedNode.risk || 'low').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="dossier-section" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔄</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Click a node in the graph to see charity details
              </div>
            </div>
          )}

          {/* Loop Table */}
          <div className="dossier-section" style={{ marginTop: 16 }}>
            <div className="dossier-section-title">Top Loops by Flow</div>
            {(graphData?.loops || []).slice(0, 5).map((loop, i) => (
              <div key={i} style={{
                padding: '10px 12px', marginBottom: 8,
                background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-primary)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {loop.hops}-hop loop
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0' }}>
                  {(loop.path_bns || []).slice(0, -1).map(bn => bn.substring(0, 9)).join(' → ')} → ↩️
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--status-critical)', fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(loop.bottleneck_amt)} bottleneck
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
