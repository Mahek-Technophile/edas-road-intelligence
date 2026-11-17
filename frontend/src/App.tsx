import { useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark, Icon } from './components/Icon';
import { Badge } from './components/ui';
import { NAV_GROUPS, PAGES, PAGE_TITLES, type PageId } from './navigation';
import { usePilot } from './pilot/store';
import { KIND_META } from './pilot/types';
import { relativeTime } from './pilot/format';
import Overview from './pages/Overview';
import MapPage from './pages/MapPage';
import DriverAssist from './pages/DriverAssist';
import VisionLab from './pages/VisionLab';
import Crowd from './pages/Crowd';
import Civic from './pages/Civic';
import Reports from './pages/Reports';
import ReportHazard from './pages/ReportHazard';
import Settings from './pages/Settings';

const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

function readPage(): PageId {
  const value = window.location.hash.replace(/^#\/?/, '') as PageId;
  return PAGES.includes(value) ? value : 'overview';
}

function App() {
  const [page, setPage] = useState<PageId>(readPage);
  const [focusHazard, setFocusHazard] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [syncedAt, setSyncedAt] = useState(() => new Date().toISOString());
  const searchRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const { hazards, vehicles, settings, notice, notify } = usePilot();

  useEffect(() => {
    const onHash = () => setPage(readPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    window.location.hash = `/${page}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchOpen(false);
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openHazard = (id: string) => {
    setFocusHazard(id);
    setPage('reports');
    setSearch('');
    setSearchOpen(false);
    setNotificationsOpen(false);
  };

  const critical = useMemo(() => hazards
    .filter((hazard) => (hazard.severity === 'critical' || hazard.severity === 'high') && hazard.stage !== 'independently_verified')
    .slice(0, 3), [hazards]);
  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length < 2) return [];
    return hazards.filter((hazard) => [hazard.id, hazard.road, hazard.landmark, hazard.corridor, KIND_META[hazard.kind].label].join(' ').toLowerCase().includes(query)).slice(0, 6);
  }, [hazards, search]);

  const streaming = vehicles.filter((vehicle) => vehicle.status === 'streaming').length;
  const current = PAGE_TITLES[page];
  const unread = notificationsRead ? 0 : critical.length;

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#/overview" onClick={(event) => { event.preventDefault(); setPage('overview'); }}>
        <BrandMark />
        <span className="brand-copy"><strong>EDAS</strong><small>Road intelligence platform</small></span>
      </a>

      <div className="pilot-chip">
        <span className="live-dot" />
        <div><strong>Pune pilot</strong><small>Maharashtra · Zone 1–7</small></div>
        <Icon name="chevronDown" size={13} />
      </div>

      <nav className="nav" aria-label="Primary">
        {NAV_GROUPS.map((group) => <div className="nav-group" key={group.label}>
          <span className="nav-label">{group.label}</span>
          {group.items.map((item) => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}>
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
            {item.id === 'vision' && <span className="nav-tag">AI</span>}
            {item.id === 'civic' && <span className="nav-count">{hazards.filter((hazard) => hazard.stage !== 'independently_verified').length}</span>}
          </button>)}
        </div>)}
      </nav>

      <button className="report-cta" onClick={() => setPage('report')}>
        <span className="report-cta-icon"><Icon name="plus" size={16} /></span>
        <span><strong>Report a hazard</strong><small>From the road, in 20 seconds</small></span>
      </button>

      <div className="sidebar-spacer" />

      <div className="sidebar-live">
        <div className="sidebar-live-top"><span className="live-dot" /><strong>Network live</strong><span>{streaming}/{vehicles.length}</span></div>
        <div className="sidebar-bars" aria-hidden="true">{[38, 52, 44, 68, 57, 74, 63, 82, 71, 88, 79, 92].map((value, index) => <i key={index} style={{ height: `${value}%` }} />)}</div>
        <small><Icon name="wifi" size={12} /> {settings.dataSource}</small>
      </div>

      <button className={`profile-card ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>
        <span className="avatar">PO</span>
        <span className="profile-copy"><strong>Pune Operations</strong><small>Municipal intelligence</small></span>
        <Icon name="settings" size={15} />
      </button>
    </aside>

    <div className="main-area">
      <header className="topbar">
        <div className="breadcrumb">
          <span>EDAS</span><Icon name="chevronRight" size={12} /><strong>{current.crumb}</strong>
        </div>
        <div className="top-actions">
          <div className="global-search" ref={searchRef}>
            <Icon name="search" size={16} />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search hazards, roads, landmarks"
              aria-label="Search hazards"
            />
            <kbd>⌘K</kbd>
            {searchOpen && search.trim().length >= 2 && <div className="search-results">
              {results.length ? results.map((hazard) => <button key={hazard.id} onClick={() => openHazard(hazard.id)}>
                <span className={`result-icon ${hazard.severity}`}>{KIND_META[hazard.kind].icon}</span>
                <span><strong>{KIND_META[hazard.kind].label} · {hazard.landmark}</strong><small>{hazard.id} · {hazard.road} · {relativeTime(hazard.lastSeen)}</small></span>
                <Icon name="arrowUpRight" size={14} />
              </button>) : <div className="search-empty">No hazards match “{search}”.</div>}
            </div>}
          </div>
          <span className="sync-stamp"><i /> Synced {relativeTime(syncedAt)}</span>
          <button className="icon-btn" aria-label="Refresh data" onClick={() => { setSyncedAt(new Date().toISOString()); notify('Road intelligence refreshed across the Pune pilot.'); }}><Icon name="refresh" size={17} /></button>
          <div className="notification-wrap" ref={notificationRef}>
            <button className="icon-btn" aria-label="Notifications" onClick={() => { setNotificationsOpen((open) => !open); setNotificationsRead(true); }}>
              <Icon name="bell" size={17} />{unread > 0 && <span className="notify-dot">{unread}</span>}
            </button>
            {notificationsOpen && <div className="notification-panel">
              <div className="notification-head"><strong>Road alerts</strong><Badge tone="red">{critical.length} priority</Badge></div>
              {critical.map((hazard) => <button key={hazard.id} className="notification-item" onClick={() => openHazard(hazard.id)}>
                <span className={`result-icon ${hazard.severity}`}>{KIND_META[hazard.kind].icon}</span>
                <span><strong>{KIND_META[hazard.kind].label} · {hazard.landmark}</strong><small>{hazard.severity} severity · {hazard.reports} reporters · {relativeTime(hazard.lastSeen)}</small></span>
              </button>)}
              <button className="notification-all" onClick={() => { setNotificationsOpen(false); setPage('civic'); }}>Open civic queue <Icon name="chevronRight" size={13} /></button>
            </div>}
          </div>
          <button className="user-chip" onClick={() => setPage('settings')}>
            <span className="user-avatar">PO</span>
            <span><strong>Pune Ops</strong><small>Municipal</small></span>
            <Icon name="chevronDown" size={13} />
          </button>
        </div>
      </header>

      <div className="page-wrap">
        <div className="page-date-row"><span className="eyebrow">{today} · PUNE, MAHARASHTRA</span><span className="pilot-badge"><span className="live-dot" /> Pilot network · 12 vehicles contributing</span></div>

        {page === 'overview' && <Overview onNavigate={setPage} onOpenHazard={openHazard} />}
        {page === 'map' && <MapPage onOpenHazard={openHazard} />}
        {page === 'driver' && <DriverAssist onNavigate={setPage} />}
        {page === 'vision' && <VisionLab onNavigate={setPage} onOpenHazard={openHazard} />}
        {page === 'crowd' && <Crowd onOpenHazard={openHazard} />}
        {page === 'civic' && <Civic onOpenHazard={openHazard} />}
        {page === 'reports' && <Reports focusId={focusHazard} onFocusConsumed={() => setFocusHazard(null)} onNavigate={setPage} />}
        {page === 'report' && <ReportHazard onNavigate={setPage} onOpenHazard={openHazard} />}
        {page === 'settings' && <Settings />}
      </div>

      <footer className="page-footer">
        <span>EDAS · Enroute Driver Assistance System</span>
        <span><i /> Pune pilot · road intelligence workspace</span>
        <span>Privacy: hazard frames only · no continuous cabin video</span>
      </footer>
    </div>

    {notice && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={14} /></span>{notice}<button onClick={() => notify('')} aria-label="Dismiss"><Icon name="close" size={13} /></button></div>}
  </div>;
}

export default App;
