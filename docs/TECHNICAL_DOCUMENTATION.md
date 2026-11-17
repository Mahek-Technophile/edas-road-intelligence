# EDAS Technical Documentation

## 1. Scope and implementation status

EDAS is a React + TypeScript + Vite frontend, a FastAPI backend, Supabase Auth, Supabase PostgreSQL with PostGIS, and private Supabase Storage. The Pune pilot's existing hazard-reporting API and workflows remain the source for public hazard state. Vision Lab is an additional asynchronous video-analysis path; it is not a replacement for the hazard API.

The Vision Lab implementation is on `codex/edas-integration`. Its migration is committed but has not been applied to the live Supabase project. Current Windows/Python model inference fails while importing `torch._dynamo.utils.NP_SUPPORTED_MODULES`, so the API/worker must report road-damage inference unavailable. The UI must not manufacture events to disguise this state.

## 2. Repository map

```text
backend/app/                 Existing FastAPI routes, JWT auth, error handling
backend/app/api/vision_routes.py
backend/app/core/vision_store.py
backend/vision/               Frame sampling, detector, schemas, CLI, attribution
backend/workers/vision_worker.py
frontend/src/pages/VisionLab.tsx
frontend/src/components/vision/vision-lab.css
supabase/migrations/          Core schema and Vision Lab migration
supabase/config.toml          Private Storage bucket definitions
tests/vision/                 API/pipeline/schema/frontend-contract tests
scripts/qa/                   Reproducible QA and model benchmark scripts
docs/                         Product, architecture, API, user, and operations docs
```

## 3. Component responsibilities

### Frontend

The dashboard stores a user-supplied Supabase access token in tab-scoped `sessionStorage`. It sends the token to FastAPI as a bearer token. The browser never receives the service-role key and does not write to PostgreSQL directly.

Vision Lab uploads one MP4 as multipart form data with XHR upload progress, receives a Vision job, polls job state and events, and consumes an SSE stream where possible. Polling is a fallback. It renders the original local/browser video and a synchronized virtual-driver video with a Canvas overlay. Event boxes use original-frame pixel coordinates. Only events returned by the backend are drawn. A selected event can be submitted through the existing manual `/hazard-reports` workflow after human review and explicit location/category/severity entry.

### FastAPI

`backend/app/main.py` includes the original API router and the Vision router under `/api/v1/vision`. The shared authentication dependency validates the Supabase access token, including issuer, audience, expiry, allowed signing algorithm, and non-empty subject. Vision handlers pass the authenticated subject to owner-filtered RPCs. They do not accept a user ID from the client.

`backend/app/core/vision_store.py` validates an upload and streams it to a local temporary spool before storage upload. It checks declared MIME type, MP4 `ftyp` signature, size, decodability, dimensions, duration, and frame metadata. It computes SHA-256 and removes the spool in a `finally` block. Storage URLs are server-created and signed; the Vision bucket remains private.

### Supabase

The Vision migration creates `vision_jobs`, `vision_detections`, and `vision_model_versions`. RLS is enabled, direct access for `anon` and `authenticated` is revoked, and worker/API functions are granted to `service_role`. SQL functions apply the user-subject filter for owner-scoped reads and cancellation. The worker uses PostgREST/RPC and Supabase Storage REST; Vision worker code does not use psycopg or require Redis.

The queue claim uses `FOR UPDATE SKIP LOCKED`, allowing multiple polling workers to claim different jobs without introducing a separate queue service. Detection insertion, progress updates, completion, cancellation, and failures pass through database functions. Apply and validate the migration against a disposable authorized database before any pilot migration.

### Worker

Start `backend.workers.vision_worker` as a separate process. At startup it registers road-damage model capability, marks stale processing rows failed, and begins a polling loop. For each job it downloads the private object to a temporary directory, verifies stored size and SHA-256, samples frames using OpenCV, runs the CPU road-damage detector, saves only real events, updates progress, and records summary metrics. The temporary downloaded source is removed when the job ends.

The worker also emits model heartbeat updates and performs periodic retention cleanup. Source videos for terminal jobs are deleted after the configured video retention period; event rows are removed after the event retention period; job metadata remains for audit. Cleanup is best effort and requires a healthy worker. Backups and provider-level retention must be managed separately.

## 4. Vision processing lifecycle

```text
User token + MP4
       |
       v
FastAPI validates upload and identity
       |
       +--> private Storage object + owner-bound vision_jobs row
                               |
                               v
                      Worker claims queue row
                               |
                      verifies hash and downloads
                               |
                     OpenCV timestamp sampling
                               |
                  CPU road-damage model inference
                               |
              database events/progress/terminal state
                               |
                       REST + SSE to UI
                               |
                user reviews, then manually reports
```

Job states: `queued -> processing -> completed | failed | cancelled`. Cancellation is checked between sampled frames and before event/progress writes. A worker restart marks stale processing rows failed. A detector initialization or inference error fails the job; it does not turn into a successful empty result.

## 5. Vision event and coordinate model

`DetectionEvent` includes `event_id`, `timestamp_ms`, `model`, `class_id`, `class_name`, `label`, `confidence`, `bbox`, `track_id`, and `inference_ms`. Bounding boxes are `x1,y1,x2,y2` pixel coordinates mapped to the original decoded frame, not normalized to 0..1. Timestamp is measured from the source video's beginning in milliseconds. Current `track_id` is null because object tracking is not implemented.

For RDD2022 road damage, the inspected checkpoint class IDs are `0=longitudinal_crack`, `1=transverse_crack`, `2=alligator_crack`, `3=pothole`; runtime inference also validates names from checkpoint metadata. UI labels map these to D00, D10, D20, and D40 meanings. Checkpoint hash, source, license, and India-partition limitations are documented in [Vision model notes](vision-models/road-damage-rdd2022.md).

## 6. Security and data lifecycle

- User access tokens are verified by FastAPI; ownership is derived from the verified `sub` claim.
- The Supabase service-role key is server-only. Never place it in Vite variables, browser storage, source control, API output, or logs.
- `vision-videos` is configured as a private bucket accepting MP4 up to 200 MiB.
- API playback URLs are signed and expire; callers can access only jobs belonging to their subject.
- The video object path is server-generated, and the API verifies MP4 header and decoder metadata before creating a job.
- Database job/event calls use owner-filtered SQL RPCs. Worker functions are restricted to `service_role`.
- Videos default to 30-day retention and event rows to 365 days. Retention configuration is not a legal/privacy guarantee.
- Detection events are not public hazards. A human must submit a separate manual hazard report.
- No rate-limiting, malware scanning, video redaction, compliance review, or backup deletion proof is claimed by this implementation.

## 7. Configuration reference

Values are read from the process environment. `backend/.env.example` contains placeholders/defaults; the app does not print or return secrets. Load private `.env` values through a local secret manager or shell before starting API and worker processes.

| Variable | Default | Meaning |
|---|---:|---|
| `SUPABASE_URL` | none | Project URL for Auth, PostgREST, and Storage. |
| `SUPABASE_SERVICE_ROLE_KEY` | none | Server-only service key for Vision database/storage access. |
| `DATABASE_URL` | none | Direct Postgres connection required by the core backend's existing database path; the Vision worker/API use PostgREST/RPC for Vision data. |
| `SUPABASE_JWT_ALGORITHMS` | `ES256,RS256` | Allowed asymmetric access-token algorithms. |
| `SUPABASE_JWT_SECRET` / `SUPABASE_JWT_ALGORITHM` | unset | Optional legacy HS256 setup; configure only if project signing uses it. |
| `EDAS_VISION_STORAGE_BUCKET` | `vision-videos` | Private source-video bucket. |
| `EDAS_VISION_MAX_VIDEO_SIZE_BYTES` | `209715200` | Upload cap; implementation never allows more than 200 MiB. |
| `EDAS_VISION_MAX_DURATION_SECONDS` | `600` | Duration cap; implementation never allows more than 10 minutes. |
| `EDAS_VISION_SAMPLE_FPS` | `10` | Target rate for selecting source frames, not inference throughput. |
| `EDAS_VISION_IMAGE_SIZE` | `640` | Detector input size. |
| `EDAS_VISION_CONFIDENCE` | `0.10` | Detector confidence threshold. |
| `EDAS_VISION_MODEL_PATH` | `backend/vision/models/pothole/road_damage_best.pt` | Local ignored checkpoint path. |
| `EDAS_VISION_WORKER_POLL_SECONDS` | `1` | Minimum worker idle queue-poll interval. |
| `EDAS_VISION_VIDEO_RETENTION_DAYS` | `30` | Days to retain terminal-job source video. |
| `EDAS_VISION_EVENT_RETENTION_DAYS` | `365` | Days to retain detection event rows. |
| `EDAS_VISION_CLEANUP_INTERVAL_SECONDS` | `3600` | Worker retention-cleanup interval. |
| `EDAS_VISION_HEARTBEAT_INTERVAL_SECONDS` | `20` | Worker model heartbeat interval. |
| `EDAS_VISION_SIGNED_URL_TTL_SECONDS` | `3600` | Requested source playback URL TTL; clamped to 60–3600 seconds. |

## 8. Local operation

Install backend requirements into `backend/.venv`, load credentials into the environment, then start API and worker in separate terminals:

```powershell
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
backend\.venv\Scripts\python.exe -m backend.workers.vision_worker
```

The second command is run from repository root. Start the Vite frontend in `frontend/` using `npm run dev` and set `VITE_EDAS_API_BASE` to `http://localhost:8000/api/v1` in `frontend/.env.local`.

## 9. Failure handling and known blockers

| Condition | Expected behavior |
|---|---|
| No checkpoint | Capability is `MODEL_NOT_CONFIGURED`; no inference events. |
| Corrupt or unrecognized checkpoint | Capability reports `failed`; no fabricated class map or detections. |
| Current Torch/torchvision import error | Worker reports failure/unavailable; jobs fail instead of returning empty successful inference. |
| Invalid, oversized, unsupported, or undecodable upload | API returns a typed 4xx validation error and does not enqueue the job. |
| Supabase configuration/network failure | API returns a dependency error without returning credentials or internals. |
| Worker stops mid-job | Stale processing rows are failed at worker startup. |
| Source video deleted by retention | Job metadata remains, playback URL is absent; detection rows are subject to their separate retention. |

Current known runtime exception: `cannot import name 'NP_SUPPORTED_MODULES' from torch._dynamo.utils`. A checkpoint load/class-map check alone is not proof of inference readiness. Do not claim detections, speed, CPU/RAM use, or benchmark success until an actual model prediction passes on the target runtime and real Pune inputs.

## 10. Related specifications

- [Architecture](ARCHITECTURE.md)
- [Core API contract v2](API_CONTRACT.md)
- [Vision API](VISION_API.md)
- [Testing strategy and observed checks](TESTING.md)
- [Vision models and attribution](vision-models/README.md)
