# Lane-Markings Detection

## Status

Capability: `lanes`
Current status: `MODEL_NOT_CONFIGURED`
Segmentation model and overlay implementation: not selected or available.

EDAS Vision Lab currently renders no lane-boundary segmentation. Bounding-box `DetectionEvent` records are not sufficient to represent continuous lane masks or polylines; the output contract must be extended before implementing lane overlays.

## Requirements for a future implementation

- Choose a CPU-compatible segmentation model and document its license, weights, checksum, and class definitions.
- Specify whether output is a mask, polyline, or curve, and define a transformation from inference resolution to original-frame coordinates.
- Include quality/confidence and account for missing, worn, temporary, or occluded markings.
- Validate on representative local roads, night/rain conditions, and varied dashcam placement.
- Measure temporal stability and compute cost at a configurable reduced sampling frequency.
- Keep lane output informational. Do not describe it as lane-departure warning, steering assistance, or certified ADAS behavior.

Mark the capability available only after runtime, schema, UI overlay, and field-evaluation gates pass.
