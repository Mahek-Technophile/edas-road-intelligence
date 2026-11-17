import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Badge, Meter, PageHeader, Panel } from '../components/ui';
import { OBSERVATION_LEDGER, VERIFICATION } from '../pilot/data';
import { pct, relativeTime } from '../pilot/format';
import { usePilot } from '../pilot/store';
import { STAGE_META } from '../pilot/types';

const STORY_ID = 'EDAS-1042';

export default function Crowd({ onOpenHazard }: { onOpenHazard: (id: string) => void }) {
  const { hazards, vehicles } = usePilot();
  const hazard = hazards.find((item) => item.id === STORY_ID) || hazards[0];
  const [step, setStep] = useState(VERIFICATION.length);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    if (step >= VERIFICATION.length) { setRunning(false); return; }
    const timer = window.setTimeout(() => setStep((value) => value + 1), 950);
    return () => window.clearTimeout(timer);
  }, [running, step]);

  const confidence = useMemo(() => {
    const steps = VERIFICATION.slice(0, step);
    const last = [...steps].reverse().find((item) => item.plate !== 'engine' && item.plate !== 'service');
    return last?.confidence ?? 0.7;
  }, [step]);
  const accepted = VERIFICATION.slice(0, step).filter((item) => !['engine', 'service', 'vision'].includes(item.plate)).length;
  const duplicates = step >= 4 ? 1 : 0;
  const published = step >= 6;

  const activeVehicles = vehicles.filter((vehicle) => vehicle.status !== 'idle').slice(0, 4);

  const replay = () => { setStep(0); setRunning(true); };

  return <>
    <PageHeader
      eyebrow="CONSENSUS ENGINE · PUNE"
      title="Crowdsourced road intelligence"
      copy="Independent vehicles confirm the same road defect until it becomes a trusted, shareable alert."
      actions={<>
        <button className="btn btn-outline" onClick={() => onOpenHazard(hazard.id)}><Icon name="list" size={15} /> Hazard record</button>
        <button className="btn btn-dark" onClick={replay}><Icon name="play" size={15} /> Replay verification</button>
      </>}
    />

    <div className="crowd-hero">
      <div className="crowd-hero-main">
        <div className="crowd-hero-top">
          <span className={`kind-icon large ${hazard.severity}`}>{hazard.kind === 'pothole' ? '◉' : '!'}</span>
          <div>
            <span className="eyebrow">VERIFICATION STORY · {hazard.id}</span>
            <h2>{hazard.landmark} · {hazard.road}</h2>
            <p>{hazard.description}</p>
          </div>
          <Badge tone={STAGE_META[hazard.stage].tone} dot>{STAGE_META[hazard.stage].label}</Badge>
        </div>
        <div className="crowd-metrics">
          <div><span>Independent observers</span><strong>{accepted} <small>vehicles</small></strong></div>
          <div><span>Consensus score</span><strong>{pct(confidence)}</strong></div>
          <div><span>Duplicate frames removed</span><strong>{duplicates}</strong></div>
          <div><span>Alert reach</span><strong>{published ? '1.2 km' : '—'}</strong></div>
        </div>
      </div>
      <div className="consensus-panel">
        <div className="consensus-ring" style={{ ['--score' as string]: `${confidence * 360}deg` }}>
          <div><strong>{pct(confidence)}</strong><span>confidence</span></div>
        </div>
        <div className={`consensus-state ${published ? 'verified' : ''}`}>
          <Icon name={published ? 'shield' : 'clock'} size={15} />
          {published ? 'Verified · shared with 14 vehicles' : 'Collecting independent observations'}
        </div>
        <div className="consensus-scale"><span>Single report</span><i><b style={{ width: `${confidence * 100}%` }} /></i><span>Verified</span></div>
      </div>
    </div>

    <div className="crowd-grid">
      <Panel className="replay-panel" eyebrow="MULTI-VEHICLE OBSERVATION" title="How three vehicles built one trusted alert" action={<span className="muted small">{step}/{VERIFICATION.length} events</span>}>
        <div className="replay-road" aria-hidden="true">
          <div className="replay-lane lane-one"><span className="replay-car car-a" style={{ left: `${12 + step * 10}%` }}><Icon name="car" size={17} /><b>A</b></span></div>
          <div className="replay-lane lane-two"><span className="replay-car car-b" style={{ left: `${4 + step * 9}%` }}><Icon name="car" size={17} /><b>B</b></span></div>
          <div className="replay-lane lane-three"><span className="replay-car car-c" style={{ left: `${step * 8}%` }}><Icon name="car" size={17} /><b>C</b></span></div>
          <div className="replay-hazard"><Icon name="alert" size={16} /><span>Pothole cluster</span></div>
          <div className="replay-radius"><span>35 m match radius</span></div>
        </div>
        <div className="replay-events">
          {VERIFICATION.map((event, index) => <div key={`${event.at}-${index}`} className={`replay-event ${index < step ? 'revealed' : ''} ${event.plate === 'engine' || event.plate === 'service' ? 'system' : ''}`}>
            <span className="replay-index">{index < step ? <Icon name="check" size={13} /> : index + 1}</span>
            <div><strong>{event.vehicle}</strong><p>{event.note}</p></div>
            <span className="replay-time">{event.at}</span>
            <span className={`replay-confidence ${index < step ? 'visible' : ''}`}>{Math.round(event.confidence * 100)}%</span>
          </div>)}
        </div>
        <div className="replay-controls">
          <button className="btn btn-outline" onClick={() => setStep(0)}><Icon name="refresh" size={14} /> Reset</button>
          <button className="btn btn-dark" onClick={running ? () => setRunning(false) : replay}><Icon name={running ? 'pause' : 'play'} size={14} /> {running ? 'Pause replay' : 'Run verification'}</button>
          <span className="replay-note"><Icon name="pin" size={13} /> Spatial matching at 35 m · direction-aware</span>
        </div>
      </Panel>

      <div className="crowd-side">
        <Panel eyebrow="SIGNAL QUALITY" title="Consensus inputs">
          <div className="signal-list">
            <div><span className="signal-icon"><Icon name="camera" size={15} /></span><div><strong>Vision evidence</strong><small>Hazard class, bounding box and frame time</small></div><b>0.91</b></div>
            <div><span className="signal-icon"><Icon name="pin" size={15} /></span><div><strong>GPS association</strong><small>Snapped to corridor centreline, ±3.2 m</small></div><b>0.96</b></div>
            <div><span className="signal-icon"><Icon name="steering" size={15} /></span><div><strong>Ride quality</strong><small>1.9 g vertical spike from Vehicle D</small></div><b>0.84</b></div>
            <div><span className="signal-icon"><Icon name="clock" size={15} /></span><div><strong>Temporal agreement</strong><small>3 observations inside 90 seconds</small></div><b>0.93</b></div>
          </div>
          <div className="formula">
            <span>CONFIDENCE MODEL</span>
            <code>1 − Π(1 − c<sub>i</sub> · w<sub>i</sub>)</code>
            <small>Weights: vision 0.45 · GPS 0.25 · sensor 0.15 · temporal 0.15</small>
          </div>
        </Panel>

        <Panel eyebrow="OBSERVATION LEDGER" title="Duplicate handling">
          <div className="ledger">
            {OBSERVATION_LEDGER.slice(0, step >= 4 ? 5 : Math.min(step, 3)).map((entry) => <div key={entry.at} className="ledger-row">
              <span className={`ledger-status ${entry.status.replace(' ', '-')}`}><Icon name={entry.status === 'deduplicated' ? 'refresh' : entry.status === 'published' ? 'send' : 'check'} size={12} /></span>
              <div><strong>{entry.source}</strong><small>{entry.detail}</small></div>
              <span className="ledger-at">{entry.at}</span>
              <Badge tone={entry.status === 'deduplicated' ? 'slate' : entry.status === 'published' ? 'green' : 'blue'}>{entry.status}</Badge>
            </div>)}
          </div>
          <div className="ledger-foot"><Icon name="shield" size={13} /> Two frames from Vehicle A were merged before scoring; one observation per reporter counts.</div>
        </Panel>
      </div>
    </div>

    <div className="crowd-bottom">
      <Panel className="fleet-panel" eyebrow="PARTICIPATING FLEET" title="Vehicles in this corridor" action={<Badge tone="green" dot>{vehicles.filter((vehicle) => vehicle.status === 'streaming').length} streaming</Badge>}>
        <table className="data-table compact-table">
          <thead><tr><th>Vehicle</th><th>Role</th><th>Corridor</th><th>Detections</th><th>Link</th><th>Last sync</th></tr></thead>
          <tbody>{activeVehicles.map((vehicle) => <tr key={vehicle.id}>
            <td><strong>{vehicle.plate}</strong><small>{vehicle.model}</small></td>
            <td>{vehicle.role}</td>
            <td>{vehicle.corridor}</td>
            <td>{vehicle.detections}</td>
            <td><span className={`link-status ${vehicle.status}`}><i /> {vehicle.network}</span></td>
            <td>{relativeTime(vehicle.lastSync)}</td>
          </tr>)}</tbody>
        </table>
        <div className="panel-foot-line"><span>{vehicles.length} enrolled vehicles · 10 corridors</span><span>Privacy: on-device hazard frames only</span></div>
      </Panel>

      <Panel className="corridor-consensus" eyebrow="CORRIDOR VIEW" title="Agreement across Sinhagad Road">
        <div className="agreement-list">
          {[
            { label: 'Pothole · Nanded City gate', value: 96, count: 7 },
            { label: 'Open manhole · Anandnagar', value: 93, count: 5 },
            { label: 'Waterlogging · Vitthalwadi', value: 85, count: 3 },
            { label: 'Road surface · Warje approach', value: 78, count: 2 },
          ].map((item) => <div key={item.label} className="agreement-row">
            <div><strong>{item.label}</strong><small>{item.count} independent reporters</small></div>
            <Meter value={item.value} tone={item.value > 90 ? 'green' : item.value > 80 ? 'blue' : 'orange'} />
          </div>)}
        </div>
        <div className="consensus-insight"><Icon name="sparkles" size={15} /><p><strong>{pct(confidence)} consensus</strong> across the corridor this morning. EDAS published the alert after the third independent observation.</p></div>
        <button className="btn btn-dark full" onClick={() => onOpenHazard(hazard.id)}>Open the verified hazard <Icon name="arrowUpRight" size={14} /></button>
      </Panel>
    </div>

    <div className="safety-note-row">
      <div><Icon name="shield" size={18} /><strong>One observation, one vote</strong><p>Authenticated reporters count once per hazard; repeated frames never inflate confidence.</p></div>
      <div><Icon name="target" size={18} /><strong>Location first</strong><p>Observations are matched inside a 35 m radius with direction-of-travel agreement.</p></div>
      <div><Icon name="clock" size={18} /><strong>Freshness matters</strong><p>Contractor work and re-paving decay older evidence instead of leaving stale alerts live.</p></div>
    </div>
  </>;
}
