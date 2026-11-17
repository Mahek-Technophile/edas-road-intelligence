import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { RoadMap } from '../components/RoadMap';
import { Badge, PageHeader, Panel } from '../components/ui';
import { ROUTE, ROUTE_ALERTS } from '../pilot/data';
import { pct } from '../pilot/format';
import { usePilot } from '../pilot/store';
import { KIND_META, SEVERITY_META } from '../pilot/types';

const ROUTE_METRES = 4200;

function pointAt(progress: number): [number, number] {
  const segments = ROUTE.length - 1;
  const scaled = Math.min(0.999999, Math.max(0, progress)) * segments;
  const index = Math.floor(scaled);
  const local = scaled - index;
  const [lat1, lng1] = ROUTE[index];
  const [lat2, lng2] = ROUTE[index + 1];
  return [lat1 + (lat2 - lat1) * local, lng1 + (lng2 - lng1) * local];
}

export default function DriverAssist({ onNavigate }: { onNavigate: (page: 'map' | 'report' | 'vision') => void }) {
  const { hazards, acknowledged, acknowledgeAlert, settings, vehicles, notify } = usePilot();
  const [progress, setProgress] = useState(0.13);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [liveSpeed, setLiveSpeed] = useState(48);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        const next = value + 0.0022 * speed;
        if (next >= 1) { setRunning(false); return 1; }
        return next;
      });
      setLiveSpeed((value) => {
        const drift = Math.round((Math.random() - 0.5) * 5);
        return Math.max(38, Math.min(58, value + drift));
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [running, speed]);

  const vehiclePosition = useMemo(() => pointAt(progress), [progress]);
  const alerts = useMemo(() => ROUTE_ALERTS.map((alert) => {
    const liveDistance = Math.max(0, Math.round((alert.triggerAt - progress) * ROUTE_METRES / 10) * 10);
    const hazard = hazards.find((item) => item.id === alert.hazardId);
    return { ...alert, liveDistance, passed: progress >= alert.triggerAt, hazard, acknowledged: acknowledged.includes(alert.id) };
  }), [progress, hazards, acknowledged]);

  const next = alerts.find((alert) => !alert.passed) || null;
  const travelledKm = ((progress * ROUTE_METRES) / 1000).toFixed(1);
  const displayDistance = (metres: number) => settings.units === 'imperial'
    ? `${Math.round(metres * 3.281)} ft`
    : metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`;

  const reset = () => { setRunning(false); setProgress(0.13); setLiveSpeed(48); };

  return <>
    <PageHeader
      eyebrow="DRIVER APP · LIVE ROUTE"
      title="Driver assistance"
      copy="Sinhagad Road corridor · hazard alerts prioritised by proximity, severity and consensus."
      actions={<>
        <button className="btn btn-outline" onClick={() => onNavigate('vision')}><Icon name="camera" size={15} /> Vision review</button>
        <button className="btn btn-outline" onClick={reset}><Icon name="refresh" size={15} /> Reset drive</button>
        <button className={`btn ${running ? 'btn-outline' : 'btn-dark'}`} onClick={() => { if (progress >= 1) setProgress(0.02); setRunning((value) => !value); }}>
          <Icon name={running ? 'pause' : 'play'} size={15} /> {running ? 'Pause drive' : progress >= 1 ? 'Replay drive' : 'Start drive'}
        </button>
      </>}
    />

    <div className="drive-strip">
      <div className="drive-route"><span className="route-dot start" /><div><strong>Sinhagad Road · Nanded City</strong><small>Origin · 18.4640, 73.8310</small></div></div>
      <div className="drive-line"><i style={{ width: `${progress * 100}%` }} /><span className="drive-car" style={{ left: `${progress * 100}%` }}><Icon name="car" size={14} /></span></div>
      <div className="drive-route end"><div><strong>Swargate transit hub</strong><small>Destination · 4.2 km</small></div><span className="route-dot finish" /></div>
    </div>

    <div className="driver-grid">
      <Panel className="driver-map-panel" eyebrow="ROUTE CONTEXT" title="Approach map" action={<Badge tone="green" dot>GPS lock · 3 m</Badge>}>
        <RoadMap
          hazards={hazards.filter((hazard) => ROUTE_ALERTS.some((alert) => alert.hazardId === hazard.id))}
          route={ROUTE}
          vehicle={vehiclePosition}
          onSelect={() => undefined}
          interactive
          style={settings.mapStyle}
          className="driver-map"
        />
        <div className="driver-map-foot">
          <span><Icon name="route" size={14} /> {travelledKm} km of 4.2 km</span>
          <span><Icon name="clock" size={14} /> ETA {Math.max(1, Math.round((1 - progress) * 9))} min</span>
          <span><Icon name="wifi" size={14} /> 5G · 18 ms</span>
        </div>
      </Panel>

      <div className="hud-column">
        <section className={`driver-hud ${next ? `severity-${next.severity}` : 'clear'}`}>
          <div className="hud-top">
            <span className="hud-brand"><Icon name="steering" size={17} /> EDAS DRIVE</span>
            <span className="hud-live"><i /> {running ? 'LIVE' : 'READY'}</span>
          </div>
          <div className="hud-speed">
            <strong>{liveSpeed}</strong><span>km/h<small>Speed limit 50</small></span>
          </div>
          {next ? <>
            <div className="hud-alert">
              <div className="hud-alert-head">
                <span className={`hud-alert-icon ${next.severity}`}>{KIND_META[next.hazard?.kind || 'pothole'].icon}</span>
                <div><span className="hud-kicker">{next.acknowledged ? 'ACKNOWLEDGED' : 'HAZARD AHEAD'}</span><h2>{next.title}</h2></div>
              </div>
              <div className="hud-distance"><strong>{next.liveDistance < 40 ? 'Passing now' : displayDistance(next.liveDistance)}</strong><span>{next.liveDistance < 40 ? 'maintain your lane' : 'estimated approach'}</span></div>
              <div className="hud-action"><Icon name="shield" size={16} /><div><span>Recommended action</span><strong>{next.action}</strong></div></div>
              <div className="hud-meta">
                <span><b>{pct(next.confidence)}</b> confidence</span>
                <span><b>{next.hazard?.reports || 3}</b> vehicles</span>
                <span><b>{SEVERITY_META[next.severity].label}</b> severity</span>
              </div>
              <div className="hud-buttons">
                <button className="hud-ack" disabled={next.acknowledged} onClick={() => { acknowledgeAlert(next.id); notify('Alert acknowledged. EDAS will keep monitoring the approach.'); }}>
                  <Icon name={next.acknowledged ? 'check' : 'shield'} size={15} /> {next.acknowledged ? 'Acknowledged' : 'Acknowledge alert'}
                </button>
                <button className="hud-icon" aria-label="View on map" onClick={() => onNavigate('map')}><Icon name="map" size={16} /></button>
              </div>
            </div>
          </> : <div className="hud-clear">
            <span className="hud-clear-icon"><Icon name="check" size={26} /></span>
            <h2>Corridor clear</h2>
            <p>No unacknowledged hazards remain on this route. EDAS continues to watch the road ahead.</p>
            <button className="hud-ack" onClick={reset}><Icon name="refresh" size={15} /> Replay approach</button>
          </div>}
          <div className="hud-foot"><span><Icon name="camera" size={13} /> Vision active</span><span>{hazards.length} corridor hazards</span><span>Privacy mode</span></div>
        </section>

        <Panel className="telemetry-panel" eyebrow="VEHICLE LINK" title="Drive session">
          <div className="telemetry-grid">
            <div><span>Speed factor</span><div className="speed-picker">{[1, 2, 4].map((value) => <button key={value} className={speed === value ? 'active' : ''} onClick={() => setSpeed(value)}>{value}×</button>)}</div></div>
            <div><span>Battery</span><strong>74%</strong><small>charging · 5.2 W</small></div>
            <div><span>Data used</span><strong>38 MB</strong><small>this session</small></div>
            <div><span>Frames sampled</span><strong>10 fps</strong><small>on-device</small></div>
          </div>
          <button className="btn btn-dark full" onClick={() => onNavigate('report')}><Icon name="plus" size={15} /> Report a hazard on this route</button>
        </Panel>
      </div>
    </div>

    <Panel className="alert-list-panel" eyebrow="ROUTE ALERTS" title="Approach sequence" action={<span className="muted small">Ordered by proximity · refreshes with the drive</span>}>
      <div className="alert-list">
        {alerts.map((alert, index) => <div key={alert.id} className={`alert-row ${alert.passed ? 'passed' : ''} ${alert.acknowledged ? 'acknowledged' : ''}`}>
          <span className="alert-step">{alert.passed ? <Icon name="check" size={14} /> : `0${index + 1}`}</span>
          <span className={`feed-icon ${alert.severity}`}>{KIND_META[alert.hazard?.kind || 'pothole'].icon}</span>
          <span className="alert-copy"><strong>{alert.title}</strong><small>{alert.note}</small></span>
          <span className="alert-distance"><b>{alert.passed ? 'Passed' : displayDistance(alert.liveDistance)}</b><small>{KIND_META[alert.hazard?.kind || 'pothole'].label} · {alert.hazard?.road}</small></span>
          <Badge tone={SEVERITY_META[alert.severity].tone}>{SEVERITY_META[alert.severity].label}</Badge>
          <span className={`alert-status ${alert.acknowledged ? 'done' : alert.passed ? 'muted' : 'live'}`}>{alert.acknowledged ? 'Acknowledged' : alert.passed ? 'Passed' : 'Live'}</span>
          <button className="row-action" disabled={alert.acknowledged} onClick={() => { acknowledgeAlert(alert.id); notify('Alert acknowledged.'); }}>{alert.acknowledged ? 'Done' : 'Acknowledge'}</button>
        </div>)}
      </div>
      <div className="fleet-strip">
        <span><strong>{vehicles.filter((vehicle) => vehicle.status === 'streaming').length}</strong> vehicles streaming in the pilot</span>
        <span><strong>1.2 km</strong> alert radius</span>
        <span><strong>35 m</strong> spatial match radius</span>
        <span className="fleet-note"><Icon name="shield" size={13} /> Alerts are advisory; the driver remains in control.</span>
      </div>
    </Panel>
  </>;
}
