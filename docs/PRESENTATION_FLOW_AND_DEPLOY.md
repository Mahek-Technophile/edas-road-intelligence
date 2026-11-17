# EDAS — presenter flow, update, and Vercel deployment

**Audience:** Mahek / Sonakshi / Ankit / Vaishnavi
**App:** `frontend/` — React 18 + TypeScript + Vite, hash-routed, offline demo data
**Deck:** `deliverables/EDAS_Presentation.pptx` · **Script:** `deliverables/EDAS_Presentation_Script.md`

---

## 1. Update — what is in the frontend now

The frontend is the redesigned Pune pilot you chose to keep. It does **not** require Supabase, an access token, or the FastAPI service.

| Area | Current state |
|---|---|
| Routes | Nine hash routes: Command centre, Live hazard map, Driver assistance, Vision Lab, Crowdsourced, Civic intelligence, Hazard register, Report hazard, Settings. |
| Demo data | 30 Pune hazards, 12 vehicles, route alerts, verification story, weekly observations. Stored in `localStorage` under `edas.pilot.v1`. |
| Vision Lab | Supplied before/after pair, synchronized playback, six review events, seek controls, current detection, linked hazard, custom upload slots. |
| Video compatibility | The supplied after clip was transcoded from MPEG-4 Part 2 to H.264 because Chromium refused the original codec. |
| Maps | Leaflet with OpenStreetMap tiles. CARTO was removed because it now watermarks tiles without an API key. |
| Model label | `YOLOv8s-road`, aligned with the checkpoint named in the technical README. |
| Civic flow | Corridor queue, seven-stage workflow, SLA view, case advancement, repair verification. |
| Build | `npm run build` passes. Production output includes `/media/sample-before.mp4`, `/media/sample-after.mp4`, posters and `vision-run.json`. |

**Demo boundary:** the six Vision Lab detections are prepared metadata for the reference survey. The app does not call a model for this run, and custom uploads review playback only. No field accuracy or municipal deployment is claimed.

Reset the workspace at any time in **Settings → Reset pilot workspace**.

---

## 2. UI flow while presenting — click, screen, say

Target: **6–7 minutes**. Open the app at `#/overview` before you start. Keep the browser at 100% zoom and close any notifications popover.

| Time | Click / route | What the audience sees | Say |
|---|---|---|---|
| 0:00 | `#/overview` | Four KPI cards, Pune hazard map, priority queue, weekly observations. | “This is the operating picture for the Pune pilot: 30 hazards in the register, 24 independently verified, 4 active alerts and 12 contributing vehicles. The point is not another map — it is one shared record for drivers and the city.” |
| 0:35 | **Live hazard map** → set **Severity** to **Critical** → click one marker | Map narrows to critical hazards; side panel shows confidence, reporters, severity and last seen. | “Every dot is an observation, not a complaint. It carries a location, a confidence score, independent reporters and the repair stage. Filtering to critical shows what needs a same-day decision.” |
| 1:05 | **Open hazard record** | Hazard register opens with the selected case. Show the evidence and status trail, then close. | “The record is the audit trail. A driver report, a Vision Lab review and a municipal repair all attach to the same hazard.” |
| 1:25 | **Driver assistance** → **Start drive** | Car moves along Sinhagad Road; alert appears with distance, severity and action. | “This is the same data at road speed. The driver gets the warning before the defect, with a clear action: reduce speed, change lane, or monitor. EDAS is advisory; it never controls the vehicle.” |
| 1:55 | Wait for the alert → **Acknowledge** | Alert state changes to acknowledged; next alert approaches. | “Acknowledging closes the alert, not the hazard. The city still owns the repair.” |
| 2:10 | `#/vision` → **Play analysis** | Raw and analysed clips play together; event timeline and detection cards update. | “Vision Lab is the review desk. Left is the raw survey, right is the analysed output. They play in lockstep, so we are comparing the same moment.” |
| 2:40 | Click event **00:06.2** | Both clips seek to the critical pothole; current-detection card shows class, confidence and approach distance. | “The model surfaces a candidate with a confidence score. That score is not truth. A reviewer checks the frame and the location before anything reaches a driver or a crew.” |
| 3:00 | Point to **Open linked hazard**, then click **Confirm review** | Review state confirms; the linked hazard remains in the register. | “This is the human gate. Detection is fast; publishing a civic case is deliberate.” |
| 3:20 | `#/crowd` → **Run verification** | Three vehicles arrive in sequence; consensus score climbs; one duplicate is merged. | “One car is a data point. Three cars inside 35 metres are evidence. Duplicate frames never inflate confidence.” |
| 3:50 | `#/civic` | Queue by corridor, workflow stages, SLA cards, highest-risk ranking. | “The same evidence becomes a repair programme. Every case has a stage, an owner and an SLA.” |
| 4:15 | **Advance top priority** | Top-ranked case moves to the next stage; toast confirms. | “The city is not reading a folder of complaints. It is advancing a prioritised queue with a measurable clock.” |
| 4:35 | Click the **In progress** workflow stage | Queue filters to cases under repair. | “This is the accountability view: what is open, what is late, and what has been independently verified after repair.” |
| 4:55 | `#/report` → choose **Pothole**, **High**, use the default location, add a short description → **Submit report** | Confirmation screen with the new hazard ID. | “A driver can add a new observation in about 20 seconds. It enters the same matching and verification pipeline — no separate spreadsheet, no lost WhatsApp message.” |
| 5:25 | **Open hazard record** | New report appears in the register with its own record. | “The loop closes only when the new observation is visible to the next driver and the repair team.” |
| 5:45 | `#/settings` | Demo controls, API connection, reset workspace. | “The demo runs locally and is resettable. The API connection is optional; the presentation does not depend on a live backend.” |
| 6:00 | Return to `#/overview` | Full picture again. | “One observation, two outcomes: a safer next kilometre and a better repair decision. That is EDAS.” |

### Presenter cautions

- Do **not** call the prepared Vision Lab events “live inference”. Say “review run” or “reference survey”.
- Do **not** claim the footage is Pune. It is a reference residential survey; the UI labels the run as a reference.
- Do **not** claim measured accuracy, a municipal partnership, or a live vehicle network.
- If a video does not play, stay on the slide and use the two stills; the workflow is the point.
- After the demo, reset the workspace if the device will be used again by someone else.

### Optional 60-second version

Command centre → Vision Lab play → one event → Crowdsourced run → Civic advance. Skip map, driver and report.

---

## 3. Deploy to Vercel

The app is a static Vite SPA with hash routing. No server, database, environment variable, or rewrite rule is required for the demo.

### Option A — Vercel CLI (fastest)

```bash
cd edas-road-intelligence/frontend
npm install
npm run build
npx vercel
```

On the first run:

1. Log in with GitHub, GitLab, Bitbucket or email.
2. Confirm the project name.
3. Set the project root to the current folder (`frontend`).
4. Keep the detected framework as **Vite**.
5. Build command: `npm run build`.
6. Output directory: `dist`.

Then promote to production:

```bash
cd edas-road-intelligence/frontend
npx vercel --prod
```

The CLI prints the preview and production URLs.

### Option B — Vercel dashboard

1. Push the repository to GitHub/GitLab/Bitbucket.
2. Open **Vercel → Add New → Project** and import the repository.
3. Set **Root Directory** to `frontend`.
4. Framework Preset: **Vite**.
5. Build Command: `npm run build`.
6. Output Directory: `dist`.
7. Install Command: `npm install` (or leave the default; the lockfile is present).
8. Node.js Version: **22.x** (Vite 8 needs Node 20.19+ or 22.12+).
9. Environment variables: **none** for the demo. Add `VITE_EDAS_API_BASE` only if you later attach the FastAPI service.
10. Click **Deploy**.

### Verify the deployment

Open these URLs on the deployed domain:

- `https://<project>.vercel.app/#/overview` — dashboard loads.
- `https://<project>.vercel.app/#/vision` — both videos load and play together.
- `https://<project>.vercel.app/media/vision-run.json` — returns JSON, not HTML.
- `https://<project>.vercel.app/media/sample-after.mp4` — returns a video response.

Also check the browser console for errors and confirm the OpenStreetMap tiles render.

### Why no `vercel.json` is needed

The app uses hash routing (`/#/vision`), so the browser never requests `/vision` from the server. Vercel serves `index.html` and the static assets directly. If you later switch to path-based routing, add a rewrite:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Do not add that rewrite for the current hash-routed build; it can interfere with static media paths.

### Common failures

| Symptom | Fix |
|---|---|
| 404 after refresh on `/vision` | Use the hash URL `/#/vision`; path routing is not enabled. |
| Blank page, build succeeds | Root Directory is probably the repository root. Set it to `frontend`. |
| `npm install` or build fails on Node | Set Node.js 22.x in Vercel Project Settings → General. |
| Videos return index.html | Check that `frontend/public/media` is present and the build output contains `dist/media`. |
| Map is blank but the rest works | The browser cannot reach OpenStreetMap tiles; check network/adblock. |
| Old demo state appears | The demo stores state in `localStorage`. Use Settings → Reset pilot workspace, or a private window. |

### Security and data notes

- The demo contains no accounts, personal data, API keys or backend secrets.
- Do not put a Supabase service-role key or model token in `VITE_*` variables; Vite exposes them to the browser.
- The demo works entirely from static files. Connecting the real API is optional and should use a user-scoped token, never a service-role key.
- Vercel preview deployments are public by default. Do not upload private footage or municipal data to a preview URL.

---

## 4. Files to hand over

| File | Use |
|---|---|
| `deliverables/EDAS_Presentation.pptx` | 16-slide editable deck. |
| `deliverables/EDAS_Presentation_Script.md` / `.docx` | 7–10 minute four-speaker script. |
| `docs/DEMO_GUIDE.md` | Demo route, implemented vs prepared, limitations. |
| `docs/PRESENTATION_FLOW_AND_DEPLOY.md` | This presenter and deployment sheet. |
