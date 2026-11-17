
# EDAS API CONTRACT

Base URL: http://localhost:8000/api/v1

## GET /health

Response:
{
  "status": "ok"
}

## GET /hazards

Optional query parameters:
- hazard_type
- severity
- status
- latitude
- longitude
- radius_m

Response:
{
  "items": [],
  "total": 0
}

## GET /hazards/{hazard_id}

Returns hazard details and observations.

## POST /hazard-reports

Request:
{
  "hazard_type": "pothole",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "severity": "high",
  "reporter_id": "vehicle_A",
  "description": "Large pothole near junction",
  "evidence_url": null,
  "source": "manual"
}

Response:
{
  "hazard_id": "uuid",
  "observation_id": "uuid",
  "confirmation_count": 1,
  "confidence_score": 0.50,
  "status": "reported",
  "matched_existing_hazard": false
}

Note: The confidence value is illustrative.
The backend calculates the actual score.

## GET /analytics/summary

Response:
{
  "total_hazards": 0,
  "verified_hazards": 0,
  "critical_hazards": 0,
  "repaired_hazards": 0,
  "hazards_by_type": {},
  "hazards_by_status": {}
}

## PATCH /hazards/{hazard_id}/status

Request:
{
  "status": "repaired"
}

## Shared Enums

Hazard types:
pothole, road_damage, open_manhole,
waterlogging, obstruction

Severity:
low, medium, high, critical

Status:
reported, verified, assigned, repaired

Source:
manual, ai

Coordinates:
WGS84 decimal degrees.

Timestamps:
ISO 8601.
