
# EDAS — MASTER PROJECT SPECIFICATION

## 1. Project Overview

Product: EDAS
Full Name: Enroute Driver Assistance System

Category: AI-powered Crowdsourced Road Intelligence Platform

Mission:
Transform everyday vehicles into mobile road-monitoring
units using smartphone cameras, GPS and AI.

Initial pilot city: Pune, Maharashtra, India.

## 2. Core Features

### 2.1 Hazard Reporting

Users can:
- Upload road photographs.
- Select a hazard category.
- Provide GPS coordinates.
- Select severity.
- Submit a report.

### 2.2 Hazard Categories

- pothole
- road_damage
- open_manhole
- waterlogging
- obstruction

Severity:
- low
- medium
- high
- critical

Status:
- reported
- verified
- assigned
- repaired

### 2.3 Crowdsourced Verification

Multiple independent vehicles can report the same
road hazard.

EDAS must:
- Identify nearby reports.
- Group matching reports.
- Prevent duplicate reporter inflation.
- Calculate confidence.
- Track the number of independent observations.

### 2.4 Civic Intelligence Dashboard

Display:
- Total hazards.
- Verified hazards.
- Critical hazards.
- Repaired hazards.
- Hazard distribution.
- Recent reports.
- Interactive Pune hazard map.

### 2.5 Repair Tracking

Track hazards through:
reported → verified → assigned → repaired.

Allow subsequent observations to challenge a repaired
status rather than silently reopening it.

## 3. Technology Stack

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- React Leaflet
- Leaflet

Backend:
- Python
- FastAPI
- Pydantic

Database:
- Supabase PostgreSQL
- PostGIS where supported

Intelligence:
- Haversine distance calculation
- Spatial matching
- Confidence scoring

Testing:
- Pytest
- API integration tests
- Frontend build tests

## 4. Database Design

### hazards

- id: UUID primary key
- hazard_type: TEXT
- latitude: DOUBLE PRECISION
- longitude: DOUBLE PRECISION
- severity: TEXT
- confidence_score: FLOAT
- confirmation_count: INTEGER
- status: TEXT
- description: TEXT nullable
- first_seen_at: TIMESTAMPTZ
- last_seen_at: TIMESTAMPTZ
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ

### hazard_observations

- id: UUID primary key
- hazard_id: UUID foreign key
- reporter_id: TEXT
- latitude: DOUBLE PRECISION
- longitude: DOUBLE PRECISION
- hazard_type: TEXT
- severity: TEXT
- evidence_url: TEXT nullable
- source: TEXT (manual / ai)
- created_at: TIMESTAMPTZ

A reporter must not increase independent confirmation
count by submitting the same hazard repeatedly.

## 5. Intelligence Engine

Default matching radius: 25 metres.

Matching criteria:
- Same hazard category.
- Within 25 metres.
- Existing hazard is not repaired.
- Prefer recent observations.

Confidence formula:

C = 0.5V + 0.3R + 0.2E

Where:

V = min(independent_reporters / 5, 1)

R = exp(-hours_since_last_observation / 72)

E = evidence quality between 0 and 1.

Confidence must be between 0 and 1.

Verification threshold: 0.50.

This is an initial prototype heuristic, not a
statistically calibrated probability.

## 6. API Endpoints

Base path: /api/v1

GET /health
GET /hazards
GET /hazards/{hazard_id}
POST /hazard-reports
GET /analytics/summary
PATCH /hazards/{hazard_id}/status

All APIs must follow docs/API_CONTRACT.md.

## 7. Frontend Pages

1. Overview dashboard
2. Interactive hazard map
3. Hazard reports
4. Report a hazard
5. Hazard details

Use responsive layouts and clear loading,
empty and error states.

Map:
- OpenStreetMap tiles.
- Severity-based markers.
- Marker popups.
- Filters.

## 8. Computer Vision Integration

Prepare a detector interface for YOLO-based
hazard detection.

Do not claim pothole detection unless compatible
trained model weights are configured.

If weights are missing, return:
MODEL_NOT_CONFIGURED.

Manual hazard reporting must work independently
of the AI detector.

## 9. Security and Privacy

- Keep secrets in backend environment variables.
- Never expose the Supabase service role key.
- Validate coordinates and user inputs.
- Limit uploaded file sizes.
- Do not upload continuous raw vehicle footage.
- Use synthetic reporter IDs for the demo.
- Do not expose personal driver identities.

Administrative status changes must be protected.

## 10. Demo Scenario

Create three simulated vehicles.

Vehicle A:
Reports a pothole.

Vehicle B:
Reports the same pothole 12 metres away.

Vehicle C:
Reports the same pothole 8 metres away.

Expected:
- One aggregated hazard.
- Three observations.
- Three independent reporters.
- Updated confidence.
- Verified status if threshold is met.

Then mark the hazard repaired.

All simulated records must be clearly identified.

## 11. Acceptance Criteria

- Frontend runs.
- Backend runs.
- Supabase connection works.
- Hazard reporting works.
- Spatial matching works.
- Duplicate reporting is prevented.
- Confidence is calculated.
- Dashboard displays live database data.
- Map displays hazard locations.
- Repair status updates.
- Automated tests pass.

## 12. Today's Non-Goals

- Production navigation integration.
- Real-time vehicle tracking.
- Continuous dashcam recording.
- Automatic municipal submission.
- Federated learning.
- Production-grade authentication.
- Live driver alerts.
