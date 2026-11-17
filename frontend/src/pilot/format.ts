import type { Hazard, Severity, Stage } from './types';
import { STAGES } from './types';

export function relativeTime(value: string): string {
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff)) return '—';
  const mins = Math.max(0, Math.round(diff / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function dateTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function clock(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const pct = (value: number) => `${Math.round(value * 100)}%`;
export const stageIndex = (stage: Stage) => STAGES.indexOf(stage);
export const isOpen = (hazard: Hazard) => hazard.stage !== 'independently_verified';
export const isCritical = (hazard: Hazard) => hazard.severity === 'critical' || hazard.severity === 'high';

export const SEVERITY_WEIGHT: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export function sortByRisk(a: Hazard, b: Hazard) {
  return SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.confidence - a.confidence;
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
