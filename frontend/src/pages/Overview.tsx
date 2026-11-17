import { useMemo } from 'react';
import { Icon } from '../components/Icon';
import { RoadMap } from '../components/RoadMap';
import { Badge, Donut, DuoBars, Panel, PageHeader, Stat } from '../components/ui';
import { CORRIDOR_PERFORMANCE, ROUTE_ALERTS, WEEKLY_OBSERVATIONS } from '../pilot/data';
import { dateTime, pct, relativeTime, SEVERITY_WEIGHT, stageIndex } from '../pilot/format';
import { usePilot } from '../pilot/store';
import { KIND_META, SEVERITY_META, STAGE_META } from '../pilot/types';
import type { PageId } from '../navigation';

export default function Overview({ onNavigate, onOpenHazard }: { onNavigate: (page: PageId) => void; onOpenHazard: (id: string) => void }) {
  const { hazards, vehicles, settings } = usePilot();

  const metrics = useMemo(() => {
    const verified = hazards.filter((hazard) => stageIndex(hazard.stage) >= stageIndex('verified')).length;
    const open = hazards.filter((hazard) => hazard.stage !== 'independently_verified');
    const critical = open.filter((hazard) => hazard.severity === 'critical');
    const resolved = hazards.filter((hazard) => hazard.resolvedHours);
    const average = resolved.length ? Math.round(resolved.reduce((total, hazard) => total + (hazard.resolvedHours || 0), 0) / resolved.length) : 0;
    const today = hazards.filter((hazard) => Date.now() - Date.parse(hazard.lastSeen) < 86_400_000).length;
    const atRisk = open.filter((hazard) => (Date.now() - Date.parse(hazard.firstSeen)) / 3_600_000 > hazard.slaHours).length;
    return { verified, open, critical, average, today, atRisk };
  }, [hazards]);

  const recent = useMemo(() => [...hazards].sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen)).slice(0, 6), [hazards]);
  const priority = useMemo(() => [...hazards].filter((hazard) => hazard.stage !== 'independently_verified').sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.confidence - a.confidence).slice(0, 4), [hazards]);
  const severitySegments = [
    { label: 'Critical', value: hazards.filter((hazard) => hazard.severity === 'critical').length, colour: '#c0443a' },
    { label: 'High', value: hazards.filter((hazard) => hazard.severity === 'high').length, colour: '#d97a2b' },
    { label: 'Medium', value: hazards.filter((hazard) => hazard.severity === 'medium').length, colour: '#3f7ba8' },
    { label: 'Low', value: hazards.filter((hazard) => hazard.severity === 'low').length, colour: '#92a09a' },
  ];
  const topCorridor = [...CORRIDOR_PERFORMANCE].sort((a, b) => b.hazards - a.hazards)[0];

  return <>
    <PageHeader
      eyebrow="OPERATIONS · LIVE PILOT"
      title="Good evening, Pune operations"
      copy="One operating picture for road hazards, driver alerts and municipal repair work."
      actions={<>
        <button className="btn btn-outline" onClick={() => onNavigate('vision')}><Icon name="camera" size={16} /> Vision Lab</button>
        <button className="btn btn-dark" onClick={() => onNavigate('map')}><Icon name="map" size={16} /> Open live map</button>
      </>}
    />

    <div className="stat-grid">
      <Stat label="Hazards in register" value={hazards.length} foot={`${metrics.today} observed in the last 24 hours`} icon="target" tone="green" />
      <Stat label="Verified hazards" value={metrics.verified} foot="Consensus threshold reached" icon="shield" tone="blue" />
      <Stat label="Active road alerts" value={ROUTE_ALERTS.length} foot="Sinhagad corridor · driver app" icon="alert" tone="orange" />
      <Stat label="Vehicles contributing" value={vehicles.length} foot={`${vehicles.filter((vehicle) => vehicle.status === 'streaming').length} streaming now`} icon="car" tone="slate" />
    </div>

    <div className="overview-grid">
      <Panel className="overview-map-panel" eyebrow="PILOT FOOTPRINT" title="Pune hazard network" action={
        <div className="panel-head-actions">
          <span className="legend-inline"><i className="dot critical" /> Critical <i className="dot high" /> High</span>
          <button className="link-btn" onClick={() => onNavigate('map')}>Full map <Icon name="arrowUpRight" size={13} /></button>
        </div>
      }>
        <RoadMap hazards={hazards} onSelect={onOpenHazard} style={settings.mapStyle} className="overview-map" />
        <div className="map-foot">
          <span><b>{metrics.open.length}</b> open cases</span>
          <span><b>{metrics.critical.length}</b> critical</span>
          <span><b>{metrics.atRisk}</b> outside SLA</span>
          <button onClick={() => onNavigate('civic')}>Open civic queue <Icon name="chevronRight" size={13} /></button>
        </div>
      </Panel>

      <Panel className="priority-panel" eyebrow="NEEDS ATTENTION" title="Priority queue" action={<Badge tone="red">{metrics.critical.length} critical</Badge>}>
        <div className="priority-list">
          {priority.map((hazard) => <button key={hazard.id} className="priority-item" onClick={() => onOpenHazard(hazard.id)}>
            <span className={`kind-icon ${hazard.severity}`}>{KIND_META[hazard.kind].icon}</span>
            <span className="priority-copy">
              <strong>{KIND_META[hazard.kind].label} · {hazard.landmark}</strong>
              <small>{hazard.road} · {hazard.reports} reporters · {pct(hazard.confidence)} confidence</small>
            </span>
            <Badge tone={SEVERITY_META[hazard.severity].tone}>{SEVERITY_META[hazard.severity].label}</Badge>
          </button>)}
        </div>
        <button className="panel-footer-link" onClick={() => onNavigate('civic')}>View all open cases <Icon name="arrowUpRight" size={14} /></button>
      </Panel>
    </div>

    <div className="analytics-grid">
      <Panel className="chart-panel" eyebrow="OBSERVER NETWORK" title="Weekly hazard observations" action={<div className="chart-legend"><span><i className="swatch green" /> Observed</span><span><i className="swatch mint" /> Confirmed</span></div>}>
        <div className="chart-summary"><strong>{WEEKLY_OBSERVATIONS.reduce((total, day) => total + day.count, 0)}</strong><span>observations this week</span><Badge tone="green">+14.2%</Badge></div>
        <DuoBars data={WEEKLY_OBSERVATIONS.map((day) => ({ label: day.day, primary: day.count, secondary: day.confirmed }))} />
      </Panel>

      <Panel className="donut-panel" eyebrow="SEVERITY MIX" title="Hazard profile">
        <Donut segments={severitySegments} total={hazards.length} caption="records" />
        <div className="donut-note"><Icon name="shield" size={15} /><span><strong>{metrics.verified}</strong> verified through independent observations</span></div>
      </Panel>

      <Panel className="corridor-panel" eyebrow="CORRIDOR HEALTH" title="Resolution rate">
        <div className="corridor-list">
          {CORRIDOR_PERFORMANCE.map((corridor) => <div className="corridor-row" key={corridor.corridor}>
            <div><strong>{corridor.corridor}</strong><small>{corridor.hazards} hazards</small></div>
            <div className="corridor-bar"><span style={{ width: `${corridor.resolution}%` }} /></div>
            <b>{corridor.resolution}%</b>
          </div>)}
        </div>
        <div className="insight-line"><Icon name="sparkles" size={14} /><span><strong>{topCorridor.corridor}</strong> carries the highest confirmed hazard density this week.</span></div>
      </Panel>
    </div>

    <Panel className="recent-panel" eyebrow="DETECTION FEED" title="Recent road observations" action={<button className="link-btn" onClick={() => onNavigate('reports')}>Hazard register <Icon name="arrowUpRight" size={13} /></button>}>
      <div className="feed">
        {recent.map((hazard) => <button key={hazard.id} className="feed-row" onClick={() => onOpenHazard(hazard.id)}>
          <span className={`feed-icon ${hazard.severity}`}>{KIND_META[hazard.kind].icon}</span>
          <span className="feed-main"><strong>{KIND_META[hazard.kind].label}</strong><small>{hazard.landmark} · {hazard.road}</small></span>
          <span className="feed-source"><span className="source-tag">{hazard.source}</span></span>
          <span className="feed-confidence"><b>{pct(hazard.confidence)}</b><small>confidence</small></span>
          <span className="feed-reporters"><b>{hazard.reports}</b><small>reporters</small></span>
          <Badge tone={STAGE_META[hazard.stage].tone} dot>{STAGE_META[hazard.stage].short}</Badge>
          <span className="feed-time">{dateTime(hazard.lastSeen)}</span>
          <Icon name="chevronRight" size={14} />
        </button>)}
      </div>
      <div className="feed-foot"><span><span className="live-dot" /> Streaming from the Pune pilot fleet</span><span>Last model run {relativeTime(recent[0]?.lastSeen || new Date().toISOString())}</span></div>
    </Panel>
  </>;
}
