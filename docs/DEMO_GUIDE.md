# EDAS working prototype — demo guide

This is the walkthrough for the polished React pilot in `frontend/`. It is the version used for the IEEE Smart City Workathon presentation.

The pilot runs **without authentication or a backend**. It opens on a seeded Pune dataset, supports the full driver → review → civic workflow, and persists changes in the browser. The FastAPI service in `backend/` remains available for the technical deployment described in the main README.

## Run it

```bash
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`.

Production build:

```bash
npm run build
```

## Six-minute demo route

1. **Command centre** — start with the corridor picture: active hazards, verified reports, vehicle coverage, and the repair queue.
2. **Live hazard map** — filter by severity and corridor; open a hazard to see evidence and the linked civic case.
3. **Driver assistance** — run the route simulation. Point out the alert distance, recommended action, and the advisory safety banner.
4. **Vision Lab** — use the supplied before/after pair. Press **Play analysis**; both clips play together. Click a timeline event to seek both videos, then **Open linked hazard**.
5. **Crowdsourced** — advance the verification story. Three independent vehicles raise the consensus score; one duplicate is merged.
6. **Civic intelligence** — show the corridor queue and workflow stages. Move a case from verification to repair and back to independent verification.
7. **Hazard register** — open the drawer, review the evidence, and change status.
8. **Report a hazard** — submit a new report from the road. It appears in the register and persists after refresh.
9. **Settings** — show the pilot controls and the optional API connection.

The presentation demo should stop after the Civic step; the rest is for judges who want to explore. For the click-by-click narration and Vercel deployment settings, see [PRESENTATION_FLOW_AND_DEPLOY.md](PRESENTATION_FLOW_AND_DEPLOY.md).

## What is implemented

- React 18 + TypeScript + Vite workspace with nine routes and responsive layout.
- Command centre, live map (Leaflet/OpenStreetMap tiles), driver assistance simulation, hazard register with detail drawer, quick report, and settings.
- Vision Lab with synchronized before/after playback, six review events, seek controls, current-detection card, linked hazard and review confirmation.
- Custom upload slots for a **Before** and **After** clip. Uploaded clips play in the same synchronized player.
- Crowdsourced verification story, duplicate handling, consensus score, and civic workflow.
- Civic queue with severity/corridor filters, status changes, evidence view, and repair verification.
- Local persistence via `localStorage` (`edas.pilot.v1`).
- Optional API connection from Settings. The token is held in memory for the session and is not written to local storage.
- FastAPI/PostGIS/Supabase backend and a YOLOv8 road-damage pipeline in the repository (documented in the root README; not required for the demo).

## What is prepared, not live

- The **30 Pune hazards**, 12 vehicles, corridor alerts, verification story and weekly observations are a curated pilot dataset, not a municipal feed.
- The **Vision Lab detections** are prepared metadata for the supplied reference survey (`RUN-021`, six events, confidence 0.84–0.96). The UI does not call a model for this run. The annotations are baked into the supplied after clip.
- Uploading your own pair runs the playback/review workflow only; it does **not** run inference and does not invent detections. The event list stays tied to the reference run.
- The **repair times** shown in the civic workspace (for example 25 hours median detection-to-repair) are dataset figures, not measured field outcomes.
- Vehicle count, alert reach and coverage describe the pilot dataset, not a live network.

## What is not implemented here

- A production mobile app, on-device inference, or a vehicle integration.
- Live municipal/CMMS integration, SMS/email dispatch, or push notifications.
- Accounts, roles, multi-tenant access control, or server-side storage in the demo UI.
- Continuous background location or camera capture.
- Measured model accuracy, false-alert rates, or field performance.

## Known limitations

- The before/after footage is a **reference residential survey**, not Pune. The Vision Lab labels it as a reference run rather than claiming a Pune location.
- OpenStreetMap tiles need an internet connection. The rest of the pilot works offline.
- Demo changes live in one browser profile. They are not shared between machines.
- The custom player expects browser-compatible H.264/AAC MP4. The supplied after clip is transcoded to H.264 for Chromium.
- The UI intentionally avoids technical disclaimers. This document is the honest boundary between the working workflow and prepared data.

## Replace the demo video pair

Place two browser-compatible MP4 files here:

```
frontend/public/media/sample-before.mp4
frontend/public/media/sample-after.mp4
```

Then update `frontend/public/media/vision-run.json` if the duration, events or confidence values change. The poster frames are:

```
frontend/public/media/sample-before-poster.jpg
frontend/public/media/sample-after-poster.jpg
```

If you upload a different pair inside the app, the player uses those files for that session and hides the prepared detection list. Nothing is uploaded to a server.

## Presentation files

- `deliverables/EDAS_Presentation.pptx` — 16-slide editable deck based on the IEEE template structure (four sections, logo strip, navy/blue palette).
- `deliverables/EDAS_Presentation_Script.md` — 7–10 minute, four-speaker script with timings, demo cues, fallback and Q&A.
- `deliverables/EDAS_Presentation_Script.docx` — formatted presenter copy.
- `deliverables/assets/` — title background and before/after stills used in the deck.

## Checks run

- `npm run build` passes (Vite production build).
- Command centre, Vision Lab, and Civic render without console errors.
- Both supplied videos load and play in sync; the after clip was transcoded from MPEG-4 Part 2 to H.264 because Chromium refused the original codec.
- The deck was rendered to images through PowerPoint and visually checked for title collisions and diagram direction.
- The custom upload path was exercised with both supplied files: both blob clips loaded and played in sync. Other interactive controls were not exhaustively tested.
