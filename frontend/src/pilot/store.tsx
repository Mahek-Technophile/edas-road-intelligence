import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SEED_HAZARDS, SEED_VEHICLES } from './data';
import type { AppSettings, Hazard, HazardKind, Severity, Stage, Vehicle } from './types';
import { STAGES } from './types';

const STORAGE_KEY = 'edas.pilot.v1';

const DEFAULT_SETTINGS: AppSettings = {
  alertDistance: 600,
  severityFloor: 'medium',
  voiceAlerts: true,
  units: 'metric',
  mapStyle: 'light',
  dataSource: 'Pilot dataset',
  apiBase: 'http://localhost:8000/api/v1',
};

interface PilotState {
  hazards: Hazard[];
  vehicles: Vehicle[];
  acknowledged: string[];
  settings: AppSettings;
  notice: string;
  apiState: 'idle' | 'connecting' | 'connected' | 'error';
  apiMessage: string;
  confirmHazard: (id: string) => void;
  advanceStage: (id: string) => void;
  addHazard: (input: { kind: HazardKind; severity: Severity; lat: number; lng: number; road: string; landmark: string; description: string; source: Hazard['source'] }) => Hazard;
  acknowledgeAlert: (id: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  connectApi: (token: string) => Promise<void>;
  disconnectApi: () => void;
  resetPilot: () => void;
  notify: (message: string) => void;
}

const PilotContext = createContext<PilotState | null>(null);

type Persisted = { hazards: Hazard[]; acknowledged: string[]; settings: AppSettings; vehicles: Vehicle[] };

function clampConfidence(value: number) {
  return Math.min(0.99, Math.round(value * 100) / 100);
}

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (!Array.isArray(parsed.hazards) || !parsed.hazards.length) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function PilotProvider({ children }: { children: React.ReactNode }) {
  const stored = useRef(loadPersisted()).current;
  const [hazards, setHazards] = useState<Hazard[]>(stored.hazards?.length ? stored.hazards : SEED_HAZARDS);
  const [vehicles] = useState<Vehicle[]>(stored.vehicles?.length ? stored.vehicles : SEED_VEHICLES);
  const [acknowledged, setAcknowledged] = useState<string[]>(stored.acknowledged || []);
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS, ...(stored.settings || {}) });
  const [notice, setNotice] = useState('');
  const [apiState, setApiState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [apiMessage, setApiMessage] = useState('');

  useEffect(() => {
    const payload: Persisted = { hazards, acknowledged, settings, vehicles };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch { /* Storage may be unavailable in private mode. */ }
  }, [hazards, acknowledged, settings, vehicles]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const notify = useCallback((message: string) => setNotice(message), []);

  const confirmHazard = useCallback((id: string) => {
    setHazards((current) => current.map((hazard) => {
      if (hazard.id !== id) return hazard;
      const nextConfidence = clampConfidence(hazard.confidence + (1 - hazard.confidence) * 0.45);
      const reports = hazard.reports + 1;
      const stage: Stage = hazard.stage === 'detected' ? 'reported' : hazard.stage;
      return {
        ...hazard,
        reports,
        observations: hazard.observations + 1,
        confidence: nextConfidence,
        stage,
        lastSeen: new Date().toISOString(),
        events: [
          ...hazard.events,
          { at: new Date().toISOString(), source: 'Operator console', label: 'Independent observation added', confidence: nextConfidence, detail: 'Confirmed from the field operations console; consensus recalculated.' },
        ],
      };
    }));
  }, []);

  const advanceStage = useCallback((id: string) => {
    setHazards((current) => current.map((hazard) => {
      if (hazard.id !== id) return hazard;
      const index = STAGES.indexOf(hazard.stage);
      if (index >= STAGES.length - 1) return hazard;
      const stage = STAGES[index + 1];
      const resolvedHours = stage === 'repaired' ? Math.max(1, Math.round((Date.now() - Date.parse(hazard.firstSeen)) / 3_600_000)) : hazard.resolvedHours;
      return {
        ...hazard,
        stage,
        resolvedHours,
        events: [
          ...hazard.events,
          { at: new Date().toISOString(), source: stage === 'assigned' ? 'Civic dispatch' : 'Field operations', label: `Workflow advanced to ${stage.replace(/_/g, ' ')}`, detail: stage === 'assigned' ? `Assigned to ${hazard.team}.` : 'Status recorded in the civic repair queue.' },
        ],
      };
    }));
  }, []);

  const addHazard = useCallback((input: { kind: HazardKind; severity: Severity; lat: number; lng: number; road: string; landmark: string; description: string; source: Hazard['source'] }) => {
    const nextNumber = 1072 + hazards.filter((hazard) => hazard.id.startsWith('EDAS-')).length;
    const hazard: Hazard = {
      id: `EDAS-${nextNumber}`,
      kind: input.kind,
      severity: input.severity,
      confidence: 0.64,
      reports: 1,
      observations: 1,
      stage: 'reported',
      lat: input.lat,
      lng: input.lng,
      road: input.road || 'Pune',
      corridor: input.road || 'Sinhagad Road',
      landmark: input.landmark || 'Reported location',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      description: input.description || 'Driver-submitted road hazard.',
      source: input.source,
      team: 'Awaiting zone assignment',
      slaHours: 24,
      events: [{ at: new Date().toISOString(), source: 'EDAS mobile', label: 'Driver report submitted', confidence: 0.64, detail: 'Location and category recorded; awaiting an independent observation.' }],
    };
    setHazards((current) => [hazard, ...current]);
    return hazard;
  }, [hazards]);

  const acknowledgeAlert = useCallback((id: string) => {
    setAcknowledged((current) => current.includes(id) ? current : [...current, id]);
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const connectApi = useCallback(async (token: string) => {
    const base = settings.apiBase.replace(/\/$/, '');
    if (!token.trim()) {
      setApiState('error');
      setApiMessage('Enter a Supabase access token to connect the EDAS API.');
      return;
    }
    setApiState('connecting');
    setApiMessage('');
    try {
      const response = await fetch(`${base}/hazards?limit=100&offset=0&sort=last_seen_desc`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (!response.ok) throw new Error(`The EDAS API responded with ${response.status}.`);
      const body = await response.json();
      const items = Array.isArray(body?.items) ? body.items : [];
      const mapped: Hazard[] = items.map((item: any) => ({
        id: String(item.id),
        kind: item.hazard_type === 'road_damage' ? 'road_crack' : item.hazard_type,
        severity: item.severity,
        confidence: Number(item.confidence_score) || 0.6,
        reports: Number(item.confirmation_count) || 1,
        observations: Number(item.observation_count) || 1,
        stage: item.status === 'repaired' ? 'repaired' : item.status,
        lat: Number(item.latitude),
        lng: Number(item.longitude),
        road: 'EDAS API',
        corridor: 'Live API records',
        landmark: `${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}`,
        firstSeen: item.first_seen_at,
        lastSeen: item.last_seen_at,
        description: item.description || 'Live API hazard record.',
        source: 'Driver app',
        team: 'Live queue',
        slaHours: 24,
        events: [],
      }));
      if (!mapped.length) throw new Error('The API returned no hazard records for this workspace.');
      setHazards(mapped);
      updateSettings({ dataSource: 'EDAS API' });
      setApiState('connected');
      setApiMessage(`${mapped.length} live records loaded from the EDAS API.`);
      setNotice(`${mapped.length} hazard records synced from the EDAS API.`);
    } catch (error) {
      setApiState('error');
      setApiMessage(error instanceof Error ? error.message : 'Could not reach the EDAS API.');
    }
  }, [settings.apiBase, updateSettings]);

  const disconnectApi = useCallback(() => {
    setHazards(SEED_HAZARDS);
    updateSettings({ dataSource: 'Pilot dataset' });
    setApiState('idle');
    setApiMessage('');
    setNotice('Pilot dataset restored.');
  }, [updateSettings]);

  const resetPilot = useCallback(() => {
    setHazards(SEED_HAZARDS);
    setAcknowledged([]);
    setSettings({ ...DEFAULT_SETTINGS });
    setApiState('idle');
    setApiMessage('');
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Ignore unavailable storage. */ }
    setNotice('Pilot workspace reset to the reference dataset.');
  }, []);

  const value = useMemo<PilotState>(() => ({
    hazards, vehicles, acknowledged, settings, notice, apiState, apiMessage,
    confirmHazard, advanceStage, addHazard, acknowledgeAlert, updateSettings, connectApi, disconnectApi, resetPilot, notify,
  }), [hazards, vehicles, acknowledged, settings, notice, apiState, apiMessage, confirmHazard, advanceStage, addHazard, acknowledgeAlert, updateSettings, connectApi, disconnectApi, resetPilot, notify]);

  return <PilotContext.Provider value={value}>{children}</PilotContext.Provider>;
}

export function usePilot() {
  const context = useContext(PilotContext);
  if (!context) throw new Error('usePilot must be used inside PilotProvider');
  return context;
}
