import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Zombies from './pages/Zombies';
import FundingLoops from './pages/FundingLoops';
import Governance from './pages/Governance';
import Alerts from './pages/Alerts';
import SoleSource from './pages/SoleSource';
import Chat from './pages/Chat';
import './index.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function BackendStatus() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then(r => setDown(!r.ok))
      .catch(() => setDown(true));
  }, []);
  if (!down) return null;
  return (
    <div style={{ background: 'var(--status-critical)', color: '#fff', fontSize: 12, padding: '6px 20px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 200 }}>
      ⚠️ Backend unavailable — run <code style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 6px', borderRadius: 4 }}>cd backend && python3 main.py</code>
    </div>
  );
}

function Sidebar() {
  const [alertCount, setAlertCount] = useState(null);
  const [navStats, setNavStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
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
    if (type === 'zombies') navigate('/zombies');
    else if (type === 'loops') navigate('/loops');
    else if (type === 'governance') navigate('/governance');
    else if (type === 'sole_source') navigate('/sole-source');
    else if (type === 'alerts') navigate('/alerts');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <NavLink to="/" className="sidebar-logo">
          <div className="sidebar-logo-icon">💰</div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">Follow The Money</span>
            <span className="sidebar-logo-subtitle">Agency 2026 Ottawa</span>
          </div>
        </NavLink>

        {/* Global Search */}
        <div style={{ marginTop: 16, position: 'relative' }}>
          <input
            type="text"
            placeholder="🔍 Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
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
                Object.entries(searchResults.results).map(([type, items]) => (
                  items.length > 0 && (
                    <div key={type}>
                      <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-tertiary)' }}>
                        {type.replace('_', ' ')} ({items.length})
                      </div>
                      {items.map((item, i) => (
                        <div
                          key={i}
                          onClick={() => handleResultClick(type, item)}
                          style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border-primary)' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          {item.canonical_name || item.vendor || item.path_display?.slice(0, 50) || `${item.first_name} ${item.last_name}`}
                        </div>
                      ))}
                    </div>
                  )
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Overview</div>
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-link-icon">📊</span>
          Dashboard
        </NavLink>

        <div className="sidebar-section-label">Investigations</div>
        <NavLink to="/alerts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-link-icon">🚨</span>
          Multi-Flag Alerts
          <span
            className="nav-link-badge"
            style={{
              background: 'var(--status-critical)',
              animation: alertCount > 0 ? 'pulse-glow 2s infinite' : 'none',
            }}
          >
            {alertCount !== null ? alertCount.toLocaleString() : '…'}
          </span>
        </NavLink>
        <NavLink to="/zombies" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-link-icon">🧟</span>
          Zombie Recipients
          <span className="nav-link-badge">{navStats?.zombie_count ?? '…'}</span>
        </NavLink>
        <NavLink to="/loops" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-link-icon">🔄</span>
          Funding Loops
          <span className="nav-link-badge">{navStats?.total_funding_loops != null ? navStats.total_funding_loops.toLocaleString() : '…'}</span>
        </NavLink>
        <NavLink to="/governance" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-link-icon">🕸️</span>
          Governance Networks
          <span className="nav-link-badge">{navStats?.multi_board_directors != null ? navStats.multi_board_directors.toLocaleString() : '…'}</span>
        </NavLink>
        <NavLink to="/sole-source" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-link-icon">📋</span>
          Sole Source
          <span className="nav-link-badge">{navStats?.total_sole_source != null ? (navStats.total_sole_source >= 1000 ? Math.round(navStats.total_sole_source / 1000) + 'K' : navStats.total_sole_source) : '…'}</span>
        </NavLink>

        <div className="sidebar-section-label">AI Assistant</div>
        <NavLink to="/chat" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-link-icon">🤖</span>
          Ask AI
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-mode-badge mock">
          ⚡ Live Data
        </div>
        <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.4 }}>
          {navStats ? `${((navStats.total_fed_grants || 0) + (navStats.total_sole_source || 0) + (navStats.total_charities || 0)).toLocaleString()} records` : '…'} · 4 datasets<br />
          CRA · Federal · Alberta · Entity Resolution
        </div>
      </div>
    </aside>
  );
}

const PAGE_TITLES = {
  '/': 'Command Center',
  '/alerts': 'Multi-Flag Alerts — Cross-Challenge Intersections',
  '/zombies': 'Zombie Recipients — Challenge #1',
  '/loops': 'Funding Loops — Challenge #3',
  '/governance': 'Governance Networks — Challenge #6',
  '/sole-source': 'Sole Source & Amendment Creep — Challenge #4',
  '/chat': 'AI Investigator',
};

const PAGE_CLASSES = {
  '/': 'page-dashboard',
  '/alerts': 'page-zombies',
  '/zombies': 'page-zombies',
  '/loops': 'page-loops',
  '/governance': 'page-governance',
  '/sole-source': 'page-dashboard',
  '/chat': 'page-dashboard',
};

function MainLayout() {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] || 'Follow The Money';
  const pageClass = PAGE_CLASSES[location.pathname] || '';

  return (
    <div className="app-layout">
      <Sidebar />
      <main className={`main-content ${pageClass}`}>
        <header className="main-header">
          <h1 className="main-header-title">{pageTitle}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Agency 2026 · AI Accountability Hackathon
            </span>
          </div>
        </header>
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/zombies" element={<Zombies />} />
            <Route path="/loops" element={<FundingLoops />} />
            <Route path="/governance" element={<Governance />} />
            <Route path="/sole-source" element={<SoleSource />} />
            <Route path="/chat" element={<Chat />} />
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
