export type HazardKind = 'pothole' | 'road_crack' | 'open_manhole' | 'waterlogging' | 'obstruction' | 'accident';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Stage = 'detected' | 'reported' | 'verified' | 'assigned' | 'in_progress' | 'repaired' | 'independently_verified';
export type DataSource = 'Pilot dataset' | 'EDAS API';

export interface HazardEvent {
  at: string;
  source: string;
  label: string;
  confidence?: number;
  detail?: string;
}

export interface Hazard {
  id: string;
  kind: HazardKind;
  severity: Severity;
  confidence: number;
  reports: number;
  observations: number;
  stage: Stage;
  lat: number;
  lng: number;
  road: string;
  corridor: string;
  landmark: string;
  firstSeen: string;
  lastSeen: string;
  description: string;
  source: 'Vision Lab' | 'Driver app' | 'Field survey';
  team: string;
  slaHours: number;
  resolvedHours?: number;
  events: HazardEvent[];
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  role: string;
  corridor: string;
  status: 'streaming' | 'syncing' | 'idle';
  detections: number;
  km: number;
  lastSync: string;
  battery: number;
  network: '5G' | '4G' | 'Wi-Fi';
}

export interface DriverAlert {
  id: string;
  hazardId: string;
  title: string;
  severity: Severity;
  distance: number;
  confidence: number;
  action: string;
  note: string;
  triggerAt: number;
}

export interface VerificationStep {
  at: string;
  vehicle: string;
  plate: string;
  confidence: number;
  note: string;
  duplicate?: boolean;
}

export interface AppSettings {
  alertDistance: number;
  severityFloor: Severity;
  voiceAlerts: boolean;
  units: 'metric' | 'imperial';
  mapStyle: 'light' | 'dark';
  dataSource: DataSource;
  apiBase: string;
}

export const KINDS: HazardKind[] = ['pothole', 'road_crack', 'open_manhole', 'waterlogging', 'obstruction', 'accident'];
export const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];
export const STAGES: Stage[] = ['detected', 'reported', 'verified', 'assigned', 'in_progress', 'repaired', 'independently_verified'];

export const KIND_META: Record<HazardKind, { label: string; short: string; icon: string }> = {
  pothole: { label: 'Pothole', short: 'Pothole', icon: '◉' },
  road_crack: { label: 'Road crack', short: 'Crack', icon: '⌁' },
  open_manhole: { label: 'Open manhole', short: 'Manhole', icon: '◎' },
  waterlogging: { label: 'Waterlogging', short: 'Water', icon: '≈' },
  obstruction: { label: 'Road obstruction', short: 'Obstruction', icon: '▲' },
  accident: { label: 'Accident hazard', short: 'Accident', icon: '✕' },
};

export const STAGE_META: Record<Stage, { label: string; short: string; tone: string }> = {
  detected: { label: 'Detected', short: 'Detected', tone: 'slate' },
  reported: { label: 'Reported', short: 'Reported', tone: 'amber' },
  verified: { label: 'Verified', short: 'Verified', tone: 'blue' },
  assigned: { label: 'Assigned', short: 'Assigned', tone: 'violet' },
  in_progress: { label: 'Repair in progress', short: 'In progress', tone: 'orange' },
  repaired: { label: 'Repaired', short: 'Repaired', tone: 'green' },
  independently_verified: { label: 'Independently verified', short: 'Closed', tone: 'teal' },
};

export const SEVERITY_META: Record<Severity, { label: string; tone: string }> = {
  low: { label: 'Low', tone: 'slate' },
  medium: { label: 'Medium', tone: 'blue' },
  high: { label: 'High', tone: 'orange' },
  critical: { label: 'Critical', tone: 'red' },
};
