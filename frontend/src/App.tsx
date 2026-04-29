import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShieldAlert, Skull, Repeat2, Network, FileSearch,
  Shuffle, Bot, BookOpen, AlertTriangle, Zap, Database, Search,
  Ghost, BarChart3, Package, Globe, Scale, Layers, Newspaper
} from 'lucide-react';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import GhostRecipients from './pages/GhostRecipients';
import Zombies from './pages/Zombies';
import FundingLoops from './pages/FundingLoops';
import Governance from './pages/Governance';
import Alerts from './pages/Alerts';
import SoleSource from './pages/SoleSource';
import Chat from './pages/Chat';
import EntityCaseFile from './pages/EntityCaseFile';
import DuplicativeFunding from './pages/DuplicativeFunding';
import Methodology from './pages/Methodology';
import ThresholdGaming from './pages/ThresholdGaming';
import VendorConcentration from './pages/VendorConcentration';
import PolicyMisalignment from './pages/PolicyMisalignment';
import AdverseMedia from './pages/AdverseMedia';
import Investigations from './pages/Investigations';
import './index.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

function BackendStatus() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then(r => setDown(!r.ok))
      .catch(() => setDown(true));
  }, []);
  if (!down) return null;
  return (
    <div style={{ background: 'var(--status-critical)', color: '#fff', fontSize: 12, padding: '6px 20px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <AlertTriangle size={13} /> Backend unavailable — run <code style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 6px', borderRadius: 4 }}>cd backend && python3 main.py</code>
    </div>
  );
}

function Sidebar({ extraClass = '' }) {
  const [alertCount, setAlertCount] = useState(null);
  const [navStats, setNavStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [pgConnected, setPgConnected] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_BASE}/api/alerts?min_flags=2&limit=100`)
      .then(r => r.json())
      .then(d => setAlertCount(d.count || 0))
      .catch(() => setAlertCount(null));

    fetch(`${API_BASE}/api/stats`)
      .then(r => r.json())
      .then(setNavStats)
      .catch(() => {});

    fetch(`${API_BASE}/api/health`)
      .then(r => r.json())
      .then(d => setPgConnected(d.pg_connected || false))
      .catch(() => {});
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/api/search?q=${encodeURIComponent(searchQuery)}&limit=5`)
        .then(r => r.json())
        .then(d => {
          setSearchResults(d);
          setSearching(false);
        })
        .catch(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleResultClick = (type, item) => {
    setSearchQuery('');
    setSearchResults(null);
    if (item.bn) navigate(`/entity/${encodeURIComponent(item.bn)}`);
    else if (type === 'charities' && item.bn) navigate(`/entity/${encodeURIComponent(item.bn)}`);
    else if (type === 'federal_grants' && item.bn) navigate(`/entity/${encodeURIComponent(item.bn)}`);
    else if (type === 'ghost_recipients') navigate('/ghost-recipients');
    else if (type === 'loops') navigate('/loops');
    else if (type === 'governance') navigate('/governance');
    else if (type === 'sole_source') navigate('/sole-source');
    else if (type === 'alerts') navigate('/alerts');
    else if (type === 'zombies') navigate('/zombies');
    else navigate('/');
  };

  return (
    <aside className={`sidebar ${extraClass}`}>
      <div className="sidebar-header">
        <NavLink to="/" className="sidebar-logo">
          <div className="sidebar-logo-icon" style={{ fontSize: 18, fontWeight: 900, fontFamily: "var(--font-mono)" }}>$</div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">FraudsterMonsters</span>
            <span className="sidebar-logo-subtitle">Agency 2026 Ottawa</span>
          </div>
        </NavLink>

        {/* Global Search */}
        <div style={{ marginTop: 16, position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 1 }} />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 30px',
              fontSize: 13,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          {searchResults && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-accent)',
              borderRadius: 'var(--radius-md)',
              maxHeight: 300,
              overflowY: 'auto',
              zIndex: 100,
              marginTop: 4,
            }}>
              {searchResults.total === 0 ? (
                <div style={{ padding: 12, fontSize: 13, color: 'var(--text-muted)' }}>No results found</div>
              ) : (
                <>
                  {/* Entities first — PG cross-dataset, confidence-ranked */}
                  {(searchResults.results?.entities || []).length > 0 && (
                    <div>
                      <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--accent-cyan)', textTransform: 'uppercase', background: 'var(--bg-tertiary)', fontWeight: 700, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Database size={10} /> Entities ({searchResults.results.entities.length})
                      </div>
                      {searchResults.results.entities.map((item, i) => (
                        <div
                          key={i}
                          onClick={() => handleResultClick('entities', item)}
                          style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border-primary)' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 3 }}>{item.canonical_name}</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                            {(item.dataset_sources || []).map(src => (
                              <span key={src} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(34,211,238,0.12)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.25)', fontWeight: 600 }}>
                                {src}
                              </span>
                            ))}
                            {item.bn && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{item.bn}</span>}
                            <span style={{ fontSize: 10, color: 'var(--accent-cyan)', marginLeft: 'auto' }}>View Case File →</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Per-category DuckDB results */}
                  {Object.entries(searchResults.results).filter(([t]) => t !== 'entities').map(([type, items]) => (
                    items.length > 0 && (
                      <div key={type}>
                        <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-tertiary)' }}>
                          {({
                            charities: 'CRA Charities',
                            federal_grants: 'Federal Grants',
                            ghost_recipients: 'Ghost Recipients',
                            sole_source: 'Sole Source Contracts',
                            zombies: 'Zombie Recipients',
                            loops: 'Funding Loops',
                            governance: 'Directors',
                            alerts: 'Multi-Flag Alerts',
                          })[type] || type.replace('_', ' ')} ({items.length})
                        </div>
                        {items.map((item, i) => (
                          <div
                            key={i}
                            onClick={() => handleResultClick(type, item)}
                            style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border-primary)' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ fontWeight: 500 }}>
                              {item.canonical_name || item.recipient_name || item.vendor || item.path_display?.slice(0, 50) || (item.first_name ? `${item.first_name} ${item.last_name}` : 'Unknown')}
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                              {item.bn && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{item.bn}</span>}
                              {item.department && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.department}</span>}
                              {item.amount && <span style={{ fontSize: 10, color: 'var(--accent-amber)' }}>${Number(item.amount).toLocaleString()}</span>}
                              {item.bn && <span style={{ fontSize: 10, color: 'var(--accent-cyan)', marginLeft: 'auto' }}>View Case File →</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Overview</div>
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <LayoutDashboard className="nav-link-icon" />
          Home
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <LayoutDashboard className="nav-link-icon" />
          Dashboard
        </NavLink>

        <div className="sidebar-section-label">AI Assistant</div>
        <NavLink to="/chat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Bot className="nav-link-icon" />
          Ask AI
        </NavLink>
        <NavLink to="/investigations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Globe className="nav-link-icon" />
          OSINT Investigations
        </NavLink>

        <div className="sidebar-section-label">Challenges</div>
        <NavLink to="/zombies" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Skull className="nav-link-icon" />
          #1 Zombie Recipients
        </NavLink>
        <NavLink to="/ghost-recipients" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Ghost className="nav-link-icon" />
          #2 Ghost Capacity
        </NavLink>
        <NavLink to="/loops" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Repeat2 className="nav-link-icon" />
          #3 Funding Loops
        </NavLink>
        <NavLink to="/sole-source" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <FileSearch className="nav-link-icon" />
          #4 Sole Source
        </NavLink>
        <NavLink to="/vendor-concentration" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Package className="nav-link-icon" />
          #5 Vendor Concentration
        </NavLink>
        <NavLink to="/governance" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Network className="nav-link-icon" />
          #6 Governance Networks
        </NavLink>
        <NavLink to="/policy-misalignment" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Scale className="nav-link-icon" />
          #7 Policy Misalignment
        </NavLink>
        <NavLink to="/duplicative-funding" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Layers className="nav-link-icon" />
          #8 Duplicative Funding
        </NavLink>
        <NavLink to="/threshold-gaming" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <BarChart3 className="nav-link-icon" />
          #9 Threshold Gaming
        </NavLink>
        <NavLink to="/adverse-media" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Newspaper className="nav-link-icon" />
          #10 Adverse Media
        </NavLink>

        <div className="sidebar-section-label">Cross-Challenge</div>
        <NavLink to="/alerts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <ShieldAlert className="nav-link-icon" />
          Multi-Flag Alerts
          <span
            className="nav-link-badge"
            style={{
              background: 'var(--status-critical)',
              animation: alertCount > 0 ? 'pulse-glow 2s infinite' : 'none',
            }}
          >
            {alertCount !== null ? alertCount.toLocaleString() : '...'}
          </span>
        </NavLink>

        <div className="sidebar-section-label">About</div>
        <NavLink to="/about" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <BookOpen className="nav-link-icon" />
          Methodology
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <div className="sidebar-mode-badge mock" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Zap size={10} /> Live Data</div>
          {pgConnected && (
            <div className="sidebar-mode-badge mock" style={{ background: 'rgba(34,211,238,0.15)', color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.3)' }}>
              ✓ Dual-DB
            </div>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.4 }}>
          {navStats ? `${((navStats.total_fed_grants || 0) + (navStats.total_sole_source || 0) + (navStats.total_charities || 0)).toLocaleString()} records` : '…'} · {pgConnected ? '5' : '4'} datasets<br />
          CRA · Federal · Alberta{pgConnected ? ' · PostgreSQL' : ' · Entity Resolution'}
        </div>
      </div>
    </aside>
  );
}

const PAGE_TITLES = {
  '/': 'Fraudster Monsters — Agency 2026 Ottawa',
  '/dashboard': 'Investigation Dashboard',
  '/alerts': 'Multi-Flag Alerts — Cross-Challenge Intersections',
  '/zombies': 'Challenge #1 — Zombie Recipients',
  '/ghost-recipients': 'Challenge #2 — Ghost Capacity',
  '/loops': 'Challenge #3 — Funding Loops',
  '/sole-source': 'Challenge #4 — Sole Source & Amendment Creep',
  '/governance': 'Challenge #6 — Governance Networks',
  '/threshold-gaming': 'Challenge #9 — Threshold Gaming',
  '/vendor-concentration': 'Challenge #5 — Vendor Concentration',
  '/policy-misalignment': 'Challenge #7 — Policy Misalignment',
  '/adverse-media': 'Challenge #10 — Adverse Media',
  '/chat': 'AI Investigator',
  '/investigations': 'OSINT & WEBINT Investigations',
  '/entity': 'Entity Case File',
  '/duplicative-funding': 'Cross-Government Funding — Challenges #6 + #8',
  '/about': 'Methodology — How FraudsterMonsters Works',
};

const PAGE_CLASSES = {
  '/': 'page-dashboard',
  '/dashboard': 'page-dashboard',
  '/alerts': 'page-zombies',
  '/zombies': 'page-zombies',
  '/ghost-recipients': 'page-zombies',
  '/loops': 'page-loops',
  '/governance': 'page-governance',
  '/sole-source': 'page-dashboard',
  '/threshold-gaming': 'page-sole-source',
  '/vendor-concentration': 'page-dashboard',
  '/policy-misalignment': 'page-dashboard',
  '/adverse-media': 'page-zombies',
  '/chat': 'page-dashboard',
  '/investigations': 'page-dashboard',
  '/duplicative-funding': 'page-governance',
};

function MainLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathKey = location.pathname.startsWith('/entity/') ? '/entity' : location.pathname;
  const pageTitle = PAGE_TITLES[pathKey] || 'Follow The Money';
  const pageClass = PAGE_CLASSES[pathKey] || '';

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="app-layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar extraClass={sidebarOpen ? 'open' : ''} />
      <main className={`main-content ${pageClass}`}>
        <header className="main-header">
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
            <span /><span /><span />
          </button>
          <h1 className="main-header-title">{pageTitle}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }} className="hide-mobile">
              Agency 2026 · AI Accountability Hackathon
            </span>
          </div>
        </header>
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/zombies" element={<Zombies />} />
            <Route path="/ghost-recipients" element={<GhostRecipients />} />
            <Route path="/loops" element={<FundingLoops />} />
            <Route path="/governance" element={<Governance />} />
            <Route path="/sole-source" element={<SoleSource />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/entity/:bn" element={<EntityCaseFile />} />
            <Route path="/threshold-gaming" element={<ThresholdGaming />} />
            <Route path="/duplicative-funding" element={<DuplicativeFunding />} />
            <Route path="/about" element={<Methodology />} />
            <Route path="/vendor-concentration" element={<VendorConcentration />} />
            <Route path="/policy-misalignment" element={<PolicyMisalignment />} />
            <Route path="/adverse-media" element={<AdverseMedia />} />
            <Route path="/investigations" element={<Investigations />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <BackendStatus />
      <MainLayout />
    </BrowserRouter>
  );
}

export default App;
