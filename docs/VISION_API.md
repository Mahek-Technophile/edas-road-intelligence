# EDAS Vision API

Vision API base path: `/api/v1/vision`. All routes require an authenticated Supabase user access token. The API derives the job owner from the verified JWT subject; a caller cannot submit a different owner ID. API calls to Supabase use the service role only on the server. Never send the service-role key from a browser.

This document describes the implementation in `backend/app/api/vision_routes.py`, `backend/app/core/vision_store.py`, and `supabase/migrations/202611170002_vision_lab.sql`. The migration must be applied to the target database before these routes can use their RPCs/tables. It has not been applied to the live Supabase project.

## Limits and validation

- Multipart field name: `video`.
- Declared content type must be `video/mp4`; file must have an MP4 `ftyp` header and OpenCV must decode at least one frame.
- Maximum upload size: 200 MiB by default, with a hard cap of 200 MiB.
- Maximum duration: 600 seconds by default, with a hard cap of 600 seconds.
- Maximum dimensions: 7680 × 4320.
- Sampling target: 10 frames per second by default. This is a frame-selection rate, not a model throughput or real-time guarantee.
- Source videos are uploaded into the private `vision-videos` bucket with server-generated opaque paths.
- Upload bytes are SHA-256 hashed; the worker checks byte length and hash after download.

Configuration is listed in [Technical Documentation](TECHNICAL_DOCUMENTATION.md#7-configuration-reference). API errors use the common structured EDAS error handler and omit internal error details.

## Model capability response

### `GET /models`

Returns model and worker availability. A model state is one of `ready`, `MODEL_NOT_CONFIGURED`, or `failed`. The `ready` state must reflect checkpoint/runtime readiness reported by a worker heartbeat. Other four model capabilities currently return `MODEL_NOT_CONFIGURED`.

```json
{
  "items": [
    {
      "name": "road_damage",
      "display_name": "road_damage_yolov8s_rdd2022",
      "version": "seed0",
      "status": "failed",
      "classes": ["D00", "D10", "D20", "D40"],
      "confidence_threshold": 0.1,
      "reason": "runtime availability detail",
      "device": "cpu",
      "input_size": 640
    }
  ],
  "sample_fps": 10,
  "image_size": 640,
  "tracking_available": false
}
```

The example `failed` state illustrates a response shape; it is not a model prediction. Actual `items` includes each capability, and the server's worker record determines road-damage readiness. A missing/stale worker heartbeat is not shown as ready.

## Create a job

### `POST /jobs`

Content type: `multipart/form-data`; field `video` is an MP4 file. Successful creation returns HTTP `202 Accepted` and an initial job representation.

```powershell
curl.exe -X POST "http://localhost:8000/api/v1/vision/jobs" `
  -H "Authorization: Bearer $env:EDAS_USER_ACCESS_TOKEN" `
  -F "video=@C:\clips\pune-road.mp4;type=video/mp4"
```

Example response (values illustrative, not a real job):

```json
{
  "job_id": "00000000-0000-4000-8000-000000000000",
  "status": "queued",
  "progress": 0,
  "duration_ms": 42000,
  "created_at": "2026-11-17T10:00:00Z",
  "updated_at": "2026-11-17T10:00:00Z",
  "error_message": null,
  "width": 1920,
  "height": 1080,
  "source_fps": 30,
  "decoded_frames": null,
  "sampled_frames": null,
  "actual_sample_fps": null,
  "elapsed_ms": null,
  "average_inference_ms": null,
  "peak_rss_mb": null,
  "video_deleted_at": null,
  "events_deleted_at": null,
  "video_url": "https://example.invalid/private-signed-video-url",
  "video_url_expires_at": "2026-11-17T11:00:00Z"
}
```

The response includes a temporary signed URL for playback. It is for the authenticated job owner and expires; do not store it as a durable object URL or log it. When a video has been deleted by retention, the job response contains `video_url: null` and `video_url_expires_at: null`.

Validation errors can include:

| Status | Meaning |
|---:|---|
| `401` | Missing or invalid user access token. |
| `413` | Upload exceeds configured/hard size maximum. |
| `415` | Unsupported declared type, invalid MP4 signature, or undecodable stream. |
| `422` | Duration or video dimensions outside supported range. |
| `503` | Storage, PostgREST, or required server configuration unavailable. |

If database job creation fails after the object upload, the API attempts to delete that object before returning an error.

## Read a job

### `GET /jobs/{job_id}`

Returns status and processing summary for a job owned by the caller. It requests a new signed playback URL while the video object remains retained. A nonexistent job and a job owned by another user both return `404`.

Job status values:

| State | Meaning |
|---|---|
| `queued` | Waiting for a worker to claim it. |
| `processing` | A worker is decoding and analyzing sampled frames. |
| `completed` | Processing ended successfully; zero events is a valid model result only when inference completed. |
| `failed` | Input, storage, runtime, or inference failure. Check safe `error_message` and worker logs. |
| `cancelled` | User requested cancellation while queued or processing. |

Summary fields include source dimensions/FPS and, after a successful run, decoded/sampled frame counts, actual sampled FPS, elapsed time, average inference latency, and peak process RSS when available. Values are null until known. `progress` ranges from 0 to 100; worker updates cap in-progress at 99 and completion sets 100.

## Read detection events

### `GET /jobs/{job_id}/events?after={cursor}&limit={n}`

`after` defaults to 0 and is an exclusive integer cursor. `limit` defaults to 500 and must be from 1 to 1000. The response is:

```json
{
  "items": [
    {
      "cursor": 17,
      "event_id": "e2bd1a7f-2fa9-4a12-8848-105a7f421000",
      "timestamp_ms": 12500,
      "model": "road_damage_yolov8s_rdd2022",
      "class_id": 3,
      "class_name": "D40",
      "label": "Pothole",
      "confidence": 0.87,
      "bbox": {"x1": 120, "y1": 240, "x2": 340, "y2": 390},
      "track_id": null,
      "inference_ms": 24.8,
      "created_at": "2026-11-17T10:00:03Z"
    }
  ],
  "next_cursor": 17
}
```

This is a schema example only. It is not an actual model result. `bbox` uses original decoded frame pixels; timestamps are milliseconds from the beginning of the video. The current detector stores `track_id: null`. If event retention has expired, the response returns an empty `items`, the current `next_cursor`, and `"expired": true`.

## Stream job updates

### `GET /jobs/{job_id}/stream?after={cursor}`

Returns `text/event-stream`. Resume with `Last-Event-ID` or `after`; the larger valid cursor is used. The stream polls job state/events, emits keep-alives, and closes after a terminal job has no remaining events.

Example frames:

```text
event: progress
data: {"job_id":"...","status":"processing","progress":35,...}

id: 17
event: detection
data: {"cursor":17,"event_id":"...","timestamp_ms":12500,...}

event: status
data: {"job_id":"...","status":"completed","progress":100,...}
```

Event names are `progress`, `detection`, and `status`. The UI also polls the job and event endpoints so it can recover when an SSE connection fails. Invalid `Last-Event-ID` values return `400`; foreign/nonexistent jobs return `404`.

## Cancel a job

### `POST /jobs/{job_id}/cancel`

No request body. A caller can cancel only their own queued or processing job. The response is:

```json
{"job_id":"00000000-0000-4000-8000-000000000000","status":"cancelled"}
```

For a terminal job, the endpoint returns its current state. The worker checks for cancellation between decoded samples and will not save events/progress after observing a cancellation.

## Human-reviewed hazard reporting

Vision does not publish detections. After review, the frontend submits a standard manual report to `POST /api/v1/hazard-reports` as specified in [Core API Contract v2](API_CONTRACT.md#post-hazard-reports). The event timestamp and model label are included in the description; the user selects/validates hazard location and details. The API sees a manual report from the authenticated user, not a privileged detector write.

## Model readiness and the current runtime

The local road-damage checkpoint exists in the developer checkout but is ignored by Git. Current prediction is blocked by a Torch runtime import error (`cannot import name 'NP_SUPPORTED_MODULES' from torch._dynamo.utils`). Worker startup must register the model as failed/unavailable rather than ready, and jobs must not be described as completed inference. See [model details](vision-models/road-damage-rdd2022.md) and [failure handling](TECHNICAL_DOCUMENTATION.md#9-failure-handling-and-known-blockers).
