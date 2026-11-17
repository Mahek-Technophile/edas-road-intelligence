import { useCallback, useEffect, useMemo, useState } from 'react';
import { createReport, getHazard, getHazards, getSummary, uploadEvidence } from './api';
import { HazardDrawer, MapPanel } from './components/HazardDetails';
import { HazardMap } from './components/HazardMap';
import { ApiError, type AnalyticsSummary, type Hazard, type HazardDetail, type HazardType, type ReportResult, type Severity } from './types';
import { HAZARD_TYPES, SEVERITIES, STATUSES } from './types';

const NAV = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'map', label: 'Hazard map', icon: '⌖' },
  { id: 'reports', label: 'Reports', icon: '▤' },
  { id: 'new', label: 'Report a hazard', icon: '+' },
] as const;
type Page = typeof NAV[number]['id'];
const label = (text: string) => text.replace(/_/g, ' ');
const formatTime = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase();
const EMPTY_SUMMARY: AnalyticsSummary = { total_hazards: 0, verified_hazards: 0, critical_hazards: 0, repaired_hazards: 0, hazards_by_type: { pothole: 0, road_damage: 0, open_manhole: 0, waterlogging: 0, obstruction: 0 }, hazards_by_status: { reported: 0, verified: 0, assigned: 0, repaired: 0 }, pending_challenges: 0 };

function App() {
  const [page, setPage] = useState<Page>('overview');
  const [token, setToken] = useState(() => sessionStorage.getItem('edas-access-token') || '');
  const [tokenDraft, setTokenDraft] = useState(() => sessionStorage.getItem('edas-access-token') || '');
  const [apiReady, setApiReady] = useState(Boolean(sessionStorage.getItem('edas-access-token')));
  const [authOpen, setAuthOpen] = useState(!sessionStorage.getItem('edas-access-token'));
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selected, setSelected] = useState<HazardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadData = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const filters = { status: filterStatus, severity: filterSeverity, hazard_type: filterType };
      const [list, stats] = await Promise.all([getHazards(token, filters), getSummary(token)]);
      setHazards(list.items); setSummary(stats); setApiReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load EDAS data.');
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setApiReady(false);
    } finally { setLoading(false); }
  }, [token, filterStatus, filterSeverity, filterType]);

  useEffect(() => { if (token) void loadData(); }, [loadData, token]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 5000); return () => window.clearTimeout(timer); }, [notice]);

  const openDetail = async (id: string) => {
    if (!token) { setAuthOpen(true); return; }
    setDetailLoading(true); setError('');
    try { setSelected(await getHazard(token, id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load this hazard.'); }
    finally { setDetailLoading(false); }
  };
  const refreshDetail = async () => {
    if (selected) {
      try { setSelected(await getHazard(token, selected.hazard.id)); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not refresh hazard details.'); }
    }
    await loadData(true);
  };
  const visibleHazards = hazards;

  function saveToken(event: React.FormEvent) {
    event.preventDefault();
    const value = tokenDraft.trim();
    if (!value) { setError('Paste a valid Supabase access token to connect.'); return; }
    sessionStorage.setItem('edas-access-token', value);
    setToken(value); setApiReady(true); setAuthOpen(false); setError('');
  }
  function disconnect() {
    sessionStorage.removeItem('edas-access-token'); setToken(''); setTokenDraft(''); setApiReady(false); setHazards([]); setSummary(EMPTY_SUMMARY); setSelected(null); setAuthOpen(true);
  }

  const title = NAV.find((item) => item.id === page)?.label || 'Overview';

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setPage('overview'); }}><span className="brand-mark"><span>e</span></span><span><strong>EDAS</strong><small>ROAD INTELLIGENCE</small></span></a>
      <div className="pilot-label"><span className="pulse" /> PUNE PILOT <span className="pilot-arrow">⌄</span></div>
      <nav className="nav-list" aria-label="Main navigation">{NAV.map((item) => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.id === 'new' && <span className="nav-add">+</span>}</button>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-status"><span className={`connection-dot ${apiReady ? 'online' : ''}`} /><div><strong>{apiReady ? 'Connected to API' : 'API not connected'}</strong><small>{apiReady ? 'Pune data stream' : 'Sign in to load data'}</small></div><button className="mini-menu" aria-label="Connection options" onClick={() => setAuthOpen(true)}>···</button></div>
      <div className="profile-card"><div className="avatar">P</div><div className="profile-copy"><strong>Pune operations</strong><small>Municipal intelligence</small></div><button className="mini-menu" aria-label="Open connection options" onClick={() => setAuthOpen(true)}>⌄</button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>EDAS</span><i>/</i><strong>{title}</strong></div><div className="top-actions"><span className="live-indicator"><i /> API data</span><button className="top-icon" onClick={() => void loadData()} aria-label="Refresh data">↻</button><button className="user-chip" onClick={() => setAuthOpen(true)}><span className="user-avatar">P</span><span>Pune Ops</span><span className="chevron">⌄</span></button></div></header>
      <div className="page-wrap">
        <div className="page-heading"><div><span className="eyebrow">{today} <span className="heading-divider">·</span> PUNE, MAHARASHTRA</span><h1>{page === 'overview' ? 'Good morning, Pune team' : title}</h1><p>{page === 'overview' ? 'A clear view of the roads that need attention today.' : page === 'new' ? 'Share a road issue and help your community travel safer.' : page === 'map' ? 'Explore reported road hazards across the pilot area.' : 'Review and filter all reported road hazards.'}</p></div><div className="heading-actions"><button className="button button-outline" onClick={() => void loadData()} disabled={loading}><span className="refresh-mark">↻</span>{loading ? 'Refreshing' : 'Refresh'}</button><button className="button button-dark" onClick={() => setPage('new')}><span>＋</span> New report</button></div></div>
        {error && <div className="banner-error" role="alert"><span>!</span><div><strong>We couldn’t complete that request.</strong><p>{error}</p></div><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
        {notice && <div className="banner-success" role="status"><span>✓</span><p>{notice}</p><button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}

        {page === 'overview' && <Overview hazards={hazards} summary={summary} loading={loading} onOpen={openDetail} onPage={setPage} onRefresh={() => void loadData()} />}
        {page === 'map' && <div className="page-card map-page-card"><FilterBar status={filterStatus} severity={filterSeverity} type={filterType} setStatus={setFilterStatus} setSeverity={setFilterSeverity} setType={setFilterType} total={hazards.length} /><MapPanel hazards={visibleHazards} onSelect={openDetail} />{hazards.length === 0 && <div className="map-empty">No hazards match these filters. Clear a filter or record a new hazard.</div>}</div>}
        {page === 'reports' && <Reports hazards={hazards} loading={loading} filterStatus={filterStatus} filterSeverity={filterSeverity} filterType={filterType} setStatus={setFilterStatus} setSeverity={setFilterSeverity} setType={setFilterType} onOpen={openDetail} />}
        {page === 'new' && <ReportForm token={token} onSuccess={(result) => { setNotice(reportMessage(result)); setPage('reports'); void loadData(true); if (result.hazard_id) void openDetail(result.hazard_id); }} onConnect={() => setAuthOpen(true)} />}
      </div>
      <footer className="page-footer"><span>EDAS · Enroute Driver Assistance System</span><span><span className="footer-dot" /> Pune pilot environment</span></footer>
    </main>
    {detailLoading && <div className="loading-toast"><span className="spinner" /> Loading hazard record…</div>}
    {selected && <HazardDrawer detail={selected} token={token} canReview={tokenHasAdminClaim(token)} onClose={() => setSelected(null)} onChanged={() => void refreshDetail()} />}
    {authOpen && <div className="modal-backdrop" role="presentation"><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="icon-button modal-close" onClick={() => setAuthOpen(false)} aria-label="Close">×</button><div className="modal-symbol">↗</div><span className="eyebrow">SECURE CONNECTION</span><h2 id="auth-title">Connect to EDAS</h2><p>Paste a Supabase Auth access token to load the API. The token stays in this browser tab and is sent only to your configured EDAS API.</p><form onSubmit={saveToken}><label htmlFor="access-token">Access token</label><textarea id="access-token" rows={4} value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} placeholder="eyJ…" autoComplete="off" spellCheck={false} /><small>For this MVP, sign-in is managed outside this dashboard. Admin actions require an admin claim in the token.</small><div className="button-row modal-actions"><button type="button" className="button button-outline" onClick={() => setAuthOpen(false)}>Cancel</button>{token && <button type="button" className="button button-outline" onClick={disconnect}>Disconnect</button>}<button type="submit" className="button button-dark">Connect securely</button></div></form></section></div>}
  </div>;
}

function tokenHasAdminClaim(token: string) {
  try {
    const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!payload) return false;
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return claims?.app_metadata?.edas_role === 'admin';
  } catch { return false; }
}

function reportMessage(result: ReportResult) {
  if (result.outcome === 'challenge_submitted') return 'Report submitted as a repair challenge. The repaired hazard remains unchanged until reviewed.';
  if (result.outcome === 'duplicate_challenge') return 'You already submitted a challenge for this repaired hazard. Your existing challenge is unchanged.';
  if (result.outcome === 'duplicate') return 'Your observation was already counted for this hazard. Counts were not increased.';
  return result.matched_existing_hazard ? 'Your observation was added to an existing hazard.' : 'Your hazard report was created.';
}

function Overview({ hazards, summary, loading, onOpen, onPage, onRefresh }: { hazards: Hazard[]; summary: AnalyticsSummary; loading: boolean; onOpen: (id: string) => void; onPage: (p: Page) => void; onRefresh: () => void }) {
  const recent = useMemo(() => [...hazards].sort((a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at)).slice(0, 5), [hazards]);
  return <>
    <div className="metric-grid">
      <Metric title="Total hazards" value={summary.total_hazards} foot="Across Pune pilot" trend="All statuses" symbol="⌖" tone="blue" loading={loading} />
      <Metric title="Verified" value={summary.verified_hazards} foot="Ready for assignment" trend="Confirmed" symbol="✓" tone="green" loading={loading} />
      <Metric title="Critical" value={summary.critical_hazards} foot="Needs immediate review" trend="Priority" symbol="!" tone="red" loading={loading} />
      <Metric title="Repaired" value={summary.repaired_hazards} foot={`${resolvedRateValue(summary)}% of all reports`} trend="Closed" symbol="↗" tone="purple" loading={loading} />
    </div>
    <div className="overview-grid"><div className="panel map-panel"><div className="panel-header"><div><span className="eyebrow">GEOGRAPHIC VIEW</span><h2>Hazards across Pune</h2></div><button className="link-button" onClick={() => onPage('map')}>Open full map ↗</button></div><div className="overview-map"><HazardMap hazards={hazards.slice(0, 40)} onSelect={onOpen} />{hazards.length === 0 && <div className="map-placeholder"><span>⌖</span><strong>{loading ? 'Loading Pune map…' : 'No hazard locations yet'}</strong><small>{loading ? 'Fetching current reports' : 'New reports will appear here'}</small></div>}</div><div className="map-caption"><span><i className="legend-dot critical" /> Critical <b>{hazards.filter((h) => h.severity === 'critical').length}</b></span><span><i className="legend-dot high" /> High <b>{hazards.filter((h) => h.severity === 'high').length}</b></span><span><i className="legend-dot medium" /> Medium <b>{hazards.filter((h) => h.severity === 'medium').length}</b></span><button onClick={() => onRefresh()}>Updated just now · ↻</button></div></div>
      <div className="panel distribution-panel"><div className="panel-header"><div><span className="eyebrow">AT A GLANCE</span><h2>Hazard mix</h2></div><button className="more-button" aria-label="More options">···</button></div><div className="distribution-total"><strong>{summary.total_hazards}</strong><span>reported hazards</span></div><div className="type-bars">{(['pothole', 'road_damage', 'open_manhole', 'waterlogging', 'obstruction'] as HazardType[]).map((type) => { const count = summary.hazards_by_type[type] || 0; const percent = summary.total_hazards ? count / summary.total_hazards * 100 : 0; return <div className="type-row" key={type}><div className="type-label"><span>{label(type)}</span><strong>{count}</strong></div><div className="bar-track"><span style={{ width: `${percent}%` }} /></div></div>; })}</div><div className="distribution-footer"><span className="category-icon">⌁</span><span><strong>Most reported</strong><small>{mostReported(summary)}</small></span><span className="category-count">{summary.total_hazards ? Math.max(...Object.values(summary.hazards_by_type)) : 0}</span></div></div>
    </div>
    <div className="panel recent-panel"><div className="panel-header recent-heading"><div><span className="eyebrow">LATEST ACTIVITY</span><h2>Recent hazard reports</h2></div><button className="link-button" onClick={() => onPage('reports')}>View all reports ↗</button></div><HazardTable hazards={recent} loading={loading} onOpen={onOpen} compact /></div>
  </>;
}
function resolvedRateValue(summary: AnalyticsSummary) { return summary.total_hazards ? Math.round(summary.repaired_hazards / summary.total_hazards * 100) : 0; }
function mostReported(summary: AnalyticsSummary) { const item = Object.entries(summary.hazards_by_type).sort((a, b) => b[1] - a[1])[0]; return item && item[1] ? label(item[0]) : 'No reports yet'; }
function Metric({ title, value, foot, trend, symbol, tone, loading }: { title: string; value: number; foot: string; trend: string; symbol: string; tone: string; loading: boolean }) { return <section className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-symbol ${tone}`}>{symbol}</span></div><div className="metric-value">{loading ? <span className="skeleton skeleton-number" /> : value.toLocaleString('en-IN')}</div><div className="metric-foot"><span>{foot}</span><span className={`trend-tag ${tone}`}>{trend}</span></div></section>; }

function FilterBar({ status, severity, type, setStatus, setSeverity, setType, total }: { status: string; severity: string; type: string; setStatus: (s: string) => void; setSeverity: (s: string) => void; setType: (s: string) => void; total: number }) {
  return <div className="filter-bar"><div className="filter-label"><span>◉</span> Filters <small>{total} shown</small></div><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{STATUSES.map((s) => <option value={s} key={s}>{label(s)}</option>)}</select><select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Filter by severity"><option value="">All severities</option>{SEVERITIES.map((s) => <option value={s} key={s}>{label(s)}</option>)}</select><select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by hazard type"><option value="">All categories</option>{HAZARD_TYPES.map((s) => <option value={s} key={s}>{label(s)}</option>)}</select></div>;
}
function Reports({ hazards, loading, filterStatus, filterSeverity, filterType, setStatus, setSeverity, setType, onOpen }: { hazards: Hazard[]; loading: boolean; filterStatus: string; filterSeverity: string; filterType: string; setStatus: (v: string) => void; setSeverity: (v: string) => void; setType: (v: string) => void; onOpen: (id: string) => void }) {
  return <div className="panel reports-panel"><div className="panel-header reports-heading"><div><span className="eyebrow">REPORT REGISTER</span><h2>All hazard reports</h2></div><span className="report-count">{hazards.length} results</span></div><FilterBar status={filterStatus} severity={filterSeverity} type={filterType} setStatus={setStatus} setSeverity={setSeverity} setType={setType} total={hazards.length} /><HazardTable hazards={hazards} loading={loading} onOpen={onOpen} /></div>;
}
function HazardTable({ hazards, loading, onOpen, compact = false }: { hazards: Hazard[]; loading: boolean; onOpen: (id: string) => void; compact?: boolean }) {
  return <div className={`table-wrap ${compact ? 'compact' : ''}`}><table><thead><tr><th>HAZARD</th><th>LOCATION</th><th>SEVERITY</th><th>STATUS</th><th>REPORTERS</th><th>LAST SEEN</th><th /></tr></thead><tbody>{loading && hazards.length === 0 ? <tr><td colSpan={7}><div className="table-state"><span className="spinner" /> Loading reports…</div></td></tr> : hazards.length === 0 ? <tr><td colSpan={7}><div className="table-state"><span className="empty-icon">⌖</span><strong>No reports found</strong><span>Try changing the filters or submit a new hazard report.</span></div></td></tr> : hazards.map((hazard) => <tr key={hazard.id} onClick={() => onOpen(hazard.id)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen(hazard.id)}><td><div className="hazard-cell"><span className={`hazard-type-icon ${hazard.severity}`}>{hazard.hazard_type === 'pothole' ? '◉' : hazard.hazard_type === 'road_damage' ? '⌁' : '!'}</span><span><strong>{label(hazard.hazard_type)}</strong><small>{hazard.id.slice(0, 8)}</small></span></div></td><td><span className="coord-text">{hazard.latitude.toFixed(4)}, {hazard.longitude.toFixed(4)}</span></td><td><span className={`severity-label ${hazard.severity}`}><i />{label(hazard.severity)}</span></td><td><span className={`status-pill ${hazard.status}`}>{label(hazard.status)}</span></td><td><span className="reporter-count">{hazard.confirmation_count}<small> people</small></span></td><td><span className="last-seen">{formatTime(hazard.last_seen_at)}</span></td><td><button className="row-arrow" aria-label={`View ${hazard.hazard_type}`}>↗</button></td></tr>)}</tbody></table></div>;
}

function ReportForm({ token, onSuccess, onConnect }: { token: string; onSuccess: (result: ReportResult) => void; onConnect: () => void }) {
  const [type, setType] = useState<HazardType>('pothole');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [latitude, setLatitude] = useState('18.5204');
  const [longitude, setLongitude] = useState('73.8567');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldError, setFieldError] = useState('');

  async function useLocation() {
    setFieldError('');
    if (!navigator.geolocation) { setFieldError('This browser does not support location access.'); return; }
    navigator.geolocation.getCurrentPosition((position) => { setLatitude(position.coords.latitude.toFixed(6)); setLongitude(position.coords.longitude.toFixed(6)); }, () => setFieldError('Location access was unavailable. You can enter coordinates manually.'), { enableHighAccuracy: true, timeout: 10000 });
  }
  function onFileChange(next: File | null) {
    setFieldError(''); setFile(null);
    if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) { setFieldError('Choose a JPEG, PNG, or WebP image.'); return; }
    if (next.size > 10 * 1024 * 1024) { setFieldError('Images must be 10 MiB or smaller.'); return; }
    setFile(next);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setFormError(''); setFieldError('');
    if (!token) { onConnect(); return; }
    const lat = Number(latitude), lon = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) { setFieldError('Enter valid WGS84 latitude and longitude values.'); return; }
    if (description.length > 1000) { setFieldError('Description must be 1000 characters or fewer.'); return; }
    setBusy(true);
    try {
      const evidenceId = file ? await uploadEvidence(token, file) : null;
      const result = await createReport(token, { hazard_type: type, latitude: lat, longitude: lon, severity, description: description.trim(), evidence_id: evidenceId, source: 'manual' });
      onSuccess(result);
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not submit this report.'); }
    finally { setBusy(false); }
  }

  return <div className="report-layout"><section className="panel report-form-panel"><div className="form-intro"><span className="eyebrow">COMMUNITY REPORT</span><h2>Tell us what you found</h2><p>Reports are grouped by location and category. Your identity is protected; the service counts one independent observation per authenticated reporter.</p></div>{formError && <div className="inline-error" role="alert">{formError}</div>}{fieldError && <div className="inline-error" role="alert">{fieldError}</div>}
    <form className="report-form" onSubmit={submit}><div className="form-field"><label htmlFor="hazard-type">Hazard category <span>*</span></label><select id="hazard-type" value={type} onChange={(e) => setType(e.target.value as HazardType)}>{HAZARD_TYPES.map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></div><div className="form-field"><label htmlFor="severity">Severity <span>*</span></label><div className="severity-options">{SEVERITIES.map((item) => <button type="button" key={item} className={`severity-option ${severity === item ? 'chosen' : ''} ${item}`} onClick={() => setSeverity(item)}><i />{label(item)}</button>)}</div></div><div className="form-field"><div className="field-label-row"><label>Location <span>*</span></label><button type="button" className="text-button" onClick={() => void useLocation()}>⌖ Use my location</button></div><div className="coordinate-grid"><div><label htmlFor="latitude">Latitude</label><input id="latitude" value={latitude} onChange={(e) => setLatitude(e.target.value)} inputMode="decimal" required /></div><div><label htmlFor="longitude">Longitude</label><input id="longitude" value={longitude} onChange={(e) => setLongitude(e.target.value)} inputMode="decimal" required /></div></div><small className="field-hint">Coordinates use WGS84 decimal degrees.</small></div><div className="form-field"><div className="field-label-row"><label htmlFor="description">Description <span className="optional">Optional</span></label><small>{description.length}/1000</small></div><textarea id="description" rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a landmark or a little more detail to help crews find it." /></div><div className="form-field"><label>Photo evidence <span className="optional">Optional</span></label><label className={`upload-box ${file ? 'has-file' : ''}`}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onFileChange(e.target.files?.[0] || null)} /><span className="upload-icon">{file ? '✓' : '↑'}</span><span><strong>{file ? file.name : 'Click to upload a photo'}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MiB · ready to upload` : 'JPEG, PNG or WebP · up to 10 MiB'}</small></span>{file && <button type="button" className="remove-file" onClick={(e) => { e.preventDefault(); setFile(null); }}>×</button>}</label><small className="field-hint">A private upload link is issued by EDAS. Images are not publicly accessible.</small></div><div className="form-actions"><button className="button button-dark submit-button" type="submit" disabled={busy}>{busy ? <><span className="spinner light" /> Submitting…</> : <>Submit hazard report <span>→</span></>}</button><small>By submitting, you confirm this is a genuine road observation.</small></div></form>
  </section><aside className="report-aside"><div className="panel guidance-card"><span className="guidance-icon">✦</span><span className="eyebrow">HOW IT WORKS</span><h3>Good reports make safer roads.</h3><ul><li><span>01</span><div><strong>Pin the location</strong><small>Add accurate GPS coordinates or use your current location.</small></div></li><li><span>02</span><div><strong>Describe the issue</strong><small>Choose the closest category and tell us what you see.</small></div></li><li><span>03</span><div><strong>Community confirms</strong><small>Independent reports help prioritize repair crews.</small></div></li></ul></div><div className="privacy-note"><span>♧</span><p><strong>Privacy first</strong><br />EDAS stores only report photos you choose to share. Continuous video is never collected.</p></div><div className="map-mini"><div className="map-mini-grid"><span className="mini-pin">⌖</span><span className="mini-road road-one" /><span className="mini-road road-two" /></div><div><strong>Focused on Pune</strong><small>Supporting safer streets in your community.</small></div></div></aside></div>;
}

export default App;
