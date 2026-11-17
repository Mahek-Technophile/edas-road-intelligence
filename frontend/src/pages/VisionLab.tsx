import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Badge, Meter, PageHeader, Panel } from '../components/ui';
import { pct } from '../pilot/format';
import { usePilot } from '../pilot/store';
import { SEVERITY_META, type Severity } from '../pilot/types';

interface VisionEvent {
  id: string;
  start_ms: number;
  end_ms: number;
  timestamp_ms: number;
  label: string;
  category: string;
  confidence: number;
  severity: string;
  model: string;
  distance_m: number;
}
interface VisionRun {
  id: string;
  title: string;
  subtitle: string;
  duration_ms: number;
  frames_sampled: number;
  input: string;
  output: string;
  poster: string;
  model: { name: string; runtime: string; input_size: number };
  events: VisionEvent[];
}

const LINKED: Record<string, string> = {
  'EV-0201': 'EDAS-1042',
  'EV-0202': 'EDAS-1047',
  'EV-0203': 'EDAS-1044',
  'EV-0204': 'EDAS-1055',
  'EV-0205': 'EDAS-1061',
  'EV-0206': 'EDAS-1063',
};

const FALLBACK: VisionEvent[] = [
  { id: 'EV-0201', start_ms: 420, end_ms: 2150, timestamp_ms: 800, label: 'Pothole', category: 'pothole', confidence: 0.91, severity: 'high', model: 'yolov8s-road', distance_m: 26 },
  { id: 'EV-0202', start_ms: 1850, end_ms: 3500, timestamp_ms: 2300, label: 'Pothole', category: 'pothole', confidence: 0.88, severity: 'high', model: 'yolov8s-road', distance_m: 19 },
  { id: 'EV-0203', start_ms: 3350, end_ms: 5350, timestamp_ms: 4100, label: 'Road crack', category: 'road_crack', confidence: 0.84, severity: 'medium', model: 'yolov8s-road', distance_m: 22 },
  { id: 'EV-0204', start_ms: 5400, end_ms: 7250, timestamp_ms: 6200, label: 'Pothole', category: 'pothole', confidence: 0.94, severity: 'critical', model: 'yolov8s-road', distance_m: 16 },
  { id: 'EV-0205', start_ms: 7350, end_ms: 8750, timestamp_ms: 8000, label: 'Pothole', category: 'pothole', confidence: 0.90, severity: 'high', model: 'yolov8s-road', distance_m: 20 },
  { id: 'EV-0206', start_ms: 8750, end_ms: 9900, timestamp_ms: 9300, label: 'Pothole', category: 'pothole', confidence: 0.96, severity: 'critical', model: 'yolov8s-road', distance_m: 12 },
];

const STEPS = ['Frames', 'Detect', 'Classify', 'Locate', 'Alert'];

const clock = (value: number) => `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
const stamp = (ms: number) => `${Math.floor(ms / 60000).toString().padStart(2, '0')}:${(ms % 60000 / 1000).toFixed(1).padStart(4, '0')}`;

function rewardFor(event: VisionEvent | null) {
  const severity = (event?.severity || 'medium') as Severity;
  const safety = severity === 'critical' ? 97 : severity === 'high' ? 92 : 84;
  const accuracy = severity === 'critical' ? 93 : severity === 'high' ? 89 : 80;
  const relevance = severity === 'critical' ? 94 : severity === 'high' ? 90 : 78;
  const falseAlerts = severity === 'critical' ? 3 : 5;
  const distraction = severity === 'critical' ? 6 : 8;
  const score = Math.round(safety * 0.4 + accuracy * 0.3 + relevance * 0.2 - falseAlerts * 0.05 - distraction * 0.05);
  const action = severity === 'critical' ? 'Alert · reduce speed now' : severity === 'high' ? 'Alert · reduce speed' : 'Monitor · log hazard';
  return { safety, accuracy, relevance, falseAlerts, distraction, score, action };
}

export default function VisionLab({ onOpenHazard, onNavigate }: { onOpenHazard: (id: string) => void; onNavigate: (page: 'map' | 'reports' | 'civic') => void }) {
  const { hazards, notify } = usePilot();
  const [run, setRun] = useState<VisionRun | null>(null);
  const [events, setEvents] = useState<VisionEvent[]>(FALLBACK);
  const [time, setTime] = useState(0.8);
  const [duration, setDuration] = useState(10);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [beforeUpload, setBeforeUpload] = useState<string | null>(null);
  const [afterUpload, setAfterUpload] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  const beforeUrl = useRef<string>('');
  const afterUrl = useRef<string>('');
  const initialised = useRef(false);

  useEffect(() => {
    fetch('/media/vision-run.json')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('run unavailable')))
      .then((body: VisionRun) => {
        setRun(body);
        if (Array.isArray(body.events) && body.events.length) setEvents(body.events);
        setDuration(body.duration_ms / 1000);
      })
      .catch(() => undefined);
    return () => {
      if (beforeUrl.current) URL.revokeObjectURL(beforeUrl.current);
      if (afterUrl.current) URL.revokeObjectURL(afterUrl.current);
    };
  }, []);

  const active = useMemo(() => events.filter((event) => time * 1000 >= event.start_ms && time * 1000 <= event.end_ms), [events, time]);
  const selected = events.find((event) => event.id === selectedId) || active[0] || null;
  const reward = rewardFor(active[0] || selected);
  const stageIndex = time <= 0.05 ? 1 : active.length ? 4 : 3;
  const hazard = selected ? hazards.find((item) => item.id === LINKED[selected.id]) : undefined;
  const beforeSrc = beforeUpload || run?.input || '/media/sample-before.mp4';
  const afterSrc = afterUpload || run?.output || '/media/sample-after.mp4';

  const sync = (seconds: number) => {
    const after = afterRef.current;
    if (after && Math.abs(after.currentTime - seconds) > 0.18) after.currentTime = seconds;
  };

  const play = async () => {
    const before = beforeRef.current;
    const after = afterRef.current;
    if (!before || !after) return;
    if (before.ended) seek(0);
    after.currentTime = before.currentTime;
    try {
      await Promise.all([before.play(), after.play()]);
      setPlaying(true);
      setSelectedId(null);
    } catch { setPlaying(false); }
  };

  const pause = () => {
    beforeRef.current?.pause();
    afterRef.current?.pause();
    setPlaying(false);
  };

  const seek = (seconds: number) => {
    const value = Math.max(0, Math.min(duration, seconds));
    if (beforeRef.current) beforeRef.current.currentTime = value;
    if (afterRef.current) afterRef.current.currentTime = value;
    setTime(value);
  };

  const restart = () => {
    pause();
    seek(0.8);
    setSelectedId(null);
  };

  const replay = () => {
    pause();
    seek(0);
    window.setTimeout(() => void play(), 160);
  };

  const pickEvent = (event: VisionEvent) => {
    pause();
    setSelectedId(event.id);
    seek(event.timestamp_ms / 1000 + 0.25);
  };

  function loadVideo(side: 'before' | 'after', file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('video/')) { notify('Choose a video file.'); return; }
    const url = URL.createObjectURL(file);
    if (side === 'before') {
      if (beforeUrl.current) URL.revokeObjectURL(beforeUrl.current);
      beforeUrl.current = url;
      setBeforeUpload(url);
    } else {
      if (afterUrl.current) URL.revokeObjectURL(afterUrl.current);
      afterUrl.current = url;
      setAfterUpload(url);
    }
    setCustom(true);
    setReviewed(false);
    pause();
    setSelectedId(null);
    setTime(0);
    notify(`${side === 'before' ? 'Before' : 'After'} clip loaded.`);
  }

  return <>
    <PageHeader
      eyebrow="VISION LAB · ROAD SURVEY REVIEW"
      title="Before and after"
      copy="Watch the raw survey beside the analysed output. Every pothole marked on the road is counted and ready for review."
      actions={<>
        <button className="btn btn-outline" onClick={restart}><Icon name="refresh" size={15} /> Restart</button>
        <button className="btn btn-dark" onClick={replay}><Icon name="play" size={15} /> Play analysis</button>
      </>}
    />

    <div className="vision-summary">
      <div><span>Reference run</span><strong>{run?.id || 'RUN-021'}</strong></div>
      <div><span>Clip</span><strong>{custom ? 'Your clip' : 'Road-damage survey'}</strong></div>
      <div><span>Length</span><strong>{clock(duration)}</strong></div>
      <div><span>Hazards</span><strong>{custom ? '—' : events.length}</strong></div>
      <div><span>Model</span><strong>{run?.model.name || 'yolov8s-road'}</strong></div>
      <div className="vision-summary-model"><span className="live-dot" /> Ready</div>
    </div>

    <div className="vision-layout">
      <div className="vision-main">
        <Panel className="vision-video-panel">
          <div className="vision-video-head">
            <div><span className="eyebrow">SIDE-BY-SIDE REVIEW</span><h2>{custom ? 'Your before and after clips' : 'Sample survey · before and after'}</h2></div>
            <div className="clip-upload-actions">
              <label className="btn btn-outline small"><Icon name="camera" size={14} /> Before video<input type="file" accept="video/mp4,video/*" onChange={(event) => loadVideo('before', event.target.files?.[0] || null)} /></label>
              <label className="btn btn-outline small"><Icon name="camera" size={14} /> After video<input type="file" accept="video/mp4,video/*" onChange={(event) => loadVideo('after', event.target.files?.[0] || null)} /></label>
            </div>
          </div>

          <div className="video-pair">
            <div className="video-cell">
              <div className="video-cell-head"><span className="video-badge">BEFORE</span><span>Raw footage</span></div>
              <video ref={beforeRef} src={beforeSrc} poster={custom ? undefined : run?.poster || '/media/sample-before-poster.jpg'} muted playsInline preload="metadata"
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  if (custom) {
                    setDuration(video.duration || 10);
                    video.currentTime = 0;
                    if (afterRef.current) afterRef.current.currentTime = 0;
                    return;
                  }
                  if (!initialised.current) {
                    initialised.current = true;
                    setDuration(video.duration || 10);
                    seek(0.8);
                  }
                }}
                onTimeUpdate={(event) => { const value = event.currentTarget.currentTime; setTime(value); sync(value); }}
                onPlay={() => setPlaying(true)}
                onEnded={() => { setPlaying(false); afterRef.current?.pause(); }}
              />
            </div>
            <div className="video-cell after">
              <div className="video-cell-head"><span className="video-badge green">AFTER</span><span>Analysed output</span></div>
              <video ref={afterRef} src={afterSrc} poster={custom ? undefined : '/media/sample-after-poster.jpg'} muted playsInline preload="metadata"
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  if (custom) {
                    setDuration(video.duration || 10);
                    video.currentTime = 0;
                    if (beforeRef.current) beforeRef.current.currentTime = 0;
                  } else {
                    video.currentTime = 0.8;
                  }
                }}
                onEnded={() => { setPlaying(false); beforeRef.current?.pause(); }}
              />
            </div>
          </div>

          <div className="vision-controls">
            <button className="play-button" onClick={() => playing ? pause() : void play()} aria-label={playing ? 'Pause' : 'Play'}><Icon name={playing ? 'pause' : 'play'} size={17} /></button>
            <span className="vision-time">{clock(time)} <i>/ {clock(duration)}</i></span>
            <input type="range" min={0} max={duration} step={0.05} value={time} onChange={(event) => seek(Number(event.target.value))} className="vision-seek" style={{ ['--progress' as string]: `${(time / Math.max(0.1, duration)) * 100}%` }} aria-label="Seek both videos" />
            <span className="sync-label"><Icon name="check" size={13} /> In sync</span>
          </div>
          <div className="vision-hint">
            <span><Icon name="layers" size={13} /> Both clips play together.</span>
            <span>Load a before clip and its processed after clip; both play together.</span>
          </div>
        </Panel>

        <div className="vision-steps">
          {STEPS.map((step, index) => <div key={step} className={`vision-step ${index < stageIndex ? 'done' : ''} ${index === stageIndex ? 'current' : ''}`}>
            <span>{index < stageIndex ? <Icon name="check" size={12} /> : index + 1}</span>
            <strong>{step}</strong>
            {index < STEPS.length - 1 && <i />}
          </div>)}
          <span className="vision-step-note">{active.length ? `${active.length} hazard${active.length === 1 ? '' : 's'} in view` : playing ? 'Scanning the road surface' : 'Ready to review'}</span>
        </div>

        <Panel className="vision-timeline-panel">
          <div className="vision-timeline-head">
            <div><span className="eyebrow">DETECTIONS</span><h2>Hazards in this clip</h2></div>
            <span className="muted small">{custom ? 'Load the sample run to see prepared detections' : `${events.length} hazards · ${events.filter((event) => event.severity === 'critical').length} critical`}</span>
          </div>
          {custom ? <div className="vision-empty"><Icon name="camera" size={20} /><strong>Your clips are ready</strong><p>Use the play control above to review them side by side.</p></div> : <>
            <div className="hazard-track">
              <div className="hazard-track-line"><i style={{ width: `${(time / duration) * 100}%` }} /></div>
              {events.map((event) => <button key={event.id} className={`hazard-pill ${selected?.id === event.id ? 'active' : ''}`} style={{ left: `${(event.timestamp_ms / (duration * 1000)) * 100}%` }} onClick={() => pickEvent(event)} aria-label={`View ${event.label} at ${stamp(event.timestamp_ms)}`}>
                <i className={event.severity} />
                <span>{stamp(event.timestamp_ms)}</span>
              </button>)}
              <span className="hazard-track-head" style={{ left: `${(time / duration) * 100}%` }} />
            </div>
            <div className="hazard-chips">
              {events.map((event) => <button key={event.id} className={`hazard-chip ${selected?.id === event.id ? 'active' : ''}`} onClick={() => pickEvent(event)}>
                <span className={`hazard-dot ${event.severity}`} />
                <span><strong>{event.label}</strong><small>{stamp(event.timestamp_ms)} · {pct(event.confidence)}</small></span>
                <Badge tone={SEVERITY_META[event.severity as Severity].tone}>{SEVERITY_META[event.severity as Severity].label}</Badge>
              </button>)}
            </div>
          </>}
        </Panel>
      </div>

      <aside className="vision-side">
        <Panel className="vision-current" eyebrow="CURRENT DETECTION" title={selected ? selected.label : 'Watching the road'}>
          {selected ? <>
            <div className="current-head">
              <span className={`kind-icon large ${selected.severity}`}>{selected.category === 'pothole' ? '◉' : '⌁'}</span>
              <div><strong>{selected.label} detected</strong><span>{stamp(selected.timestamp_ms)} · {selected.model}</span></div>
              <Badge tone={SEVERITY_META[selected.severity as Severity].tone}>{SEVERITY_META[selected.severity as Severity].label}</Badge>
            </div>
            <div className="current-confidence">
              <div><span>Confidence</span><strong>{pct(selected.confidence)}</strong></div>
              <Meter value={selected.confidence * 100} tone={selected.severity === 'critical' ? 'red' : 'green'} />
            </div>
            <div className="current-facts">
              <div><span>Approach</span><strong>{selected.distance_m} m</strong></div>
              <div><span>Category</span><strong>{selected.category.replace(/_/g, ' ')}</strong></div>
            </div>
            {LINKED[selected.id] && <button className="btn btn-outline full" onClick={() => onOpenHazard(LINKED[selected.id])}><Icon name="building" size={14} /> Open linked hazard</button>}
          </> : <div className="vision-empty"><Icon name="target" size={20} /><strong>No hazard in this frame</strong><p>Press play or pick a hazard below to inspect it.</p></div>}
        </Panel>

        <Panel className="vision-decision" eyebrow="DRIVER DECISION" title="What EDAS would do">
          <div className={`decision-action ${active[0] ? 'live' : ''}`}>
            <span className="decision-label">Chosen action</span>
            <strong>{reward.action}</strong>
            <span className="decision-sub">{active[0] ? 'Based on the current hazard' : 'Waiting for a hazard'}</span>
          </div>
          <div className="reward-mini">
            <div><span>Safety</span><i><b style={{ width: `${reward.safety}%` }} /></i><strong>{reward.safety}</strong></div>
            <div><span>Accuracy</span><i><b style={{ width: `${reward.accuracy}%` }} /></i><strong>{reward.accuracy}</strong></div>
            <div><span>Relevance</span><i><b style={{ width: `${reward.relevance}%` }} /></i><strong>{reward.relevance}</strong></div>
          </div>
          <div className="decision-foot"><span>Reward score</span><strong>{reward.score}<small>/100</small></strong></div>
          <p className="decision-note"><Icon name="shield" size={13} /> Safety always takes priority over comfort and ETA.</p>
        </Panel>

        <Panel className="vision-report" eyebrow="RUN SUMMARY" title="Ready for review">
          <div className="report-numbers">
            <div><strong>{custom ? '—' : events.length}</strong><span>hazards</span></div>
            <div><strong>{custom ? '—' : events.filter((event) => event.severity === 'critical').length}</strong><span>critical</span></div>
            <div><strong>{custom ? '—' : events.filter((event) => LINKED[event.id]).length}</strong><span>linked</span></div>
          </div>
          <div className="report-points">
            <span><Icon name="check" size={13} /> Each hazard is tied to a road location</span>
            <span><Icon name="check" size={13} /> Confidence shown for every detection</span>
            <span><Icon name="check" size={13} /> Human review before a civic case</span>
          </div>
          {hazard && <button className="link-btn" onClick={() => onOpenHazard(hazard.id)}>{hazard.id} · {hazard.landmark} <Icon name="arrowUpRight" size={13} /></button>}
          <button className="btn btn-dark full" disabled={reviewed || custom} onClick={() => { setReviewed(true); notify('Survey review recorded. Linked hazards are ready for the civic queue.'); }}><Icon name="check" size={15} /> {reviewed ? 'Review recorded' : 'Confirm review'}</button>
          <button className="btn btn-outline full" onClick={() => onNavigate('civic')}><Icon name="building" size={15} /> Open civic queue</button>
        </Panel>
      </aside>
    </div>
  </>;
}
