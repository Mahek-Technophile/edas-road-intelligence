export const HAZARD_TYPES = ['pothole', 'road_damage', 'open_manhole', 'waterlogging', 'obstruction'] as const;
export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export const STATUSES = ['reported', 'verified', 'assigned', 'repaired'] as const;

export type HazardType = typeof HAZARD_TYPES[number];
export type Severity = typeof SEVERITIES[number];
export type HazardStatus = typeof STATUSES[number];
export type Disposition = 'confirmation' | 'challenge';

export interface Hazard {
  id: string;
  hazard_type: HazardType;
  latitude: number;
  longitude: number;
  severity: Severity;
  confidence_score: number;
  confirmation_count: number;
  observation_count: number;
  status: HazardStatus;
  description: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
  successor_of_hazard_id: string | null;
}

export interface Observation {
  id: string;
  hazard_id: string;
  hazard_type: HazardType;
  latitude: number;
  longitude: number;
  severity: Severity;
  source: 'manual' | 'ai';
  description: string | null;
  evidence_id: string | null;
  disposition: Disposition;
  created_at: string;
}

export interface Challenge {
  id: string;
  status: 'pending' | 'accepted' | 'rejected';
  submitted_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface HazardDetail {
  hazard: Hazard;
  observations: Observation[];
  challenges: Challenge[];
}

export interface AnalyticsSummary {
  total_hazards: number;
  verified_hazards: number;
  critical_hazards: number;
  repaired_hazards: number;
  hazards_by_type: Record<HazardType, number>;
  hazards_by_status: Record<HazardStatus, number>;
  pending_challenges: number;
}

export interface HazardList {
  items: Hazard[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReportResult {
  outcome: 'created' | 'duplicate' | 'challenge_submitted' | 'duplicate_challenge';
  hazard_id: string;
  observation_id: string;
  challenge_id: string | null;
  duplicate: boolean;
  matched_existing_hazard: boolean;
  confirmation_count: number;
  observation_count: number;
  confidence_score: number | null;
  status: HazardStatus;
}

export class ApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}
