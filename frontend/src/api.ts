import { ApiError, type AnalyticsSummary, type HazardDetail, type HazardList, type HazardStatus, type HazardType, type ReportResult, type Severity } from './types';

const API_BASE = (import.meta.env.VITE_EDAS_API_BASE || 'http://localhost:8000/api/v1').replace(/\/$/, '');

async function request<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)) {
    headers.set('Content-Type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError('Could not reach the EDAS API. Check the API address and your connection.');
  }
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    let code: string | undefined;
    try {
      const body = await response.json();
      if (body?.error?.message) message = body.error.message;
      if (body?.error?.code) code = body.error.code;
    } catch { /* Keep the generic response message. */ }
    throw new ApiError(message, response.status, code);
  }
  return response.json() as Promise<T>;
}

export function getHazards(token: string, filters: { status?: string; severity?: string; hazard_type?: string } = {}) {
  const query = new URLSearchParams({ limit: '100', offset: '0', sort: 'last_seen_desc' });
  Object.entries(filters).forEach(([key, value]) => value && query.set(key, value));
  return request<HazardList>(`/hazards?${query}`, token);
}

export function getSummary(token: string) {
  return request<AnalyticsSummary>('/analytics/summary', token);
}

export function getHazard(token: string, id: string) {
  return request<HazardDetail>(`/hazards/${encodeURIComponent(id)}`, token);
}

export function createReport(token: string, input: { hazard_type: HazardType; latitude: number; longitude: number; severity: Severity; description: string; evidence_id: string | null; source: 'manual' }) {
  return request<ReportResult>('/hazard-reports', token, { method: 'POST', body: JSON.stringify(input) });
}

export interface UploadTicket {
  evidence_id: string;
  bucket: string;
  object_path: string;
  upload_url: string;
  expires_at: string;
  required_headers: Record<string, string>;
}

export async function uploadEvidence(token: string, file: File) {
  const ticket = await request<UploadTicket>('/evidence/upload-url', token, {
    method: 'POST', body: JSON.stringify({ content_type: file.type, size_bytes: file.size }),
  });
  const response = await fetch(ticket.upload_url, {
    method: 'PUT',
    headers: ticket.required_headers,
    body: file,
  });
  if (!response.ok) throw new ApiError(`Evidence upload failed (${response.status}).`);
  return ticket.evidence_id;
}

export function getEvidenceUrl(token: string, id: string) {
  return request<{ evidence_id: string; read_url: string; expires_at: string }>(`/evidence/${encodeURIComponent(id)}/signed-url`, token);
}

export function updateStatus(token: string, id: string, status: HazardStatus, reason: string) {
  return request<{ hazard: { id: string; status: HazardStatus; updated_at: string }; status_event_id: string | null }>(`/hazards/${encodeURIComponent(id)}/status`, token, {
    method: 'PATCH', body: JSON.stringify({ status, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
  });
}

export function resolveChallenge(token: string, id: string, status: 'accepted' | 'rejected', resolution_note: string) {
  return request<{ challenge_id: string; status: 'accepted' | 'rejected'; resolved_at: string; successor_hazard_id: string | null }>(`/hazard-challenges/${encodeURIComponent(id)}`, token, {
    method: 'PATCH', body: JSON.stringify({ status, ...(resolution_note.trim() ? { resolution_note: resolution_note.trim() } : {}) }),
  });
}
