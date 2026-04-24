import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Zombies from './pages/Zombies';
import FundingLoops from './pages/FundingLoops';
import Governance from './pages/Governance';
import Alerts from './pages/Alerts';
import SoleSource from './pages/SoleSource';
import Chat from './pages/Chat';
import './index.css';

function Sidebar() {
  const [alertCount, setAlertCount] = useState(null);
  const [navStats, setNavStats] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/alerts?min_flags=2&limit=100')
      .then(r => r.json())
      .then(d => setAlertCount(d.count || 0))
      .catch(() => setAlertCount(null));

    fetch('http://localhost:8000/api/stats')
      .then(r => r.json())
      .then(setNavStats)
      .catch(() => {});
  }, []);

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
      <MainLayout />
    </BrowserRouter>
  );
}

export default App;
