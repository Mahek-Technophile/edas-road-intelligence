# EDAS backend

FastAPI application for API contract v2. Run from the repository root after installing dependencies:

```powershell
py -m pip install -r backend/requirements.txt
py -m uvicorn app.main:app --app-dir backend --reload
```

Copy `backend/.env.example` to `backend/.env` and load it into the process environment using your local secret manager or shell. The backend requires `DATABASE_URL`, `SUPABASE_URL`, and the server-only `SUPABASE_SERVICE_ROLE_KEY` for full operation. Never expose the service-role key to the browser or commit it. `GET /api/v1/health` is process liveness and does not require database configuration.

Apply migrations only to a disposable/authorized target after confirming migration-role access to PostGIS 3.3.7 in schema `extensions`. The API connects directly using `DATABASE_URL`; all report aggregation and challenge decisions are performed in the atomic Postgres functions. Python intelligence is a deterministic reference implementation; it does not write data or load model weights.

Evidence files use the private `road-evidence` bucket configured in `supabase/config.toml`. Uploads are validated for byte count, signature, and declared MIME type before association to a report. Signed upload URL lifetime is provider-controlled (currently two hours). Configure a scheduled invocation of `python -m app.cleanup` (with `backend` on PYTHONPATH) to remove expired pending objects and apply configured retention. Cleanup does not run automatically from API startup.

Run backend-owned integration tests with:

```powershell
$env:PYTHONPATH = "backend"
py -m pytest tests/integration
```

Integration tests require a disposable database and valid test tokens/Storage credentials; they must never target the pilot or production data.
