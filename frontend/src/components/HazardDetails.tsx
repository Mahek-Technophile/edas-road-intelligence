import { useMemo, useState } from 'react';
import { getEvidenceUrl, resolveChallenge, updateStatus } from '../api';
import type { Hazard, HazardDetail } from '../types';
import { HazardMap } from './HazardMap';

const pretty = (value: string) => value.replace(/_/g, ' ');
const when = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function HazardDrawer({ detail, token, onClose, onChanged, canReview = true }: {
  detail: HazardDetail;
  token: string;
  onClose: () => void;
  onChanged: () => void;
  canReview?: boolean;
}) {
  const { hazard, observations, challenges } = detail;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<Record<string, string>>({});
  const nextStatus: Partial<Record<Hazard['status'], Hazard['status']>> = { reported: 'verified', verified: 'assigned', assigned: 'repaired' };

  async function showEvidence(id: string) {
    setBusyId(id); setError('');
    try {
      const result = await getEvidenceUrl(token, id);
      setEvidenceUrls((old) => ({ ...old, [id]: result.read_url }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load evidence.'); }
    finally { setBusyId(null); }
  }

  async function changeStatus(status: Hazard['status']) {
    const reason = window.prompt(`Optional reason for marking this hazard ${pretty(status)}:`, '') ?? null;
    if (reason === null) return;
    setBusyId('status'); setError('');
    try {
      await updateStatus(token, hazard.id, status, reason);
      onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update status.'); }
    finally { setBusyId(null); }
  }

  async function decideChallenge(id: string, status: 'accepted' | 'rejected') {
    const note = window.prompt(`Optional resolution note (${status}):`, '') ?? null;
    if (note === null) return;
    setBusyId(id); setError('');
    try {
      await resolveChallenge(token, id, status, note);
      onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not resolve challenge.'); }
    finally { setBusyId(null); }
  }

  const targetStatus = nextStatus[hazard.status];

  return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="detail-drawer" aria-label="Hazard details">
      <div className="drawer-top"><span className="eyebrow">HAZARD RECORD</span><button className="icon-button" onClick={onClose} aria-label="Close details">×</button></div>
      <div className="detail-title-row"><div><span className={`severity-mark ${hazard.severity}`} /> <span className="eyebrow">{pretty(hazard.severity)} priority</span><h2>{pretty(hazard.hazard_type)}</h2></div><span className={`status-pill ${hazard.status}`}>{pretty(hazard.status)}</span></div>
      <p className="detail-copy">{hazard.description || 'No description provided.'}</p>
      <div className="detail-stats"><div><strong>{hazard.confirmation_count}</strong><span>independent reporters</span></div><div><strong>{hazard.observation_count}</strong><span>observations</span></div><div><strong>{Math.round(hazard.confidence_score * 100)}%</strong><span>confidence</span></div></div>
      <div className="detail-location"><span className="pin-dot">⌖</span><div><strong>{hazard.latitude.toFixed(5)}, {hazard.longitude.toFixed(5)}</strong><span>WGS84 coordinates · Pune pilot area</span></div></div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <section className="drawer-section"><div className="section-heading"><h3>Activity</h3><span>{observations.length} records</span></div>
        {observations.length === 0 ? <p className="muted">No observations yet.</p> : <div className="activity-list">{observations.map((item) => <article className="activity-item" key={item.id}><span className={`activity-dot ${item.disposition}`} /><div className="activity-content"><div className="activity-meta"><strong>{pretty(item.disposition)}</strong><time>{when(item.created_at)}</time></div><p>{item.description || `Reported as ${pretty(item.hazard_type)} · ${pretty(item.severity)} priority`}</p>{item.evidence_id && <div className="evidence-row"><button className="text-button" onClick={() => showEvidence(item.evidence_id!)} disabled={busyId === item.evidence_id}>{busyId === item.evidence_id ? 'Loading…' : 'View private evidence ↗'}</button>{evidenceUrls[item.evidence_id] && <a href={evidenceUrls[item.evidence_id]} target="_blank" rel="noreferrer">Open image</a>}</div>}</div></article>)}</div>}
      </section>
      {challenges.length > 0 && <section className="drawer-section"><div className="section-heading"><h3>Repair challenges</h3><span>{challenges.length}</span></div>{challenges.map((challenge) => <div className="challenge-card" key={challenge.id}><div className="challenge-top"><strong>Challenge submitted</strong><span className={`status-pill ${challenge.status}`}>{pretty(challenge.status)}</span></div><p>{when(challenge.submitted_at)}{challenge.resolution_note ? ` · ${challenge.resolution_note}` : ''}</p>{challenge.status === 'pending' && <div className="button-row"><button className="button button-outline" disabled={!canReview || busyId === challenge.id} onClick={() => decideChallenge(challenge.id, 'rejected')}>Reject</button><button className="button button-dark" disabled={!canReview || busyId === challenge.id} onClick={() => decideChallenge(challenge.id, 'accepted')}>Accept challenge</button></div>}</div>)}</section>}
      <section className="drawer-section"><div className="section-heading"><h3>Status history</h3><span>Reported {when(hazard.first_seen_at)}</span></div><div className="status-track">{(['reported', 'verified', 'assigned', 'repaired'] as const).map((status) => <div className={`status-step ${['reported', 'verified', 'assigned', 'repaired'].indexOf(hazard.status) >= ['reported', 'verified', 'assigned', 'repaired'].indexOf(status) ? 'done' : ''}`} key={status}><span className="step-dot" /><span>{pretty(status)}</span></div>)}</div>{targetStatus && <button className="button button-dark full-button" disabled={!canReview || busyId === 'status'} onClick={() => changeStatus(targetStatus)}>{busyId === 'status' ? 'Saving…' : `Mark ${pretty(targetStatus)}`}</button>}{!canReview && (targetStatus || challenges.some((c) => c.status === 'pending')) && <p className="muted small">Admin access is required for status and challenge decisions.</p>}</section>
      <div className="detail-footer">Last observed {when(hazard.last_seen_at)} <span>·</span> ID {hazard.id.slice(0, 8)}</div>
    </aside>
  </div>;
}

export function MapPanel({ hazards, onSelect }: { hazards: Hazard[]; onSelect: (id: string) => void }) {
  const counts = useMemo(() => ({ critical: hazards.filter((h) => h.severity === 'critical').length, open: hazards.filter((h) => h.status !== 'repaired').length }), [hazards]);
  return <div className="map-shell"><div className="map-topbar"><div><span className="eyebrow">PUNE · LIVE HAZARDS</span><h2>Road conditions map</h2></div><div className="map-totals"><span><b>{counts.open}</b> open</span><span className="critical-count"><b>{counts.critical}</b> critical</span></div></div><div className="map-frame"><HazardMap hazards={hazards} onSelect={onSelect} /></div><div className="map-legend"><span><i className="legend-dot critical" /> Critical</span><span><i className="legend-dot high" /> High</span><span><i className="legend-dot medium" /> Medium</span><span><i className="legend-dot low" /> Low</span><small>Map data from OpenStreetMap</small></div></div>;
}
