# EDAS backend

FastAPI application for API contract v2. Run from the repository root after installing dependencies:

```powershell
py -m pip install -r backend/requirements.txt
py -m uvicorn app.main:app --app-dir backend --reload
```

Copy `backend/.env.example` to `backend/.env` and load it into the process environment using your local secret manager or shell. The backend requires `DATABASE_URL`, `SUPABASE_URL`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` for full operation. Never expose the service-role key to the browser or commit it. `GET /api/v1/health` is process liveness and does not require database configuration.

Apply migrations only to a disposable/authorized target after confirming migration-role access to PostGIS 3.3.7 in schema `extensions`. The core API connects directly using `DATABASE_URL`; all report aggregation and challenge decisions are performed in the atomic Postgres functions. The core `backend/intelligence/` module is deterministic and does not write data or load model weights. The separate `backend/vision/` package contains the video CV pipeline described below.

Evidence files use the private `road-evidence` bucket configured in `supabase/config.toml`. Uploads are validated for byte count, signature, and declared MIME type before association to a report. Signed upload URL lifetime is provider-controlled (currently two hours). Configure a scheduled invocation of `python -m app.cleanup` (with `backend` on PYTHONPATH) to remove expired pending objects and apply configured retention. Cleanup does not run automatically from API startup.

## Vision Lab

The Vision API is mounted at `/api/v1/vision`; details are in [Vision API](../docs/VISION_API.md) and [technical documentation](../docs/TECHNICAL_DOCUMENTATION.md). The video bucket is private. Configure `vision-videos`, apply `supabase/migrations/202611170002_vision_lab.sql` to an authorized target, and provide the same server-side Supabase environment variables to API and worker processes. Do not apply the migration to the pilot until it has been reviewed and tested against a disposable database.

Run the worker as a separate process from the repository root after installing `backend/requirements.txt` and loading backend environment variables:

```powershell
backend\.venv\Scripts\python.exe -m backend.workers.vision_worker
```

The worker polls the Vision job table through Supabase PostgREST RPC, processes queued MP4s on CPU, reports model readiness, and periodically runs configured retention cleanup. It does not use Redis. Jobs fail if model initialization/inference fails; the worker does not create placeholder detections. Current runtime failure and attribution are recorded in [road-damage model notes](../docs/vision-models/road-damage-rdd2022.md).

Run the local detector on a real input with:

```powershell
backend\.venv\Scripts\python.exe -m backend.vision --source C:\path\to\road-image.jpg
```

This CLI attempts real inference. A missing/incompatible runtime must report a failure and emit no detections.

Run backend-owned integration tests with:

```powershell
$env:PYTHONPATH = "backend"
py -m pytest tests/integration
```

Integration tests require a disposable database and valid test tokens/Storage credentials; they must never target the pilot or production data.
