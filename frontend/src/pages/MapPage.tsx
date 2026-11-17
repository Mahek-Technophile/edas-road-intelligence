import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { RoadMap } from '../components/RoadMap';
import { Badge, EmptyState, PageHeader, Panel } from '../components/ui';
import { downloadCsv, pct, relativeTime, SEVERITY_WEIGHT, stageIndex } from '../pilot/format';
import { usePilot } from '../pilot/store';
import { KIND_META, KINDS, SEVERITIES, SEVERITY_META, STAGES, STAGE_META, type HazardKind, type Severity, type Stage } from '../pilot/types';

export default function MapPage({ onOpenHazard }: { onOpenHazard: (id: string) => void }) {
  const { hazards, settings } = usePilot();
  const [kind, setKind] = useState<'all' | HazardKind>('all');
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [stage, setStage] = useState<'all' | Stage>('all');
  const [heat, setHeat] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => hazards.filter((hazard) =>
    (kind === 'all' || hazard.kind === kind) &&
    (severity === 'all' || hazard.severity === severity) &&
    (stage === 'all' || hazard.stage === stage)
  ).sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || Date.parse(b.lastSeen) - Date.parse(a.lastSeen)), [hazards, kind, severity, stage]);

  const selected = hazards.find((hazard) => hazard.id === selectedId) || filtered[0] || null;
  const activeFilters = [kind !== 'all', severity !== 'all', stage !== 'all'].filter(Boolean).length;

  const clear = () => { setKind('all'); setSeverity('all'); setStage('all'); };

  return <>
    <PageHeader
      eyebrow="GEOSPATIAL · PUNE PILOT"
      title="Live hazard map"
      copy="Every confirmed observation, its consensus score and repair status on one operational map."
      actions={<>
        <button className="btn btn-outline" onClick={() => downloadCsv('edas-hazard-map.csv', filtered.map((hazard) => ({
          id: hazard.id, category: KIND_META[hazard.kind].label, road: hazard.road, landmark: hazard.landmark,
          latitude: hazard.lat, longitude: hazard.lng, severity: hazard.severity, status: STAGE_META[hazard.stage].label,
          confidence: pct(hazard.confidence), reporters: hazard.reports, last_seen: hazard.lastSeen,
        })))}><Icon name="download" size={15} /> Export view</button>
        <button className="btn btn-dark" onClick={() => { window.location.hash = '/report'; }}><Icon name="plus" size={16} /> Report hazard</button>
      </>}
    />

    <div className="map-toolbar">
      <div className="filter-group">
        <span className="filter-label"><Icon name="filter" size={14} /> Filters {activeFilters > 0 && <b>{activeFilters}</b>}</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} aria-label="Filter by category">
          <option value="all">All categories</option>
          {KINDS.map((value) => <option key={value} value={value}>{KIND_META[value].label}</option>)}
        </select>
        <select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)} aria-label="Filter by severity">
          <option value="all">All severities</option>
          {SEVERITIES.map((value) => <option key={value} value={value}>{SEVERITY_META[value].label}</option>)}
        </select>
        <select value={stage} onChange={(event) => setStage(event.target.value as typeof stage)} aria-label="Filter by repair stage">
          <option value="all">All stages</option>
          {STAGES.map((value) => <option key={value} value={value}>{STAGE_META[value].label}</option>)}
        </select>
        {activeFilters > 0 && <button className="clear-btn" onClick={clear}>Clear</button>}
      </div>
      <div className="map-toolbar-right">
        <span className="result-count">{filtered.length} of {hazards.length} hazards</span>
        <button className={`toggle-chip ${heat ? 'on' : ''}`} onClick={() => setHeat((value) => !value)} aria-pressed={heat}><Icon name="layers" size={14} /> Density overlay</button>
      </div>
    </div>

    <div className="map-layout">
      <Panel className="map-panel-full">
        <RoadMap
          hazards={filtered}
          selectedId={selected?.id}
          onSelect={setSelectedId}
          heat={heat}
          style={settings.mapStyle}
          focus={selected ? [selected.lat, selected.lng] : undefined}
          className="full-map"
        />
        <div className="map-legend-bar">
          <span><i className="dot critical" /> Critical</span>
          <span><i className="dot high" /> High</span>
          <span><i className="dot medium" /> Medium</span>
          <span><i className="dot low" /> Low</span>
          <span className="map-attrib">OpenStreetMap contributors</span>
        </div>
      </Panel>

      <aside className="map-side">
        {selected ? <Panel className="map-selected">
          <div className="selected-top">
            <span className={`kind-icon large ${selected.severity}`}>{KIND_META[selected.kind].icon}</span>
            <Badge tone={STAGE_META[selected.stage].tone} dot>{STAGE_META[selected.stage].short}</Badge>
          </div>
          <h2>{KIND_META[selected.kind].label}</h2>
          <p className="selected-location"><Icon name="pin" size={14} /> {selected.landmark} · {selected.road}</p>
          <div className="selected-grid">
            <div><span>Confidence</span><strong>{pct(selected.confidence)}</strong></div>
            <div><span>Reporters</span><strong>{selected.reports}</strong></div>
            <div><span>Severity</span><strong>{SEVERITY_META[selected.severity].label}</strong></div>
            <div><span>Last seen</span><strong>{relativeTime(selected.lastSeen)}</strong></div>
          </div>
          <p className="selected-copy">{selected.description}</p>
          <button className="btn btn-dark full" onClick={() => onOpenHazard(selected.id)}>Open hazard record <Icon name="arrowUpRight" size={14} /></button>
        </Panel> : <EmptyState title="No hazards match" copy="Clear a filter to see the rest of the pilot network." />}

        <Panel className="map-list-panel" eyebrow="IN VIEW" title={`${filtered.length} hazards`}>
          <div className="map-list">
            {filtered.slice(0, 40).map((hazard) => <button key={hazard.id} className={`map-list-row ${selected?.id === hazard.id ? 'selected' : ''}`} onClick={() => setSelectedId(hazard.id)}>
              <span className={`feed-icon small ${hazard.severity}`}>{KIND_META[hazard.kind].icon}</span>
              <span><strong>{KIND_META[hazard.kind].label}</strong><small>{hazard.road} · {hazard.landmark}</small></span>
              <span className="list-meta"><b>{pct(hazard.confidence)}</b><small>{stageIndex(hazard.stage) >= stageIndex('repaired') ? 'closed' : 'open'}</small></span>
            </button>)}
            {!filtered.length && <p className="muted small">No records in this view.</p>}
          </div>
        </Panel>
      </aside>
    </div>
  </>;
}
