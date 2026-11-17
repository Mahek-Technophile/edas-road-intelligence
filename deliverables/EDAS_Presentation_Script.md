# EDAS — Presentation Script

**IEEE Smart City Workathon 2026 · Working Prototype & Implementation**
**Team EDAS:** Mahek Shukla · Sonakshi Chowgule · Ankit Raj · Vaishnavi Zavar
**Format:** 16 slides · four speakers · live demo · target 8 min 45 s (hard stop 10:00)

---

## Run of show

| Time | Speaker | Slides | Content |
|---|---|---|---|
| 0:00–1:20 | Mahek | 1–3 | Opening, problem, why existing tools stop short |
| 1:20–2:30 | Sonakshi | 4–5 | Working solution and the EDAS loop |
| 2:30–3:50 | Ankit | 6 | System architecture and data flow |
| 3:50–5:00 | Sonakshi | 7 + live app | Vision Lab demo and the review gate |
| 5:00–6:00 | Ankit | 8–9 | Reinforcement-learning policy and crowdsourced verification |
| 6:00–7:00 | Vaishnavi | 10–11 | Civic workflow and the Pune pilot |
| 7:00–8:00 | Vaishnavi | 12–14 | Prototype evidence, business model, roadmap |
| 8:00–8:45 | All | 15–16 | Closing and references |

**Room setup:** open the app at `http://localhost:5173/#/vision` before walking on. Keep the Vision Lab loaded and paused. Have slide 7 and slide 10 ready as the fallback if the browser fails.

---

## 0:00 · Mahek · Slide 1

Good morning. We are Team EDAS — Mahek, Sonakshi, Ankit and Vaishnavi.

In 2024, India recorded **4.88 lakh road accidents and 1.77 lakh deaths**. Those are not abstract numbers. Every one of them began with a road that someone had already seen was damaged.

The warning existed. It just never travelled fast enough — not to the next driver, and not to the crew who could fix it.

EDAS changes that. We turn the smartphone already on the dashboard into a road-safety sensor, and every participating vehicle into a contributor to a live road-condition map. What we are showing is a working prototype: a driver experience, a vision review lab, and a municipal repair workflow.

Here is the problem we are solving.

## 0:35 · Mahek · Slide 2

A pothole is not just a road defect. It is an unpredicted event in a driver's path.

Today the loop is broken twice.

**First, warning.** Navigation knows the road, not its condition. By the time a driver sees a pothole, the decision is already made.

**Second, recording.** Dashcams capture evidence, but it stays on a card. Cities receive complaints, not measurements. Maintenance stays reactive, and the same defect is discovered again and again — by different wheels.

The data exists at the moment of encounter. We lose it.

## 1:00 · Mahek · Slide 3

Existing tools solve one slice.

Navigation warns about traffic, not fresh road damage. Manual complaints are slow and incomplete. Dashcams and ADAS can see the road, but they remain vehicle-bound and expensive.

EDAS connects detection, independent verification, driver alerts and a civic repair queue in one loop. We are complementary to vehicle safety systems, not a replacement for them.

Sonakshi will show what that looks like in the product.

## 1:20 · Sonakshi · Slide 4

One smartphone. Two outcomes.

For the driver: a hazard alert before arrival, with distance, severity and a recommended action. For the city: verified, geotagged evidence inside a repair workflow. And a network effect: every pass improves the corridor map without new roadside hardware.

The loop is simple: **observe, verify, alert, repair, re-verify**. The driver and the city are two ends of the same observation.

## 1:45 · Sonakshi · Slide 5

On the phone we sense camera, GPS and motion. YOLOv8 detects road damage. GPS projects it to the corridor. Independent vehicles verify it. The driver gets an alert; the city gets a case.

Two constraints matter. Alerts are advisory — EDAS never controls steering, braking or throttle. And we keep hazard frames and metadata only; there is no continuous cabin video.

Ankit will explain how the system is built.

## 2:30 · Ankit · Slide 6

The architecture is edge-first and cloud-verified.

**Acquisition:** camera, GPS, accelerometer and vehicle context. **Edge processing:** frame sampling, YOLOv8 detection, hazard classification and sensor fusion. **Intelligence:** cross-vehicle consensus, duplicate removal, the alert policy and severity scoring. **Communication:** REST and WebSocket APIs, geo-fenced alerts and private evidence. **Application:** driver app, fleet view and civic dashboard. And the **data layer**: PostgreSQL with PostGIS, hazard records, observations, repair state and analytics.

The important part is the loop back. Verified repairs and new observations become fresh evidence. That feedback loop is the product.

## 3:20 · Ankit · Slide 7

Detection is the entry point, not the answer. YOLOv8 finds road damage; a reviewer confirms the location before a case opens. Sonakshi will demonstrate.

## 3:30 · Sonakshi · Slide 7 + Vision Lab demo

*(Switch to the app at `#/vision`.)*

This is the Vision Lab. On the left is the raw survey; on the right is the analysed output. They play together, so we are comparing the same moment on the road.

The timeline lists six events. I'll click one. *(Click an event.)* The current-detection card shows the class, confidence and approach distance. The reviewer can open the linked hazard and confirm it before anything reaches a driver or a repair crew.

Confidence is the model's score for that detection — not an accuracy claim. The review gate is deliberate: it keeps uncertainty away from drivers and crews.

The prototype is scoped product-first. The workflow is real; field inference is the next engineering step.

## 4:50 · Ankit · Slide 8

A detector answers *what is there*. It does not answer *what EDAS should do*. That is the reinforcement-learning layer.

**State:** hazard class, distance, confidence, route context. **Action:** alert now, monitor, suppress or escalate. **Reward:** safety, alert accuracy, relevance — minus false alerts and driver distraction.

The weights on screen are proposed design parameters, not measured results. The pilot tunes them.

The safety override is absolute: a critical hazard always alerts, whatever the reward. And this policy never touches the vehicle controls.

## 5:20 · Ankit · Slide 9

One high-confidence frame is not enough. A hazard becomes trusted when independent vehicles agree.

Here, three vehicles pass within 35 metres in about 90 seconds. Each observation raises the consensus score: 72, 88, 94. Duplicate frames are merged; one alert is published, not three.

That is how we avoid a noisy map.

## 5:50 · Vaishnavi · Slide 10

The same evidence becomes a repair programme.

Every hazard moves through detected, reported, verified, assigned, in progress, repaired, and independently verified. The civic workspace shows the queue by corridor, with an SLA and a full evidence trail.

A passing vehicle closes the case — not a spreadsheet.

The snapshot on screen is our pilot workspace: 30 hazards, 24 verified, 25 hours median detection-to-repair. Those are dataset figures, not field results.

## 6:20 · Vaishnavi · Slide 11

Pune is the pilot because it gives us dense mixed traffic and a municipal workflow that needs better data.

**Phase one, six weeks:** 50 vehicles on Sinhagad Road and Katraj–Kondhwa, with a four-week baseline.
**Phase two:** 500 vehicles across eight corridors, ward-level SLAs and independent verification.
**Phase three:** 2,000 vehicles, a city API, fleet partnerships, and Marathi and Hindi interfaces.

The first step is an MoU with ward teams; we are not claiming an existing partnership. Density before geography: make one corridor trusted, then replicate the playbook.

## 7:00 · Vaishnavi · Slides 12–13

On screen are the three working surfaces: the command centre, the Vision Lab and the civic workspace. Under them: React, TypeScript, FastAPI, PostGIS, Supabase and a YOLOv8 road-damage checkpoint. Field deployment adds a mobile app, on-device inference, streaming and CMMS integration.

The business follows the data. Drivers get free alerts and a ₹99 premium tier. Fleets pay ₹150–250 per vehicle per month. Cities pay for corridor intelligence.

Fleets create density. Density creates verification. Verification creates the civic product.

## 7:35 · Vaishnavi · Slide 14

Our pilot measures four things: alerts delivered, independent confirmations, false-alert rate, and repair verification time.

These are targets, not results yet. The roadmap is deliberately staged: prove the loop, then scale.

## 8:10 · All · Slide 15

**Mahek:** Every journey contributes to safer roads.

**Sonakshi:** Every vehicle becomes part of India's road intelligence network.

**Ankit:** One observation. Independent verification. A closed loop.

**Vaishnavi:** EDAS — making every journey safer and every road smarter.

**All:** Thank you. We are happy to take questions.

---

## Demo fallback

If the browser or video fails:

1. Stay on slide 7. Use the two stills to explain raw vs analysed output and the six-event timeline.
2. Use slide 10 to walk the civic queue.
3. Say plainly: “The live review is not loading; the workflow is on the slide.” Do not improvise results.
4. Reopen the app once, at `#/vision`, and try the demo again only if the room is waiting.

## Q&A preparation

**“Is this just a dashcam app?”**
No. A dashcam records. EDAS verifies across vehicles, warns the next driver, and routes evidence into a repair workflow. The closed loop is the product.

**“How accurate is the model?”**
We do not claim field accuracy. Confidence scores are per-detection model outputs. The pilot will measure precision and recall on Pune corridors, with human review before any civic case.

**“Why reinforcement learning?”**
Detection is not the same as deciding when to interrupt a driver. The policy selects alert, monitor, suppress or escalate under a hard safety constraint. It never controls the vehicle.

**“What about privacy?”**
Hazard frames and metadata only. No continuous cabin video. Evidence is private and shared through time-limited access.

**“What is actually working today?”**
The React product surface, the before/after review, hazard register, driver alerts, crowdsourced verification and civic workflow, running on a seeded Pune pilot dataset. The backend and model pipeline exist; live field inference is the next step.

**“Do you have a Pune partnership?”**
Not yet. The pilot is designed with ward teams; the first milestone is an MoU. We have not claimed a deployment we do not have.

**“How do you prevent false alerts?”**
Independent observations, a 35-metre spatial match, duplicate suppression, confidence thresholds, and a human review gate for civic cases.

**“How do you make money?”**
B2C premium, B2B fleet subscriptions, and B2G corridor intelligence. Fleets create the density that makes verification fast enough for cities to pay.

## Delivery notes

- Do not read the slides. The slides carry the evidence; the script carries the argument.
- Pause for two seconds after the opening statistic and after “the feedback loop is the product.”
- During the demo, narrate only what is on screen. If a click does not land, move on.
- Keep the closing to four short lines; do not add a fifth speaker.
- Hard stop at 10:00. The Q&A starts after the thank-you.
