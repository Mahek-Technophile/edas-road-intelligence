# Road-Obstruction Detection

## Status

Capability: `obstructions`
Current status: `MODEL_NOT_CONFIGURED`
Model, artifact, and inference implementation: not selected or available.

EDAS does not currently identify road obstructions. The generic class `obstruction` in the hazard-reporting API is a user report category; its existence does not mean an obstruction detector is installed.

## Requirements for a future implementation

- Define operational classes: for example debris, parked/disabled vehicle, fallen object, work zone, or water across road. State what is excluded.
- Combine an appropriate detector with a documented road-region filter only after validating geometry and camera assumptions.
- Evaluate on labeled Pune dashcam frames with day/night, roadworks, occlusion, and background clutter.
- Record whether each event is a raw object detection or an assertion that the driving path is blocked; those are not equivalent claims.
- Use the shared timestamped event format, report measurable uncertainty, and require a human to choose hazard category/location before submitting.

Do not infer that an object is dangerous solely from its detection box or location in the image.
