# EDAS Testing and Verification

## Principles

Test implemented behavior, not imagined results. The manual reporting flow must work independently of model weights. Generated/synthetic videos may validate decoding and timestamp logic only; do not treat them as a source of model events. Use isolated configuration and never expose production credentials. Distinguish passed, failed, blocked, and not-run checks. A planned test is not evidence that the behavior passed.

## Current test areas

### Road intelligence

Test spatial distances and boundaries, category filtering, duplicate reporter behavior, repaired-hazard challenge routing, confidence calculations, and explicit detector-not-configured behavior. Keep deterministic clock/fixtures; do not require weights to test manual reporting.

### Core API and authorization

Test the core API Contract v2 routes and common error shape. Cover missing/invalid/expired tokens, non-admin/admin role boundaries, forged user-controlled role claims, evidence ownership/type/size, idempotent submissions, state transitions, and challenge handling. Integration assertions should confirm database effects and audit rows are atomic.

### Vision API and worker

- Validate video MIME, MP4 signature, size, duration, dimensions, decoder readability, hashing, temp-file cleanup, and private upload behavior.
- Validate job-owner checks across job, event, stream, and cancellation handlers.
- Validate event schema/cursors, SSE progress/detection/status frames, and terminal job states.
- Validate configured, missing, incompatible, and runtime-failed model states.
- Validate timestamp sampling, progress callbacks, capture release, and cancellation.
- A generated MP4 is decode-only test material; fake detector callbacks test pipeline mechanics, not CV performance.
- Run actual-image/video inference before making accuracy, latency, throughput, CPU, or RAM claims.

### Frontend

Run TypeScript and Vite production build. Verify loading, empty, unavailable, error, progress, and terminal states; verify events seek the synchronized player and only backend events draw overlays. Confirm no service-role secret enters public assets.

### Database and live integration

Use an authorized disposable Supabase-compatible database. Apply migrations there and verify constraints, function signatures, role grants, RLS policies, queue claiming, concurrent reports, ownership isolation, Storage privacy, and retention. Exercise core hazard concurrency and audit behavior. Do not run destructive test fixtures against the Pune pilot or production dataset. Tests that require database or Storage credentials should be skipped/reported not-run when those services are not available.

## Local commands

From the repository root with the project Python environment installed:

```powershell
backend\.venv\Scripts\python.exe -B -m pytest tests/vision -q --basetemp tests/vision/.pytest-tmp
```

From `frontend/`:

```powershell
npm run build
```

The optional model benchmark requires a configured local checkpoint and a real video. Follow [the benchmark guide](../scripts/qa/vision-benchmark.md). It performs no upload and must not substitute synthetic prediction outputs.

## Observed local Vision verification

Recorded during the implementation work on `codex/edas-integration`:

| Check | Result |
|---|---|
| `backend/.venv/Scripts/python.exe -B -m pytest tests/vision -q --basetemp tests/vision/.pytest-tmp` | **Passed:** 18 tests; one third-party `pytest-asyncio` deprecation warning. Includes direct handler/fake-dependency API checks and generated-video decode tests; it is not live HTTP, Supabase, or model inference validation. |
| `npm run build` from `frontend/` | **Passed:** TypeScript build and Vite production bundle. |
| Import FastAPI app and inspect OpenAPI | **Passed:** six `/api/v1/vision` route paths are registered. |
| Real RDD2022 India sample + local checkpoint | **Failed at inference runtime:** `cannot import name 'NP_SUPPORTED_MODULES' from 'torch._dynamo.utils'`; no detections emitted. |
| Missing-checkpoint CLI behavior | **Passed expected failure state:** `MODEL_NOT_CONFIGURED`, no events, nonzero exit. |
| Live migration, Supabase Auth/Storage, RLS, RPC/queue, retention | **Not run:** no live/disposable database integration in the task environment. |
| Actual CPU/RAM/FPS/inference-latency benchmark | **Not run successfully:** model prediction is blocked, so no performance figures are claimed. |

FastAPI `TestClient` stalled on the managed Windows sandbox's local socketpair. Route checks therefore called async handlers with fakes; this does not substitute for an HTTP end-to-end run.

## Core EDAS end-to-end acceptance scenario

Run this only against isolated test data: submit three independent reports for one pothole with known offsets, including parallel requests; assert one aggregate, three independent observations, correct confidence/status, and no count inflation on retry. Attach evidence through the signed path; assert only metadata is stored. Transition the hazard with an authorized admin and check its audit event. Submit a new report near a repaired hazard and verify the challenge path without silently reopening the old hazard. Verify that non-admin transitions fail. Tear down test data after the run.

## Reporting results

For each run, record the exact command, environment/runtime, real or synthetic inputs, exit status, and observed summary. State whether API tests used a live server or direct handler calls, whether video tests covered decoding or inference, and whether database tests used disposable credentials. Never present a schema example or fake fixture as a model prediction. Never claim the migration, worker, or endpoint has been tested against live services when it has not.
