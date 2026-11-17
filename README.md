# EDAS — Enroute Driver Assistance System

EDAS is a road-intelligence platform for collecting, reviewing, and sharing road-hazard reports. The Pune pilot combines a React dashboard, a FastAPI service, Supabase Auth and PostgreSQL, PostGIS spatial matching, and private Supabase Storage. The Vision Lab adds an asynchronous dashcam-video workflow that can turn model-produced road-damage detections into **human-reviewed** EDAS reports.

This repository contains the application implementation and its technical specifications. The documented target project has PostGIS 3.3.7 enabled in the `extensions` schema. Vision Lab code is present on `codex/edas-integration`; applying its migration or connecting to the live Supabase project is an operator action and is not performed by this repository setup guide.

## Product areas

| Area | What it does |
|---|---|
| Road-hazard dashboard | Summary, map, reports, hazard details, and manual hazard reporting. |
| Road intelligence | Deterministic spatial matching and aggregation for user reports. |
| Vision Lab | Private MP4 upload, background job status, synchronized video review, timestamped model events, and a human review step before reporting. |
| API | Authenticated `/api/v1` endpoints. Core hazard behavior is described in API contract v2; Vision Lab endpoints have a separate detailed specification. |

The interface reports capability availability from the backend. It does not create example detections to make an unavailable model look operational. Only the road-damage capability has a selected checkpoint. Vehicle/pedestrian, traffic-sign, obstruction, lane, and tracking capabilities remain unavailable until real compatible models and implementations are provided.

## Current Vision Lab model status

The selected RDD2022 YOLOv8s checkpoint is expected at `backend/vision/models/pothole/road_damage_best.pt`; the current developer checkout has a local copy, but the ignored model artifact is not included in Git. Its expected hash and class map are checked before inference. On the current Windows/Python environment, model prediction fails while importing `torch._dynamo.utils.NP_SUPPORTED_MODULES`. The worker reports the detector unavailable and fails analysis jobs safely; no detections or throughput figures are claimed. See [Vision model documentation](backend/vision/README.md) and [the model registry](docs/vision-models/README.md).

## Quick start

### Prerequisites

- Windows PowerShell or another supported shell.
- Python matching the versions supported by the pinned dependencies.
- Node.js/npm compatible with the Vite project.
- A configured Supabase project and a valid Supabase Auth access token for authenticated API actions.
- For full Vision processing: the private Vision bucket, applied Vision migration, a running worker, the local checkpoint, and a working PyTorch/torchvision runtime.

### Backend API

From the repository root, create an environment and install dependencies:

```powershell
py -m venv backend/.venv
backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

Copy `backend/.env.example` to `backend/.env`, then load the values into the process environment using a local secret manager or shell. At minimum, configure the Supabase URL, server-only service-role key, and JWT verification settings required by [backend/README.md](backend/README.md). Do not put the service-role key in a frontend environment file.

Start FastAPI from the repository root:

```powershell
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
```

The API listens at `http://localhost:8000`; OpenAPI is available at `http://localhost:8000/docs` when the service is running.

### Vision worker

In a second terminal, load the same backend environment values and run:

```powershell
backend\.venv\Scripts\python.exe -m backend.workers.vision_worker
```

The worker polls the database-backed queue, checks its model readiness, processes eligible jobs, publishes progress/events through database RPCs, and performs configured retention cleanup. It needs the Supabase server credentials. It is a separate process from FastAPI.

### Frontend

In another terminal:

```powershell
Set-Location frontend
npm install
npm run dev
```

Set `VITE_EDAS_API_BASE` in `frontend/.env.local` to the backend base URL including `/api/v1`, for example `http://localhost:8000/api/v1`. Open the Vite URL printed by the command. Use **Connect to EDAS** to provide a valid user access token; the dashboard keeps it in the current tab's `sessionStorage`.

### Local model CLI

The model CLI accepts an actual image or video and emits actual model results or an explicit failure:

```powershell
backend\.venv\Scripts\python.exe -m backend.vision --source C:\path\to\road-image.jpg
backend\.venv\Scripts\python.exe -m backend.vision --source C:\path\to\short-clip.mp4 --sample-fps 10 --confidence 0.10 --image-size 640
```

The current Torch import problem means the second command may exit with a runtime failure and no events. Do not interpret a configured checkpoint or a successful frontend build as successful inference.

## Documentation

| Document | Purpose |
|---|---|
| [User Guide](docs/USER_GUIDE.md) | Connect, navigate, report hazards, and use the Vision Lab. |
| [Technical Documentation](docs/TECHNICAL_DOCUMENTATION.md) | Components, processing lifecycle, security, configuration, operations, and failure modes. |
| [Architecture](docs/ARCHITECTURE.md) | System boundaries, database design, spatial matching, and implementation/deployment status. |
| [API overview](docs/API.md) | API entry point and links to the stable core contract and Vision API. |
| [Core API Contract v2](docs/API_CONTRACT.md) | Hazard reports, evidence, status, challenges, and analytics contract. |
| [Vision API](docs/VISION_API.md) | Vision upload, job, event, SSE, cancel, and model capability endpoints. |
| [Prompts](docs/PROMPTS.md) | Reusable engineering, QA, and model-evaluation prompt templates. These are not runtime model prompts. |
| [Vision models](docs/vision-models/README.md) | Capability registry and one page per model area. |
| [Testing](docs/TESTING.md) | Commands that exist, actual checks, and checks that still require a disposable Supabase environment. |
| [Agent ownership](docs/AGENT_OWNERSHIP.md) | Repository file ownership boundaries for parallel engineering. |
| [Vision benchmark guide](scripts/qa/vision-benchmark.md) | How to run a real-input CPU benchmark and interpret its output. |

## Safety and product limits

- A Vision event is not a public hazard. A person must review it and submit through the normal EDAS manual-report endpoint.
- Video is uploaded to a private bucket. Signed playback URLs are temporary; local browser preview is separate from server-side processing.
- The configured 10 FPS value is a frame-sampling target, not a guaranteed inference rate.
- The RDD2022 checkpoint is a starting point. Its benchmark results do not validate performance on Pune roads.
- EDAS does not claim collision avoidance, ADAS certification, guaranteed real-time detection, or reliable hazard coverage.
- Apply migrations only to a disposable or explicitly authorized database after reviewing the SQL and verifying permissions. The Vision migration has not been applied to the live project by this repository change.

## Development checks

From `frontend/`, run `npm run build`. From the repository root, run the Vision suite with the configured Python environment:

```powershell
backend\.venv\Scripts\python.exe -B -m pytest tests/vision -q --basetemp tests/vision/.pytest-tmp
```

That suite uses controlled fakes for worker/API mechanics and a generated video for decoding tests; it does not claim model inference. Review [Testing](docs/TESTING.md) before running database integration checks.

## License and model attribution

Review the repository license and third-party dependency terms before distribution. The RDD2022 road-damage checkpoint is attributed to [SreekarAditya/yolo-rdd2022-benchmark](https://huggingface.co/SreekarAditya/yolo-rdd2022-benchmark) and is documented as CC BY 4.0. The Ultralytics runtime has separate licensing terms; see [the model notes](docs/vision-models/road-damage-rdd2022.md).
