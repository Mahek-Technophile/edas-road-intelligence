import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type HazardType, type Severity } from '../types';
import '../components/vision/vision-lab.css';

const API_BASE = (import.meta.env.VITE_EDAS_API_BASE || 'http://localhost:8000/api/v1').replace(/\/$/, '');
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
type CapabilityStatus = 'ready' | 'unavailable' | 'MODEL_NOT_CONFIGURED' | 'failed';

interface DetectionEvent {
  event_id: string;
  timestamp_ms: number;
  model: string;
  class_id: number;
  class_name: string;
  label: string;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  track_id: number | null;
  inference_ms?: number;
  cursor?: number;
}

interface Job {
  job_id: string;
  status: JobStatus;
  progress: number;
  duration_ms: number | null;
  created_at: string;
  updated_at?: string;
  error_message?: string | null;
  video_url?: string | null;
}

interface ModelCapability {
  name: string;
  display_name: string;
  status: CapabilityStatus;
  classes: string[];
  confidence_threshold: number | null;
  reason?: string | null;
  device?: string | null;
  input_size?: number | null;
}

interface ModelsResponse {
  items: ModelCapability[];
  sample_fps: number;
  image_size: number;
  tracking_available: boolean;
}

interface VisionLabProps {
  token: string;
  onConnect: () => void;
  onHazardReported: (message: string) => void;
}

function apiErrorMessage(body: any, fallback: string) {
  return body?.error?.message || body?.detail || fallback;
}

async function apiRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let response: Response;
  try { response = await fetch(`${API_BASE}${path}`, { ...init, headers }); }
  catch { throw new ApiError('Could not reach the EDAS Vision API. Check the API address and connection.'); }
  if (!response.ok) {
    let body: any;
    try { body = await response.json(); } catch { /* Use status fallback. */ }
    throw new ApiError(apiErrorMessage(body, `Vision request failed (${response.status}).`), response.status, body?.error?.code);
  }
  return response.json() as Promise<T>;
}

function uploadJob(file: File, token: string, onProgress: (percent: number) => void): Promise<Job> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    const uploadFile = file.type === 'video/mp4' ? file : new File([file], file.name, { type: 'video/mp4' });
    form.append('video', uploadFile, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/vision/jobs`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new ApiError('Could not reach the EDAS Vision API.'));
    xhr.onabort = () => reject(new ApiError('Video upload was cancelled.'));
    xhr.onload = () => {
      let body: any;
      try { body = JSON.parse(xhr.responseText); } catch { body = null; }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(apiErrorMessage(body, `Video upload failed (${xhr.status}).`), xhr.status, body?.error?.code));
        return;
      }
      resolve(body as Job);
    };
    xhr.send(form);
  });
}

function normalizeEvent(value: any): DetectionEvent | null {
  const raw = value?.event || value;
  if (!raw || typeof raw !== 'object' || !Number.isFinite(Number(raw.timestamp_ms))) return null;
  const box = raw.bbox || raw.bounding_box;
  if (!box || ![box.x1, box.y1, box.x2, box.y2].every((n) => Number.isFinite(Number(n)))) return null;
  return {
    event_id: String(raw.event_id || raw.id || `${raw.timestamp_ms}-${raw.class_id}-${raw.model || 'model'}`),
    timestamp_ms: Number(raw.timestamp_ms),
    model: String(raw.model || raw.model_name || 'unknown'),
    class_id: Number(raw.class_id ?? -1),
    class_name: String(raw.class_name || raw.label || 'unknown'),
    label: String(raw.label || raw.class_name || 'Detection'),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    bbox: { x1: Number(box.x1), y1: Number(box.y1), x2: Number(box.x2), y2: Number(box.y2) },
    track_id: raw.track_id == null ? null : Number(raw.track_id),
    inference_ms: Number.isFinite(Number(raw.inference_ms)) ? Number(raw.inference_ms) : undefined,
    cursor: Number.isFinite(Number(raw.cursor)) ? Number(raw.cursor) : undefined,
  };
}

function formatTimestamp(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(Math.floor((milliseconds % 1000) / 100))}`;
}

function addUniqueEvents(current: DetectionEvent[], incoming: DetectionEvent[]) {
  if (!incoming.length) return current;
  const seen = new Set(current.map((item) => item.event_id));
  return [...current, ...incoming.filter((item) => !seen.has(item.event_id))].sort((a, b) => a.timestamp_ms - b.timestamp_ms || a.event_id.localeCompare(b.event_id));
}

export default function VisionLab({ token, onConnect, onHazardReported }: VisionLabProps) {
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [modelError, setModelError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [videoSrc, setVideoSrc] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [selected, setSelected] = useState<DetectionEvent | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDimensions, setVideoDimensions] = useState('');
  const [hazardType, setHazardType] = useState<HazardType>('pothole');
  const [severity, setSeverity] = useState<Severity>('high');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const originalVideo = useRef<HTMLVideoElement>(null);
  const virtualVideo = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!token) { setModels(null); setModelError(''); return; }
    const controller = new AbortController();
    apiRequest<ModelsResponse>('/vision/models', token, { signal: controller.signal })
      .then(setModels)
      .catch((reason) => { if (!controller.signal.aborted) setModelError(reason instanceof Error ? reason.message : 'Could not load model availability.'); });
    return () => controller.abort();
  }, [token]);

  useEffect(() => () => { if (videoSrc.startsWith('blob:')) URL.revokeObjectURL(videoSrc); }, [videoSrc]);

  const applyJob = useCallback((value: any) => {
    const next = value?.job || value;
    if (!next || typeof next !== 'object') return;
    setJob((previous) => ({
      job_id: String(next.job_id || next.id || previous?.job_id || ''),
      status: (next.status || previous?.status || 'queued') as JobStatus,
      progress: Math.max(0, Math.min(100, Number(next.progress ?? previous?.progress ?? 0))),
      duration_ms: next.duration_ms == null ? previous?.duration_ms ?? null : Number(next.duration_ms),
      created_at: String(next.created_at || previous?.created_at || new Date().toISOString()),
      updated_at: next.updated_at || previous?.updated_at,
      error_message: next.error_message || null,
      video_url: next.video_url || previous?.video_url || null,
    }));
  }, []);

  const refreshEvents = useCallback(async (jobId: string, after = 0) => {
    const result = await apiRequest<{ items?: any[]; next_cursor?: number }>(`/vision/jobs/${encodeURIComponent(jobId)}/events?after=${after}&limit=500`, token);
    const incoming = (result.items || []).map(normalizeEvent).filter((item): item is DetectionEvent => Boolean(item));
    setEvents((current) => addUniqueEvents(current, incoming));
    return Number(result.next_cursor || after);
  }, [token]);

  useEffect(() => {
    if (!job?.job_id || !token || ['completed', 'failed', 'cancelled'].includes(job.status)) return;
    const controller = new AbortController();
    let cursor = events.reduce((max, event) => Math.max(max, event.cursor || 0), 0);
    let polling: number | undefined;
    const poll = async () => {
      try {
        const next = await apiRequest<Job>(`/vision/jobs/${encodeURIComponent(job.job_id)}`, token, { signal: controller.signal });
        applyJob(next);
        cursor = await refreshEvents(job.job_id, cursor);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not refresh video analysis.');
      }
    };
    const consumeSse = async () => {
      try {
        const response = await fetch(`${API_BASE}/vision/jobs/${encodeURIComponent(job.job_id)}/stream`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error('Progress stream unavailable; using polling.');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || '';
          for (const block of blocks) {
            let eventName = 'message';
            let data = '';
            let eventId = '';
            for (const line of block.split(/\r?\n/)) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('id:')) eventId = line.slice(3).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            if (!data) continue;
            try {
              const parsed = JSON.parse(data);
              if (eventName === 'detection') {
                const detection = normalizeEvent({ ...parsed, cursor: parsed.cursor ?? Number(eventId) });
                if (detection) setEvents((current) => addUniqueEvents(current, [detection]));
              } else if (eventName === 'progress' || eventName === 'status' || eventName === 'message') {
                applyJob(parsed);
              }
            } catch { /* Ignore malformed event frames; a subsequent API read can recover. */ }
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          polling = window.setInterval(() => { void poll(); }, 1500);
          void poll();
        }
      }
    };
    void refreshEvents(job.job_id, cursor).catch(() => undefined);
    void poll();
    void consumeSse();
    return () => { controller.abort(); if (polling) window.clearInterval(polling); };
    // Events are maintained inside this subscription; job identity/status controls its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.job_id, job?.status, token, applyJob, refreshEvents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let animation = 0;
    const draw = () => {
      const video = virtualVideo.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (video?.videoWidth && video.videoHeight) {
        const scaleX = width / video.videoWidth;
        const scaleY = height / video.videoHeight;
        const now = video.currentTime * 1000;
        const active = events.filter((event) => Math.abs(event.timestamp_ms - now) <= 700);
        for (const event of active) {
          const x = event.bbox.x1 * scaleX;
          const y = event.bbox.y1 * scaleY;
          const boxWidth = Math.max(1, (event.bbox.x2 - event.bbox.x1) * scaleX);
          const boxHeight = Math.max(1, (event.bbox.y2 - event.bbox.y1) * scaleY);
          ctx.strokeStyle = event.class_name === 'D40' || /pothole/i.test(event.label) ? '#ff705e' : '#ffc85a';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, boxWidth, boxHeight);
          const caption = `${event.label} · ${(event.confidence * 100).toFixed(0)}%`;
          ctx.font = '600 12px system-ui';
          const labelWidth = ctx.measureText(caption).width + 12;
          ctx.fillStyle = '#1b2924e8';
          ctx.fillRect(x, Math.max(0, y - 23), labelWidth, 20);
          ctx.fillStyle = '#fff';
          ctx.fillText(caption, x + 6, Math.max(14, y - 9));
        }
      }
      animation = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animation);
  }, [events, videoSrc]);

  const activeAtTime = useMemo(() => events.filter((event) => Math.abs(event.timestamp_ms - currentTime * 1000) <= 1000), [events, currentTime]);
  const readyModels = (models?.items || []).filter((item) => item.status === 'ready').length;
  const jobActive = Boolean(job && ['queued', 'processing'].includes(job.status));

  function chooseFile(next: File | null) {
    setError(''); setJob(null); setEvents([]); setSelected(null); setUploadProgress(null); setVideoDimensions('');
    if (videoSrc.startsWith('blob:')) URL.revokeObjectURL(videoSrc);
    setVideoSrc(''); setFile(null);
    if (!next) return;
    if (next.type !== 'video/mp4' && !next.name.toLowerCase().endsWith('.mp4')) { setError('Choose an MP4 video file.'); return; }
    if (next.size > MAX_VIDEO_BYTES) { setError('Video must be 200 MiB or smaller.'); return; }
    setFile(next); setVideoSrc(URL.createObjectURL(next));
  }

  async function startAnalysis() {
    if (!token) { onConnect(); return; }
    if (!file) { setError('Choose an MP4 video before starting analysis.'); return; }
    setBusy(true); setError(''); setEvents([]); setSelected(null); setUploadProgress(0);
    try {
      const created = await uploadJob(file, token, setUploadProgress);
      applyJob(created);
      setJob({ ...created, job_id: created.job_id || (created as any).id || '' });
      setUploadProgress(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not upload this video.');
      setUploadProgress(null);
    } finally { setBusy(false); }
  }

  async function cancelJob() {
    if (!job?.job_id) return;
    try {
      const result = await apiRequest<Job>(`/vision/jobs/${encodeURIComponent(job.job_id)}/cancel`, token, { method: 'POST' });
      applyJob(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not cancel this job.'); }
  }

  async function reportSelected() {
    if (!selected) return;
    const lat = Number(latitude), lon = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      setError('Enter a valid latitude and longitude before submitting a reviewed hazard.'); return;
    }
    setReportBusy(true); setError('');
    try {
      const category: HazardType = selected.class_name === 'D40' || /pothole/i.test(selected.label) ? 'pothole' : 'road_damage';
      await apiRequest('/hazard-reports', token, {
        method: 'POST',
        body: JSON.stringify({
          hazard_type: hazardType === 'road_damage' ? category : hazardType,
          latitude: lat,
          longitude: lon,
          severity,
          description: `Reviewed from Vision Lab at ${formatTimestamp(selected.timestamp_ms)} — ${selected.label} (${(selected.confidence * 100).toFixed(0)}% model confidence).`,
          evidence_id: null,
          source: 'manual',
        }),
      });
      onHazardReported('Reviewed video detection submitted as a manual hazard report.');
      setSelected(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit this reviewed hazard.'); }
    finally { setReportBusy(false); }
  }

  function seekTo(milliseconds: number) {
    const a = originalVideo.current, b = virtualVideo.current;
    if (a) a.currentTime = milliseconds / 1000;
    if (b) b.currentTime = milliseconds / 1000;
    setCurrentTime(milliseconds / 1000);
  }

  async function syncPlay() {
    if (virtualVideo.current) { virtualVideo.current.currentTime = originalVideo.current?.currentTime || 0; await virtualVideo.current.play().catch(() => undefined); }
  }

  return <section className="vision-lab">
    <div className="vision-intro panel">
      <div><span className="eyebrow">VISION LAB · HUMAN REVIEW REQUIRED</span><h2>Turn road footage into reviewable events</h2><p>Upload a short MP4, inspect time-synchronized detections, then choose whether to submit a hazard. Vision events are never published automatically.</p></div>
      <div className="vision-pipeline-status"><span className={`vision-status-dot ${readyModels ? 'ready' : ''}`} /><div><strong>{models ? `${readyModels} detector${readyModels === 1 ? '' : 's'} ready` : token ? 'Checking models' : 'Sign in to check models'}</strong><small>{models ? `${models.sample_fps} FPS sampling target · ${models.image_size}px input` : 'Availability comes from the EDAS API'}</small></div></div>
    </div>

    {!token && <div className="vision-notice" role="status"><strong>Connect to EDAS to continue.</strong><span>Vision jobs require your authenticated Supabase access token.</span><button className="button button-dark" onClick={onConnect}>Connect</button></div>}
    {error && <div className="vision-error" role="alert"><span>!</span><div><strong>Vision Lab request failed</strong><p>{error}</p></div><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    {modelError && <div className="vision-error" role="alert"><span>!</span><div><strong>Model availability could not be loaded</strong><p>{modelError}</p></div></div>}

    <div className="vision-grid">
      <section className="vision-main-column">
        <div className="vision-upload-card panel">
          <div className="vision-section-heading"><div><span className="eyebrow">01 · SOURCE VIDEO</span><h3>Choose dashcam footage</h3></div><span className="vision-limit">MP4 · up to 200 MiB · 10 min max</span></div>
          <label className={`vision-file-drop ${file ? 'has-file' : ''}`}>
            <input type="file" accept="video/mp4,.mp4" onChange={(event) => chooseFile(event.target.files?.[0] || null)} disabled={busy || jobActive} />
            <span className="vision-upload-icon">{file ? '✓' : '↑'}</span>
            <span className="vision-file-copy"><strong>{file?.name || 'Select an MP4 video'}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MiB · ${file.type || 'video/mp4'}` : '1080p H.264 recommended · source stays private'}</small></span>
            <span className="button button-outline">Browse</span>
          </label>
          {uploadProgress !== null && <div className="vision-upload-progress"><div><span>Uploading video</span><b>{uploadProgress}%</b></div><div className="vision-progress-track"><i style={{ width: `${uploadProgress}%` }} /></div></div>}
          <div className="vision-upload-actions"><div className="vision-privacy-note"><span>▣</span><small>Video is stored privately for this job. Processing runs on CPU; 10 FPS is a sampling target, not a speed guarantee.</small></div><button className="button button-dark" onClick={() => void startAnalysis()} disabled={!file || busy || !token || jobActive}>{busy ? 'Uploading…' : jobActive ? 'Analysis running' : 'Upload & analyze'} <span>→</span></button></div>
        </div>

        <div className="vision-player-card panel">
          <div className="vision-section-heading"><div><span className="eyebrow">02 · SYNCHRONIZED REVIEW</span><h3>Driver display</h3></div><span className="vision-current-time">{formatTimestamp(currentTime * 1000)}</span></div>
          <div className="vision-player-grid">
            <div className="vision-player-pane"><div className="vision-pane-label"><span>ORIGINAL FOOTAGE</span><span>{videoSrc ? videoDimensions || 'Reading source size…' : 'No video loaded'}</span></div>{videoSrc ? <video ref={originalVideo} src={videoSrc} controls playsInline onLoadedMetadata={(event) => { const video = event.currentTarget; setVideoDimensions(`${video.videoWidth} × ${video.videoHeight}`); }} onTimeUpdate={(event) => { const time = event.currentTarget.currentTime; setCurrentTime(time); const other = virtualVideo.current; if (other && Math.abs(other.currentTime - time) > 0.35) other.currentTime = time; }} onPlay={() => void syncPlay()} onPause={() => virtualVideo.current?.pause()} onSeeked={() => { const a = originalVideo.current, b = virtualVideo.current; if (a && b && Math.abs(a.currentTime - b.currentTime) > 0.1) b.currentTime = a.currentTime; }} /> : <div className="vision-video-empty"><span>▶</span><strong>Your video will appear here</strong><small>Choose an MP4 file to preview the original footage.</small></div>}</div>
            <div className="vision-player-pane"><div className="vision-pane-label"><span>VIRTUAL DRIVER DISPLAY</span><span>{activeAtTime.length} event{activeAtTime.length === 1 ? '' : 's'} at this time</span></div><div className="vision-driver-screen">{videoSrc ? <><video ref={virtualVideo} src={videoSrc} muted playsInline onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} /><canvas ref={canvasRef} aria-label="Timestamp-synchronized detection overlay" /></> : <div className="vision-video-empty"><span>◉</span><strong>Detection overlay</strong><small>Video and model-backed boxes stay synchronized during playback.</small></div>}</div></div>
          </div>
          <div className="vision-player-foot"><span><i className="vision-legend-box" /> Model detection · coordinates in original-frame pixels</span>{models?.tracking_available ? <span>Track IDs available</span> : <span>Object tracking unavailable</span>}</div>
        </div>

        <div className="vision-timeline-card panel">
          <div className="vision-section-heading"><div><span className="eyebrow">03 · EVENT TIMELINE</span><h3>Detections</h3></div><span className="vision-limit">{events.length} event{events.length === 1 ? '' : 's'}</span></div>
          {events.length ? <div className="vision-event-list">{events.map((event) => <button key={event.event_id} className={`vision-event-row ${selected?.event_id === event.event_id ? 'selected' : ''}`} onClick={() => { setSelected(event); setHazardType(event.class_name === 'D40' || /pothole/i.test(event.label) ? 'pothole' : 'road_damage'); seekTo(event.timestamp_ms); }}><span className="vision-event-time">{formatTimestamp(event.timestamp_ms)}</span><span className={`vision-event-mark ${event.class_name === 'D40' || /pothole/i.test(event.label) ? 'pothole' : ''}`} /> <span className="vision-event-name"><strong>{event.label}</strong><small>{event.model} · {event.class_name}{event.track_id == null ? '' : ` · track ${event.track_id}`}</small></span><span className="vision-confidence">{(event.confidence * 100).toFixed(0)}%</span><span className="vision-event-arrow">↗</span></button>)}</div> : <div className="vision-empty-events"><span>⌁</span><strong>{job?.status === 'processing' ? 'Waiting for model events' : 'No detection events yet'}</strong><small>{job?.status === 'processing' ? 'New events will appear as frames are processed.' : 'Start a video job to see timestamped detections here.'}</small></div>}
        </div>
      </section>

      <aside className="vision-side-column">
        <div className="vision-job-card panel"><div className="vision-section-heading"><div><span className="eyebrow">JOB STATUS</span><h3>{job ? job.status[0].toUpperCase() + job.status.slice(1) : 'Ready when you are'}</h3></div><span className={`vision-job-badge ${job?.status || 'idle'}`}>{job?.status || 'idle'}</span></div>
          {job ? <><div className="vision-progress-track"><i style={{ width: `${job.progress}%` }} /></div><div className="vision-job-meta"><span>Progress</span><b>{job.progress}%</b></div><div className="vision-job-meta"><span>Source duration</span><b>{job.duration_ms == null ? 'Checking…' : formatTimestamp(job.duration_ms)}</b></div><div className="vision-job-meta"><span>Job ID</span><code>{job.job_id.slice(0, 8)}</code></div>{job.error_message && <p className="vision-job-error">{job.error_message}</p>}{['queued', 'processing'].includes(job.status) && <button className="button button-outline vision-cancel" onClick={() => void cancelJob()}>Cancel analysis</button>}</> : <p className="vision-job-hint">Upload a clip to create an asynchronous analysis job.</p>}
        </div>

        <div className="vision-models-card panel"><div className="vision-section-heading"><div><span className="eyebrow">DETECTOR CAPABILITIES</span><h3>Available models</h3></div></div>
          {models?.items?.length ? <div className="vision-model-list">{models.items.map((model) => <div key={model.name} className="vision-model-row"><span className={`vision-model-indicator ${model.status === 'ready' ? 'ready' : ''}`} /><div><strong>{model.display_name}</strong><small>{model.classes.length ? model.classes.join(' · ') : model.reason || 'Not configured'}</small></div><span className={`vision-model-status ${model.status === 'ready' ? 'ready' : ''}`}>{model.status === 'ready' ? 'Ready' : 'Unavailable'}</span></div>)}</div> : <div className="vision-empty-models">{modelError ? 'Availability could not be confirmed.' : token ? 'Loading detector status…' : 'Connect to see current detector status.'}</div>}
          <p className="vision-model-note">Unavailable capabilities stay disabled. Only configured model outputs are shown; the UI does not generate placeholder detections.</p>
        </div>

        <div className="vision-review-card panel"><div className="vision-section-heading"><div><span className="eyebrow">04 · HUMAN REVIEW</span><h3>Submit selected event</h3></div></div>
          {selected ? <><div className="vision-selected-event"><span className="vision-event-mark pothole" /><div><strong>{selected.label}</strong><small>{formatTimestamp(selected.timestamp_ms)} · {(selected.confidence * 100).toFixed(0)}% confidence</small></div></div><p className="vision-review-warning">Review the frame and location before reporting. This action creates a normal manual EDAS hazard report; it does not publish the model event directly.</p><label className="vision-form-field">Hazard category<select value={hazardType} onChange={(event) => setHazardType(event.target.value as HazardType)}><option value="pothole">Pothole</option><option value="road_damage">Road damage</option><option value="open_manhole">Open manhole</option><option value="waterlogging">Waterlogging</option><option value="obstruction">Obstruction</option></select></label><label className="vision-form-field">Severity<select value={severity} onChange={(event) => setSeverity(event.target.value as Severity)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><div className="vision-coordinate-fields"><label className="vision-form-field">Latitude<input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="18.5204" /></label><label className="vision-form-field">Longitude<input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="73.8567" /></label></div><button className="button button-dark vision-submit-report" disabled={reportBusy || !token} onClick={() => void reportSelected()}>{reportBusy ? 'Submitting…' : 'Submit reviewed hazard'} <span>→</span></button></> : <div className="vision-review-empty"><span>✓</span><strong>Select a timeline event</strong><small>Events are not hazards until a person reviews and submits them.</small></div>}
        </div>
      </aside>
    </div>
  </section>;
}
