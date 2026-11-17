# Vehicle and Pedestrian Detection

## Status

Capability: `vehicles_pedestrians`
Current status: `MODEL_NOT_CONFIGURED`
Model, artifact, class map, and inference implementation: not selected or available.

The API reports this capability as unavailable. It must remain unavailable until a real compatible detector has been selected, legally reviewed, integrated, and validated. The dashboard must not display vehicle or pedestrian detections derived from placeholders.

## Requirements for a future implementation

- Define target classes required by Pune road operations (for example, road vehicles and pedestrians) and document exclusions.
- Select a small CPU-compatible detector with a documented license, provenance, checksum, and benchmark.
- Validate crowded streets, two-wheelers, auto-rickshaws, buses, night scenes, and occlusion on representative labeled footage.
- Map boxes to source-frame pixel coordinates and emit the shared timestamped event schema.
- Measure end-to-end sampled-frame throughput, inference latency, CPU, and memory. Do not assume the model meets 10 FPS.
- Consider privacy and retention carefully because pedestrian/vehicle imagery may identify people or plates.

Do not use a COCO model's class names as evidence of acceptable Pune performance. Keep the capability disabled until the above gates pass.
