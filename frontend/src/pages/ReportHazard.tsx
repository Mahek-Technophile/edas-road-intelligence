import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Badge, PageHeader, Panel } from '../components/ui';
import { pct, relativeTime } from '../pilot/format';
import { usePilot } from '../pilot/store';
import { KIND_META, KINDS, SEVERITIES, SEVERITY_META, type Hazard, type HazardKind, type Severity } from '../pilot/types';
import type { PageId } from '../navigation';

function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

export default function ReportHazard({ onNavigate, onOpenHazard }: { onNavigate: (page: PageId) => void; onOpenHazard: (id: string) => void }) {
  const { hazards, addHazard, notify } = usePilot();
  const [kind, setKind] = useState<HazardKind>('pothole');
  const [severity, setSeverity] = useState<Severity>('high');
  const [road, setRoad] = useState('Sinhagad Road');
  const [landmark, setLandmark] = useState('');
  const [latitude, setLatitude] = useState('18.4896');
  const [longitude, setLongitude] = useState('73.8297');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Hazard | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const nearest = useMemo(() => {
    const lat = Number(latitude); const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    let best: { hazard: Hazard; distance: number } | null = null;
    for (const hazard of hazards) {
      const distance = distanceMetres(lat, lng, hazard.lat, hazard.lng);
      if (!best || distance < best.distance) best = { hazard, distance };
    }
    return best && best.distance < 220 ? best : null;
  }, [hazards, latitude, longitude]);

  function useLocation() {
    setFieldError('');
    if (!navigator.geolocation) { setFieldError('Location access is not available in this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setGpsAccuracy(Math.round(position.coords.accuracy));
        notify('GPS position captured for this report.');
      },
      () => setFieldError('Location access was unavailable. Enter the coordinates manually.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function chooseFile(next: File | null) {
    setFieldError('');
    if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) { setFieldError('Choose a JPEG, PNG or WebP photograph.'); return; }
    if (next.size > 10 * 1024 * 1024) { setFieldError('Photographs must be 10 MB or smaller.'); return; }
    setFile(next);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setFieldError('');
    const lat = Number(latitude); const lng = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) { setFieldError('Enter valid WGS84 latitude and longitude values.'); return; }
    if (!road.trim()) { setFieldError('Add the road or corridor for this hazard.'); return; }
    setBusy(true);
    window.setTimeout(() => {
      const hazard = addHazard({ kind, severity, lat, lng, road: road.trim(), landmark: landmark.trim() || 'Driver-reported location', description: description.trim(), source: 'Driver app' });
      setBusy(false);
      setCreated(hazard);
      notify(`Report ${hazard.id} added to the Pune register.`);
    }, 550);
  }

  function reset() {
    setCreated(null);
    setKind('pothole'); setSeverity('high'); setRoad('Sinhagad Road'); setLandmark('');
    setDescription(''); setFile(null); setGpsAccuracy(null); setError(''); setFieldError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  if (created) {
    return <>
      <PageHeader eyebrow="COMMUNITY REPORT · RECEIVED" title="Report added to the register" copy="Your observation is now part of the Pune road-condition record and will be matched with nearby vehicle reports." actions={<button className="btn btn-outline" onClick={() => onNavigate('reports')}><Icon name="list" size={15} /> Hazard register</button>} />
      <div className="report-success">
        <div className="success-main">
          <span className="success-icon"><Icon name="check" size={30} /></span>
          <span className="eyebrow">REFERENCE {created.id}</span>
          <h2>{KIND_META[created.kind].label} reported</h2>
          <p>{created.landmark} · {created.road}</p>
          <div className="success-meta">
            <div><span>Severity</span><strong>{SEVERITY_META[created.severity].label}</strong></div>
            <div><span>Status</span><strong>Reported</strong></div>
            <div><span>Consensus</span><strong>{pct(created.confidence)}</strong></div>
            <div><span>Location</span><strong>{created.lat.toFixed(5)}, {created.lng.toFixed(5)}</strong></div>
          </div>
          <div className="success-actions">
            <button className="btn btn-dark" onClick={() => onOpenHazard(created.id)}>Open hazard record <Icon name="arrowUpRight" size={14} /></button>
            <button className="btn btn-outline" onClick={reset}>Report another hazard</button>
          </div>
        </div>
        <div className="success-side">
          <div className="success-trail">
            <h3>What happens next</h3>
            <div className="next-step complete"><span>1</span><div><strong>Observation recorded</strong><small>Location, category and evidence saved.</small></div></div>
            <div className="next-step active"><span>2</span><div><strong>Corridor matching</strong><small>Vehicles approaching the same location contribute independent observations.</small></div></div>
            <div className="next-step"><span>3</span><div><strong>Verification and dispatch</strong><small>Once consensus is reached, the case enters the municipal queue.</small></div></div>
            <div className="next-step"><span>4</span><div><strong>Repair re-observed</strong><small>A passing vehicle verifies the completed work.</small></div></div>
          </div>
          <div className="success-note"><Icon name="shield" size={15} /> Reports are tied to an authenticated driver account; your identity is not shown to other drivers.</div>
        </div>
      </div>
    </>;
  }

  return <>
    <PageHeader
      eyebrow="COMMUNITY REPORT · DRIVER APP"
      title="Report a road hazard"
      copy="A precise location and category are enough to start the verification chain."
      actions={<button className="btn btn-outline" onClick={() => onNavigate('reports')}><Icon name="list" size={15} /> Cancel</button>}
    />

    <div className="report-layout">
      <Panel className="report-form-panel">
        <form onSubmit={submit}>
          {(error || fieldError) && <div className="inline-error"><Icon name="alert" size={15} />{fieldError || error}</div>}
          <div className="form-section">
            <div className="form-section-head"><span className="form-step">01</span><div><h3>Hazard category</h3><p>Choose the closest match. One category per report.</p></div></div>
            <div className="kind-grid">
              {KINDS.map((value) => <button type="button" key={value} className={`kind-option ${kind === value ? 'selected' : ''}`} onClick={() => setKind(value)} aria-pressed={kind === value}>
                <span className={`kind-icon ${severity}`}>{KIND_META[value].icon}</span>
                <span><strong>{KIND_META[value].label}</strong><small>{value === 'pothole' ? 'Surface depression' : value === 'road_crack' ? 'Fractured asphalt' : value === 'open_manhole' ? 'Missing cover' : value === 'waterlogging' ? 'Standing water' : value === 'obstruction' ? 'Debris or blockage' : 'Collision-related'}</small></span>
                {kind === value && <Icon name="check" size={15} />}
              </button>)}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-head"><span className="form-step">02</span><div><h3>Severity</h3><p>How much risk does this create for a two-wheeler or car?</p></div></div>
            <div className="severity-picker">
              {SEVERITIES.map((value) => <button type="button" key={value} className={`severity-choice ${value} ${severity === value ? 'selected' : ''}`} onClick={() => setSeverity(value)}>
                <i /><strong>{SEVERITY_META[value].label}</strong><small>{value === 'low' ? 'Cosmetic' : value === 'medium' ? 'Uneven ride' : value === 'high' ? 'Damage risk' : 'Immediate danger'}</small>
              </button>)}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-head"><span className="form-step">03</span><div><h3>Location</h3><p>Precision within 35 m links your report to other vehicles.</p></div><button type="button" className="text-btn" onClick={useLocation}><Icon name="pin" size={14} /> Use my location</button></div>
            <div className="field-grid">
              <label className="field"><span>Road or corridor <b>*</b></span><input value={road} onChange={(event) => setRoad(event.target.value)} placeholder="e.g. Sinhagad Road" /></label>
              <label className="field"><span>Landmark</span><input value={landmark} onChange={(event) => setLandmark(event.target.value)} placeholder="e.g. Nanded City gate" /></label>
              <label className="field"><span>Latitude <b>*</b></span><input value={latitude} onChange={(event) => setLatitude(event.target.value)} inputMode="decimal" placeholder="18.4896" /></label>
              <label className="field"><span>Longitude <b>*</b></span><input value={longitude} onChange={(event) => setLongitude(event.target.value)} inputMode="decimal" placeholder="73.8297" /></label>
            </div>
            <div className="location-note">
              <span><Icon name="target" size={14} /> WGS84 decimal degrees</span>
              {gpsAccuracy !== null && <span><Icon name="check" size={13} /> GPS accuracy ±{gpsAccuracy} m</span>}
              {nearest && <span className="nearest-warning"><Icon name="network" size={14} /> Existing case {Math.round(nearest.distance)} m away: <button type="button" onClick={() => onOpenHazard(nearest.hazard.id)}>{nearest.hazard.id} · {KIND_META[nearest.hazard.kind].label}</button></span>}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-head"><span className="form-step">04</span><div><h3>Details and evidence</h3><p>Optional notes help the repair crew find the exact defect.</p></div></div>
            <label className="field"><span>Description <small>{description.length}/600</small></span><textarea rows={3} maxLength={600} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the size, position in the lane and any immediate risk." /></label>
            <label className={`upload-box ${file ? 'has-file' : ''}`}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
              {preview ? <img src={preview} alt="Hazard evidence preview" /> : <span className="upload-icon"><Icon name="camera" size={20} /></span>}
              <span className="upload-copy"><strong>{file ? file.name : 'Add a photograph'}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ready to attach` : 'JPEG, PNG or WebP · up to 10 MB'}</small></span>
              <span className="btn btn-outline small">{file ? 'Replace' : 'Choose file'}</span>
            </label>
            {file && <button type="button" className="text-btn danger" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}><Icon name="close" size={13} /> Remove photograph</button>}
          </div>

          <div className="form-submit">
            <div className="submit-note"><Icon name="shield" size={15} /><span><strong>Privacy first</strong><br />Only this photograph and hazard metadata are shared. Continuous video stays on your device.</span></div>
            <button type="submit" className="btn btn-dark" disabled={busy}>{busy ? <><span className="spinner" /> Submitting report</> : <>Submit report <Icon name="send" size={15} /></>}</button>
          </div>
        </form>
      </Panel>

      <aside className="report-side">
        <Panel className="live-summary" eyebrow="REPORT PREVIEW" title="What the network sees">
          <div className={`summary-hazard ${severity}`}>
            <span className={`kind-icon large ${severity}`}>{KIND_META[kind].icon}</span>
            <div><strong>{KIND_META[kind].label}</strong><small>{road || 'Road not set'} · {landmark || 'Location pending'}</small></div>
            <Badge tone={SEVERITY_META[severity].tone}>{SEVERITY_META[severity].label}</Badge>
          </div>
          <div className="summary-meta">
            <div><span>Initial confidence</span><strong>0.64</strong></div>
            <div><span>Status</span><strong>Reported</strong></div>
            <div><span>Nearby reports</span><strong>{nearest ? nearest.hazard.reports : 0}</strong></div>
            <div><span>Match radius</span><strong>35 m</strong></div>
          </div>
          {nearest ? <div className="duplicate-note"><Icon name="network" size={14} /><span><strong>Possible duplicate nearby</strong> {nearest.hazard.id} is {Math.round(nearest.distance)} m away and last seen {relativeTime(nearest.hazard.lastSeen)}. Reports within 35 m are merged automatically.</span></div>
            : <div className="duplicate-note clear"><Icon name="check" size={14} /><span>No existing case within 220 m of this location.</span></div>}
        </Panel>

        <Panel eyebrow="AFTER SUBMISSION" title="Verification timeline">
          <div className="next-steps">
            <div className="next-step complete"><span>1</span><div><strong>Report recorded</strong><small>Location and category stored immediately.</small></div></div>
            <div className="next-step"><span>2</span><div><strong>Independent confirmation</strong><small>Nearby vehicles add observations inside the 35 m cell.</small></div></div>
            <div className="next-step"><span>3</span><div><strong>Alert published</strong><small>Drivers approaching the hazard receive a proximity alert.</small></div></div>
            <div className="next-step"><span>4</span><div><strong>Civic case opened</strong><small>Verified hazards enter the municipal repair queue.</small></div></div>
          </div>
        </Panel>

        <div className="privacy-card">
          <Icon name="shield" size={18} />
          <div><strong>Designed for the road</strong><p>Battery-aware sampling, offline queueing and a 10 fps on-device target keep the driver app practical.</p></div>
        </div>
      </aside>
    </div>
  </>;
}
