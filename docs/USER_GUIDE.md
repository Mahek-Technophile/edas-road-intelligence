# EDAS User Guide

This guide covers the Pune operations dashboard and EDAS Vision Lab. Labels and counts in the dashboard come from API data. Vision detections are displayed only when the configured worker stores actual model output.

## 1. Connect to EDAS

1. Start the EDAS API and frontend as described in the [repository README](../README.md).
2. Open the dashboard and choose **Connect to EDAS**.
3. Paste a valid Supabase Auth access token for your user, then select **Connect securely**.
4. The token is held in the current browser tab's `sessionStorage` and sent to the configured EDAS API as a bearer token. It is not a login credential exchange with the EDAS API; authentication is provisioned through Supabase Auth.
5. Select **Disconnect** or close the tab to clear the tab-scoped session.

Do not paste a service-role key. Only a user access token belongs in the browser. The API verifies it, derives the user identity from its `sub` claim, and performs ownership checks server-side.

## 2. Dashboard navigation

- **Overview** summarizes the current hazard data returned by the API.
- **Hazard map** displays hazards and supports the available filters.
- **Reports** lists reports and opens hazard details.
- **Report a hazard** creates a manual report with location, category, severity, description, and optional evidence.
- **Vision Lab** lets an authenticated user upload and review dashcam footage.

Dashboard information depends on API/database configuration. Empty results can mean there is no data in the connected environment; they are not prefilled with sample hazards.

## 3. Submit a manual hazard report

1. Open **Report a hazard**.
2. Choose a hazard category and severity.
3. Enter valid latitude and longitude in decimal degrees (WGS84), such as a location in Pune.
4. Add a concise description. Attach supported evidence only when appropriate.
5. Submit the report and review the returned outcome. A nearby active hazard may receive an independent observation; a repeat from the same reporter may be treated as a duplicate. A report near a repaired hazard may be routed into the challenge workflow.

The API is authoritative for matching, authorization, accepted file types, and state transitions. A report submission does not grant the reporter admin privileges.

## 4. Use Vision Lab

### Check readiness first

The capability panel shows model status supplied by the backend and worker heartbeat. Continue with video analysis only when **Road damage** is marked ready. The current repository/runtime may report it unavailable due a PyTorch/torchvision import error; in that case the application will not claim detections. Other capabilities are not configured in this release.

### Upload and inspect footage

1. Open **Vision Lab** and connect with a valid user token.
2. Select an MP4 file. Current limits are 200 MiB and 10 minutes, with an 8K dimension ceiling. The browser displays the local file preview; the API independently validates the uploaded bytes and video stream.
3. Select **Upload & analyze**. The upload goes to the private `vision-videos` bucket. The API creates a job for the authenticated user and returns its identifier/status.
4. Review the original footage and virtual driver display. Playback is synchronized; real model event boxes appear on the display at their timestamps. The 10 FPS setting controls frame sampling; it does not promise that the worker can infer at 10 frames per second.
5. Use the event timeline to seek to an event. Events arriving before or after the current playback position remain available by timestamp.
6. If the job is still queued or processing, observe progress or select **Cancel analysis**. Terminal states are `completed`, `failed`, or `cancelled`.
7. For a real event, inspect the frame and location. Choose category/severity, enter a verified location, then submit it as a normal manual hazard report. EDAS does not publish model events automatically.

If a job fails because the detector is unavailable, there will be no model output to review. Do not treat an empty timeline as a positive finding that the road is clear.

### Video privacy and retention

The bucket is private. API playback uses a temporary signed URL; the URL is not a public share link. The worker downloads source video to a temporary local file and removes that copy at the end of processing. The configured worker cleanup removes terminal-job source videos after 30 days and detection event rows after 365 days, while retaining job metadata. These are configurable prototype defaults and depend on the worker running successfully. Supabase backup retention and legal/privacy requirements need separate deployment review.

## 5. Read a Vision event

An event contains a timestamp, model identifier, class ID/code, human-readable label, confidence, and a bounding box. The box coordinates are `x1,y1,x2,y2` pixel values in the original decoded frame. `track_id` is null because tracking is not implemented. Confidence is model output, not a guarantee of correctness.

For the selected road-damage model the expected classes are:

| Code | Meaning |
|---|---|
| D00 | Longitudinal crack |
| D10 | Transverse crack |
| D20 | Alligator crack |
| D40 | Pothole |

## 6. Troubleshooting

| Symptom | What to check |
|---|---|
| API not connected | Confirm the API is running and `VITE_EDAS_API_BASE` includes `/api/v1`. Check browser/network console for connection errors. |
| Authentication rejected | Obtain a fresh Supabase user access token for the configured project. Never substitute the service-role key. |
| Model availability cannot be loaded | Confirm API Supabase configuration, migration state, and worker heartbeat. |
| Road-damage model is unavailable | Check worker logs, checkpoint path/hash, and installed Torch/torchvision compatibility. Current known error: `cannot import name 'NP_SUPPORTED_MODULES' from torch._dynamo.utils`. |
| Upload rejected | Use a valid decodable MP4 and check size, duration, dimensions, MIME type, and private Storage setup. |
| Job stays queued | Confirm the separate worker is running and can reach Supabase Storage and PostgREST. |
| Job fails | Review API/worker logs; user-facing errors intentionally avoid leaking SQL, tokens, or stack traces. |
| Playback link expired | Refresh the job to request a new short-lived signed video URL. |

## 7. Product limitations

The Vision model has not been validated against a representative Pune road dataset. Vehicle, pedestrian, traffic-sign, obstruction, lane, and object-tracking capabilities are not available. This is not a collision-warning system or a certified ADAS feature. Follow traffic laws and do not use the interface while driving.
