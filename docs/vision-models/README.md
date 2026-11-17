# Vision Model Registry

This directory records the model-backed capabilities EDAS expects and the actual state of each one. A capability is not considered implemented because its name appears in the UI or API; it must have a verified artifact, compatible runtime, real inference path, tests, and documented evaluation.

## Current capability state

| Capability | API name | Model state | Current behavior |
|---|---|---|---|
| Road damage | `road_damage` | Configured checkpoint; inference runtime currently `failed` | RDD2022 YOLOv8s; no results emitted while Torch import is blocked. |
| Vehicles and pedestrians | `vehicles_pedestrians` | `MODEL_NOT_CONFIGURED` | No model or inference implementation. |
| Traffic signs | `traffic_signs` | `MODEL_NOT_CONFIGURED` | No model or inference implementation. |
| Road obstructions | `obstructions` | `MODEL_NOT_CONFIGURED` | No model or inference implementation. |
| Lane markings | `lanes` | `MODEL_NOT_CONFIGURED` | No segmentation model or inference implementation. |
| Object tracking | `tracking_available` | unavailable | Events have `track_id: null`. |

## Model readiness states

- `ready`: the worker has verified the artifact and can execute the inference runtime.
- `MODEL_NOT_CONFIGURED`: no compatible model artifact/configuration is available.
- `failed`: configured model/runtime failed validation or initialization.

Only `ready` capabilities may produce events. A successful file download, checkpoint deserialization, or schema/unit test alone does not establish readiness.

## Capability notes

- [Road damage: RDD2022 YOLOv8s](road-damage-rdd2022.md)
- [Vehicles and pedestrians](vehicle-pedestrian.md)
- [Traffic signs](traffic-signs.md)
- [Road obstructions](obstructions.md)
- [Lane markings](lane-markings.md)

## Shared event contract

All implemented detectors should output the shared `DetectionEvent`: unique event ID, video timestamp in milliseconds, model/version name, class ID/name, readable label, confidence in `[0,1]`, original-frame pixel `x1,y1,x2,y2` bounding box, optional track ID, and measured inference milliseconds. Segmentation outputs must define a compatible overlay representation before implementation. Do not store or display synthetic events as detector output.

## Readiness and evaluation gates

Before marking a future model ready:

1. Record official model source, artifact checksum, license, version, and class map.
2. Confirm the runtime can load **and run inference** on the target CPU environment without bypassing operating-system controls.
3. Validate class IDs and output geometry against the actual artifact.
4. Run a repeatable benchmark on authorized representative Pune data; measure throughput, latency, CPU, and memory.
5. Compare with human-reviewed labels and publish per-class metrics and limitations.
6. Add tests for configured, absent, incompatible, and runtime-failure states.
7. Keep the UI and API status accurate and require human review before hazard reporting.
