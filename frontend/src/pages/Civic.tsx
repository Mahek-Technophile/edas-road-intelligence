import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { RoadMap } from '../components/RoadMap';
import { Badge, EmptyState, Meter, PageHeader, Panel } from '../components/ui';
import { downloadCsv, pct, relativeTime, SEVERITY_WEIGHT, stageIndex } from '../pilot/format';
import { usePilot } from '../pilot/store';
import { KIND_META, SEVERITIES, SEVERITY_META, STAGES, STAGE_META, type Severity, type Stage } from '../pilot/types';

export default function Civic({ onOpenHazard }: { onOpenHazard: (id: string) => void }) {
  const { hazards, advanceStage, settings, notify } = usePilot();
  const [stageFilter, setStageFilter] = useState<'all' | Stage>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');

  const open = hazards.filter((hazard) => hazard.stage !== 'independently_verified');
  const stageCounts = STAGES.map((stage) => ({ stage, count: hazards.filter((hazard) => hazard.stage === stage).length }));
  const overdue = open.filter((hazard) => (Date.now() - Date.parse(hazard.firstSeen)) / 3_600_000 > hazard.slaHours);
  const resolved = hazards.filter((hazard) => hazard.resolvedHours);
  const average = resolved.length ? Math.round(resolved.reduce((total, hazard) => total + (hazard.resolvedHours || 0), 0) / resolved.length) : 0;
  const compliance = hazards.length ? Math.round(((hazards.length - overdue.length) / hazards.length) * 100) : 100;

  const filtered = useMemo(() => hazards
    .filter((hazard) => (stageFilter === 'all' || hazard.stage === stageFilter) && (severityFilter === 'all' || hazard.severity === severityFilter))
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || Date.parse(a.firstSeen) - Date.parse(b.firstSeen)), [hazards, stageFilter, severityFilter]);

  const ranking = [...open].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.reports - a.reports).slice(0, 5);
  const accidents = hazards.filter((hazard) => hazard.kind === 'accident');

  return <>
    <PageHeader
      eyebrow="MUNICIPAL WORKSPACE · PUNE"
      title="Civic intelligence"
      copy="Verified road-condition intelligence translated into a prioritised, accountable repair programme."
      actions={<>
        <button className="btn btn-outline" onClick={() => downloadCsv('edas-civic-queue.csv', filtered.map((hazard) => ({
          id: hazard.id, category: KIND_META[hazard.kind].label, corridor: hazard.corridor, landmark: hazard.landmark,
          severity: hazard.severity, status: STAGE_META[hazard.stage].label, team: hazard.team,
          reports: hazard.reports, confidence: pct(hazard.confidence), sla_hours: hazard.slaHours,
          first_seen: hazard.firstSeen, resolved_hours: hazard.resolvedHours || '',
        })))}><Icon name="download" size={15} /> Export case queue</button>
        <button className="btn btn-dark" onClick={() => { const target = ranking[0]; if (target) { advanceStage(target.id); notify(`${target.id} advanced to ${STAGE_META[STAGES[Math.min(STAGES.length - 1, stageIndex(target.stage) + 1)]].label}.`); } }}><Icon name="flag" size={15} /> Advance top priority</button>
      </>}
    />

    <div className="stat-grid civic-stats">
      <article className="stat-card"><div className="stat-top"><span>Open cases</span><span className="stat-icon orange"><Icon name="building" size={17} /></span></div><div className="stat-value">{open.length}</div><div className="stat-foot"><span>{stageCounts.find((item) => item.stage === 'in_progress')?.count || 0} crews on site</span><Badge tone="orange">Live queue</Badge></div></article>
      <article className="stat-card"><div className="stat-top"><span>Critical in queue</span><span className="stat-icon red"><Icon name="alert" size={17} /></span></div><div className="stat-value">{open.filter((hazard) => hazard.severity === 'critical').length}</div><div className="stat-foot"><span>Requires same-day action</span><Badge tone="red">Priority</Badge></div></article>
      <article className="stat-card"><div className="stat-top"><span>Outside SLA</span><span className="stat-icon slate"><Icon name="clock" size={17} /></span></div><div className="stat-value">{overdue.length}</div><div className="stat-foot"><span>{compliance}% of cases inside SLA</span><Badge tone={overdue.length ? 'orange' : 'green'}>{overdue.length ? 'Action needed' : 'On track'}</Badge></div></article>
      <article className="stat-card"><div className="stat-top"><span>Median response</span><span className="stat-icon green"><Icon name="shield" size={17} /></span></div><div className="stat-value">{average}<small>hr</small></div><div className="stat-foot"><span>Detection to repair</span><Badge tone="green">{resolved.length} closed</Badge></div></article>
    </div>

    <Panel className="workflow-panel" eyebrow="REPAIR WORKFLOW" title="Every hazard has an accountable path">
      <div className="workflow">
        {stageCounts.map((item, index) => <button key={item.stage} className={`workflow-node ${stageFilter === item.stage ? 'selected' : ''} ${item.count ? 'has-work' : ''}`} onClick={() => setStageFilter((current) => current === item.stage ? 'all' : item.stage)}>
          <span className={`workflow-number tone-${STAGE_META[item.stage].tone}`}>{index + 1}</span>
          <span className="workflow-copy"><strong>{STAGE_META[item.stage].label}</strong><small>{item.count} case{item.count === 1 ? '' : 's'}</small></span>
          {index < stageCounts.length - 1 && <i className="workflow-arrow"><Icon name="chevronRight" size={13} /></i>}
        </button>)}
      </div>
      <div className="workflow-hint"><Icon name="pin" size={13} /> {stageFilter === 'all' ? 'Select a stage to filter the queue below.' : `Filtered to ${STAGE_META[stageFilter].label}.`} <button onClick={() => setStageFilter('all')}>Show all</button></div>
    </Panel>

    <div className="civic-grid">
      <Panel className="civic-map-panel" eyebrow="ROAD-CONDITION MAP" title="Hazard density and severity" action={<div className="panel-head-actions"><span className="legend-inline"><i className="dot critical" /> Critical <i className="dot high" /> High</span><Badge tone="orange">{open.length} open</Badge></div>}>
        <RoadMap hazards={filtered} onSelect={onOpenHazard} heat style={settings.mapStyle} className="civic-map" />
        <div className="map-foot"><span><b>{filtered.length}</b> in current view</span><span><b>{filtered.filter((hazard) => hazard.reports > 4).length}</b> repeatedly reported</span><span><b>{filtered.filter((hazard) => hazard.stage === 'in_progress').length}</b> under repair</span><span className="map-foot-note">Heat radius reflects hazard severity</span></div>
      </Panel>

      <Panel className="ranking-panel" eyebrow="SEVERITY RANKING" title="Highest-risk locations" action={<select className="mini-select" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)} aria-label="Filter ranking by severity"><option value="all">All severities</option>{SEVERITIES.map((severity) => <option key={severity} value={severity}>{SEVERITY_META[severity].label}</option>)}</select>}>
        <div className="ranking-list">
          {ranking.filter((hazard) => severityFilter === 'all' || hazard.severity === severityFilter).map((hazard, index) => <button key={hazard.id} className="ranking-row" onClick={() => onOpenHazard(hazard.id)}>
            <span className={`rank-number ${hazard.severity}`}>{index + 1}</span>
            <span className="ranking-copy"><strong>{hazard.landmark}</strong><small>{KIND_META[hazard.kind].label} · {hazard.corridor} · {hazard.reports} reports</small></span>
            <span className="ranking-score"><b>{pct(hazard.confidence)}</b><small>confidence</small></span>
            <Badge tone={SEVERITY_META[hazard.severity].tone}>{SEVERITY_META[hazard.severity].label}</Badge>
          </button>)}
        </div>
        <div className="ranking-insight"><Icon name="sparkles" size={14} /><p>Ranking weights severity, independent reports, confidence and proximity to schools and transit stops.</p></div>
      </Panel>
    </div>

    <Panel className="queue-panel" eyebrow="REPAIR QUEUE" title="Case register" action={<div className="queue-actions"><span className="muted small">{filtered.length} cases</span>{stageFilter !== 'all' && <button className="clear-btn" onClick={() => setStageFilter('all')}>Clear stage</button>}</div>}>
      {filtered.length ? <table className="data-table civic-table">
        <thead><tr><th>Case</th><th>Location</th><th>Severity</th><th>Stage</th><th>Assigned team</th><th>SLA</th><th>Reports</th><th /></tr></thead>
        <tbody>{filtered.map((hazard) => {
          const age = Math.round((Date.now() - Date.parse(hazard.firstSeen)) / 3_600_000);
          const late = age > hazard.slaHours && hazard.stage !== 'independently_verified';
          const nextStage = STAGES[Math.min(STAGES.length - 1, stageIndex(hazard.stage) + 1)];
          return <tr key={hazard.id}>
            <td><div className="case-cell"><span className={`feed-icon small ${hazard.severity}`}>{KIND_META[hazard.kind].icon}</span><span><strong>{KIND_META[hazard.kind].label}</strong><small>{hazard.id}</small></span></div></td>
            <td><strong className="ellipsis">{hazard.landmark}</strong><small>{hazard.corridor}</small></td>
            <td><Badge tone={SEVERITY_META[hazard.severity].tone}>{SEVERITY_META[hazard.severity].label}</Badge></td>
            <td><Badge tone={STAGE_META[hazard.stage].tone} dot>{STAGE_META[hazard.stage].short}</Badge></td>
            <td><span className="team-cell">{hazard.team}</span></td>
            <td><span className={`sla-cell ${late ? 'late' : ''}`}>{age}h <small>/ {hazard.slaHours}h</small></span>{late && <span className="overdue-tag">overdue</span>}</td>
            <td><strong>{hazard.reports}</strong></td>
            <td><div className="row-buttons">
              <button className="row-action" onClick={() => onOpenHazard(hazard.id)}>Open</button>
              {hazard.stage !== 'independently_verified' && <button className="row-advance" onClick={() => { advanceStage(hazard.id); notify(`${hazard.id} moved to ${STAGE_META[nextStage].label}.`); }}>→ {STAGE_META[nextStage].short}</button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table> : <EmptyState title="No cases in this stage" copy="Choose another workflow stage or clear the filter." action={<button className="btn btn-outline" onClick={() => setStageFilter('all')}>Show all cases</button>} />}
    </Panel>

    <div className="civic-bottom">
      <Panel eyebrow="INFRASTRUCTURE HEALTH" title="Pilot performance">
        <div className="health-grid">
          <div className="health-block"><span>Throughput</span><strong>{resolved.length}<small> repairs this cycle</small></strong><Meter value={(resolved.length / Math.max(1, hazards.length)) * 100} tone="green" label="Closed" /></div>
          <div className="health-block"><span>SLA compliance</span><strong>{compliance}%</strong><Meter value={compliance} tone={compliance > 80 ? 'green' : 'orange'} label="Inside target" /></div>
          <div className="health-block"><span>Re-observation</span><strong>{hazards.filter((hazard) => hazard.reports >= 5).length}</strong><small>high-consensus cases</small><div className="health-note"><Icon name="network" size={13} /> Verified by 5+ vehicles</div></div>
        </div>
        <div className="corridor-bars">{[['Sinhagad Road', 7], ['Solapur Road', 5], ['Hinjawadi', 5], ['Nagar Road', 4], ['Karve Road', 4]].map(([label, value]) => <div key={String(label)} className="corridor-mini"><span>{label}</span><i><b style={{ width: `${(Number(value) / 8) * 100}%` }} /></i><strong>{value}</strong></div>)}</div>
      </Panel>

      <Panel className="incident-panel" eyebrow="INCIDENT REPORTS" title="Safety events on record">
        {accidents.map((hazard) => <button key={hazard.id} className="incident-row" onClick={() => onOpenHazard(hazard.id)}>
          <span className="incident-icon"><Icon name="alert" size={15} /></span>
          <span><strong>{hazard.landmark} · {hazard.road}</strong><small>{hazard.description}</small></span>
          <span className="incident-meta"><Badge tone={STAGE_META[hazard.stage].tone}>{STAGE_META[hazard.stage].short}</Badge><small>{relativeTime(hazard.lastSeen)}</small></span>
        </button>)}
        <button className="incident-row" onClick={() => onOpenHazard('EDAS-1049')}>
          <span className="incident-icon amber"><Icon name="shield" size={15} /></span>
          <span><strong>Open manhole · JM Road</strong><small>Pedestrian-adjacent hazard; barricade assigned before evening peak.</small></span>
          <span className="incident-meta"><Badge tone="violet">Assigned</Badge><small>4 hr ago</small></span>
        </button>
        <div className="incident-foot"><Icon name="shield" size={13} /> Municipal crews receive hazard evidence, not personal driving data.</div>
      </Panel>
    </div>
  </>;
}
