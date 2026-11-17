# EDAS API Reference

The API has two documented surfaces under `/api/v1`:

1. Core EDAS hazard reporting, evidence, challenges, status, and analytics: [API Contract v2](API_CONTRACT.md).
2. Asynchronous video analysis: [Vision API](VISION_API.md).

FastAPI registers the Vision router in `backend/app/main.py`. The backend OpenAPI schema includes the six Vision paths documented in the Vision API guide. All endpoints require a Supabase Auth bearer access token except the existing health endpoint. The browser must never receive the Supabase service-role key.

## Authentication and common errors

Send:

```http
Authorization: Bearer <supabase-user-access-token>
```

The backend validates the token signature, allowed algorithm, issuer, audience, expiration, and subject. It derives identity from the verified `sub` claim; clients cannot select their own owner ID. Admin-only core routes also require trusted `app_metadata.edas_role=admin`.

Errors follow the EDAS common shape defined in [API Contract v2](API_CONTRACT.md#error-format). Vision endpoints use `authentication_required`, `invalid_token`, `forbidden`, `not_found`, `invalid_request`, `unsupported_media_type`, `payload_too_large`, `conflict`, and `dependency_unavailable` where appropriate. Responses do not expose SQL, credentials, signed URLs in errors, or stack traces.

## Core EDAS endpoints

The core contract describes health, manual/AI hazard reports, private evidence tickets and reads, hazard list/detail, analytics, admin status transitions, and admin challenge resolution. Its PostGIS aggregation, idempotency, and transition rules remain the source of truth for hazard lifecycle behavior. Vision review submits through the existing manual hazard-report route; it does not add a public model-result endpoint.

## Vision endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/vision/jobs` | Validate and upload an MP4, create an owner-bound job; returns `202`. |
| `GET` | `/vision/jobs/{job_id}` | Read an owned job and receive a fresh signed playback URL when retained. |
| `GET` | `/vision/jobs/{job_id}/events` | Paginate timestamped events using an integer cursor. |
| `GET` | `/vision/jobs/{job_id}/stream` | Stream progress, detections, and terminal status as SSE. |
| `POST` | `/vision/jobs/{job_id}/cancel` | Cancel an owned queued/processing job. |
| `GET` | `/vision/models` | Read configured detector capability and worker readiness. |

See [Vision API](VISION_API.md) for request/response schemas, upload limits, event fields, example commands, and job states. API availability does not establish that a model can infer; inspect `/vision/models` and worker status.

## API stability

Core hazard routes follow the committed v2 contract. Vision endpoints are an additional implementation surface and currently have their own documentation; changes to them should update `VISION_API.md`, the frontend client, and contract tests together. Do not document an endpoint as available unless it is present in the application OpenAPI schema and has corresponding tests.
