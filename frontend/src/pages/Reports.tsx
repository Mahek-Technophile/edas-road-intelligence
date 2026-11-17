import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { RoadMap } from '../components/RoadMap';
import { Badge, Meter, PageHeader, Panel, WorkflowRibbon } from '../components/ui';
import { downloadCsv, dateTime, pct, relativeTime, sortByRisk, stageIndex } from '../pilot/format';
import { usePilot } from '../pilot/store';
import { KIND_META, KINDS, SEVERITIES, SEVERITY_META, STAGES, STAGE_META, type HazardKind, type Severity, type Stage } from '../pilot/types';
import type { PageId } from '../navigation';

export default function Reports({ focusId, onFocusConsumed, onNavigate }: { focusId: string | null; onFocusConsumed: () => void; onNavigate: (page: PageId) => void }) {
  const { hazards, settings, confirmHazard, advanceStage, notify } = usePilot();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | HazardKind>('all');
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [stage, setStage] = useState<'all' | Stage>('all');
  const [sort, setSort] = useState<'risk' | 'recent' | 'confidence'>('risk');
  const [selectedId, setSelectedId] = useState<string | null>(focusId);

  useEffect(() => { if (focusId) { setSelectedId(focusId); onFocusConsumed(); } }, [focusId, onFocusConsumed]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = hazards.filter((hazard) =>
      (!query || [hazard.id, hazard.road, hazard.landmark, hazard.corridor, KIND_META[hazard.kind].label].join(' ').toLowerCase().includes(query)) &&
      (kind === 'all' || hazard.kind === kind) &&
      (severity === 'all' || hazard.severity === severity) &&
      (stage === 'all' || hazard.stage === stage)
    );
    return [...list].sort(sort === 'recent'
      ? (a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen)
      : sort === 'confidence' ? (a, b) => b.confidence - a.confidence : sortByRisk);
  }, [hazards, search, kind, severity, stage, sort]);

  const selected = hazards.find((hazard) => hazard.id === selectedId) || null;
  const nextStage = selected ? STAGES[Math.min(STAGES.length - 1, stageIndex(selected.stage) + 1)] : null;
  const activeFilters = [kind !== 'all', severity !== 'all', stage !== 'all'].filter(Boolean).length;

  return <>
    <PageHeader
      eyebrow="RECORDS · PUNE PILOT"
      title="Hazard register"
      copy="The full evidence trail behind every reported road hazard — location, consensus, repair state and activity."
      actions={<>
        <button className="btn btn-outline" onClick={() => downloadCsv('edas-hazard-register.csv', filtered.map((hazard) => ({
          id: hazard.id, category: KIND_META[hazard.kind].label, road: hazard.road, landmark: hazard.landmark,
          latitude: hazard.lat, longitude: hazard.lng, severity: hazard.severity, stage: STAGE_META[hazard.stage].label,
          confidence: pct(hazard.confidence), reports: hazard.reports, source: hazard.source, team: hazard.team,
          first_seen: hazard.firstSeen, last_seen: hazard.lastSeen,
        })))}><Icon name="download" size={15} /> Export register</button>
        <button className="btn btn-dark" onClick={() => onNavigate('report')}><Icon name="plus" size={16} /> New report</button>
      </>}
    />

    <Panel className="register-panel">
      <div className="register-toolbar">
        <div className="register-search"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by hazard, road, landmark or ID" aria-label="Search register" />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><Icon name="close" size={13} /></button>}</div>
        <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} aria-label="Category"><option value="all">All categories</option>{KINDS.map((value) => <option key={value} value={value}>{KIND_META[value].label}</option>)}</select>
        <select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)} aria-label="Severity"><option value="all">All severities</option>{SEVERITIES.map((value) => <option key={value} value={value}>{SEVERITY_META[value].label}</option>)}</select>
        <select value={stage} onChange={(event) => setStage(event.target.value as typeof stage)} aria-label="Stage"><option value="all">All stages</option>{STAGES.map((value) => <option key={value} value={value}>{STAGE_META[value].label}</option>)}</select>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort"><option value="risk">Sort: risk</option><option value="recent">Sort: recent</option><option value="confidence">Sort: confidence</option></select>
        {activeFilters > 0 && <button className="clear-btn" onClick={() => { setKind('all'); setSeverity('all'); setStage('all'); }}>Clear {activeFilters}</button>}
      </div>
      <div className="register-summary">
        <span><b>{filtered.length}</b> records shown</span>
        <span><b>{filtered.filter((hazard) => hazard.severity === 'critical').length}</b> critical</span>
        <span><b>{filtered.filter((hazard) => hazard.stage !== 'independently_verified').length}</b> open</span>
        <span className="register-source"><span className="live-dot" /> {settings.dataSource}</span>
      </div>

      <div className="table-wrap">
        <table className="data-table register-table">
          <thead><tr><th>Hazard</th><th>Location</th><th>Severity</th><th>Confidence</th><th>Reporters</th><th>Repair stage</th><th>Last observed</th><th /></tr></thead>
          <tbody>{filtered.map((hazard) => <tr key={hazard.id} onClick={() => setSelectedId(hazard.id)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && setSelectedId(hazard.id)}>
            <td><div className="case-cell"><span className={`feed-icon small ${hazard.severity}`}>{KIND_META[hazard.kind].icon}</span><span><strong>{KIND_META[hazard.kind].label}</strong><small>{hazard.id} · {hazard.source}</small></span></div></td>
            <td><strong className="ellipsis">{hazard.landmark}</strong><small>{hazard.road}</small></td>
            <td><Badge tone={SEVERITY_META[hazard.severity].tone}>{SEVERITY_META[hazard.severity].label}</Badge></td>
            <td><span className="confidence-cell"><b>{pct(hazard.confidence)}</b><i><b style={{ width: `${hazard.confidence * 100}%` }} /></i></span></td>
            <td>{hazard.reports}</td>
            <td><Badge tone={STAGE_META[hazard.stage].tone} dot>{STAGE_META[hazard.stage].short}</Badge></td>
            <td><span className="nowrap">{relativeTime(hazard.lastSeen)}</span></td>
            <td><button className="row-arrow" aria-label={`Open ${hazard.id}`}><Icon name="chevronRight" size={15} /></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!filtered.length && <div className="empty-state"><span className="empty-icon"><Icon name="search" size={22} /></span><strong>No records match those filters</strong><p>Try a different road, category or severity.</p></div>}
    </Panel>

    {selected && <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedId(null)}>
      <aside className="detail-drawer" aria-label={`Hazard ${selected.id}`}>
        <div className="drawer-top"><span className="eyebrow">HAZARD RECORD · {selected.id}</span><div><span className="drawer-source">{selected.source}</span><button className="icon-btn" onClick={() => setSelectedId(null)} aria-label="Close record"><Icon name="close" size={16} /></button></div></div>
        <div className="detail-title">
          <div><div className="detail-badges"><Badge tone={SEVERITY_META[selected.severity].tone}>{SEVERITY_META[selected.severity].label} severity</Badge><Badge tone={STAGE_META[selected.stage].tone} dot>{STAGE_META[selected.stage].label}</Badge></div><h2>{KIND_META[selected.kind].label}</h2><p><Icon name="pin" size={14} /> {selected.landmark} · {selected.road}</p></div>
          <span className={`kind-icon large ${selected.severity}`}>{KIND_META[selected.kind].icon}</span>
        </div>
        <div className="drawer-metrics">
          <div><span>Consensus</span><strong>{pct(selected.confidence)}</strong><Meter value={selected.confidence * 100} tone={selected.severity === 'critical' ? 'red' : 'green'} /></div>
          <div><span>Independent reporters</span><strong>{selected.reports}</strong><small>{selected.observations} observations</small></div>
          <div><span>Record age</span><strong>{Math.round((Date.now() - Date.parse(selected.firstSeen)) / 3_600_000)}h</strong><small>SLA {selected.slaHours}h</small></div>
        </div>
        <RoadMap hazards={[selected]} selectedId={selected.id} style={settings.mapStyle} interactive={false} className="drawer-map" />
        <p className="drawer-copy">{selected.description}</p>

        <section className="drawer-section">
          <div className="section-title"><h3>Repair workflow</h3><span>{STAGE_META[selected.stage].label}</span></div>
          <WorkflowRibbon stages={STAGES.map((value) => ({ short: STAGE_META[value].short }))} active={stageIndex(selected.stage)} compact />
          <div className="workflow-meta"><span><Icon name="users" size={13} /> {selected.team}</span><span><Icon name="clock" size={13} /> SLA {selected.slaHours}h</span></div>
        </section>

        <section className="drawer-section">
          <div className="section-title"><h3>Evidence trail</h3><span>{selected.events.length} events</span></div>
          <div className="event-trail">
            {selected.events.map((event, index) => <div key={`${event.at}-${index}`} className="trail-item">
              <span className="trail-dot" />
              <div><div className="trail-head"><strong>{event.label}</strong><time>{dateTime(event.at)}</time></div><p>{event.detail}</p><span className="trail-source">{event.source}{event.confidence ? ` · ${pct(event.confidence)}` : ''}</span></div>
            </div>)}
          </div>
        </section>

        <div className="drawer-sticky">
          <button className="btn btn-outline" onClick={() => { confirmHazard(selected.id); notify(`Observation added to ${selected.id}. Consensus recalculated.`); }}><Icon name="check" size={15} /> Confirm observation</button>
          {selected.stage !== 'independently_verified' && nextStage && <button className="btn btn-dark" onClick={() => { advanceStage(selected.id); notify(`${selected.id} advanced to ${STAGE_META[nextStage].label}.`); }}>Advance to {STAGE_META[nextStage].short} <Icon name="chevronRight" size={14} /></button>}
        </div>
      </aside>
    </div>}
  </>;
}
