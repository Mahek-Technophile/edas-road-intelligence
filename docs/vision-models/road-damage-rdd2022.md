# Road Damage Model: RDD2022 YOLOv8s

## Identity and artifact

| Field | Value |
|---|---|
| Capability | `road_damage` |
| Model identifier | `road_damage_yolov8s_rdd2022` |
| Version | `seed0` |
| Architecture | YOLOv8s object detector |
| Dataset | RDD2022 |
| Source repository | [SreekarAditya/yolo-rdd2022-benchmark](https://huggingface.co/SreekarAditya/yolo-rdd2022-benchmark) |
| Selected checkpoint | [`yolo-rdd2022-benchmark/yolov8s_seed0_best.pt`](https://huggingface.co/SreekarAditya/yolo-rdd2022-benchmark/blob/main/yolo-rdd2022-benchmark/yolov8s_seed0_best.pt) |
| License | CC BY 4.0, per model repository; preserve attribution and verify terms before redistribution. |
| Local path | `backend/vision/models/pothole/road_damage_best.pt` |
| SHA-256 | `565aae6915e34e4f7f4c44dac0bdcf9fff21b83c4adc74cc97ca09cc31882ce8` |
| Inference device | CPU |
| Configured image size | 640 |
| Default confidence threshold | 0.10 |
| Default frame sample rate | 10 frames/second target; not a speed guarantee |

The checkpoint is a local artifact and is ignored by Git (`*.pt`). Do not commit it. The detector verifies the expected hash for the pinned default file and resolves classes from checkpoint metadata rather than assuming class order.

## Class mapping

The inspected checkpoint metadata maps these names and IDs:

| Checkpoint ID | Checkpoint name | EDAS code | Display name |
|---:|---|---|---|
| 0 | `longitudinal_crack` | D00 | Longitudinal crack |
| 1 | `transverse_crack` | D10 | Transverse crack |
| 2 | `alligator_crack` | D20 | Alligator crack |
| 3 | `pothole` | D40 | Pothole |

An unexpected/missing class map fails initialization. Bounding boxes are mapped to original decoded frame pixel coordinates. Events include source timestamp, confidence, model, class, and measured inference duration. Tracking is not implemented, so `track_id` is null.

## Current status and runtime block

The artifact was downloaded and its SHA-256 was verified. The detector can inspect checkpoint metadata, but real prediction on the current Windows/Python environment fails with:

```text
cannot import name 'NP_SUPPORTED_MODULES' from 'torch._dynamo.utils'
```

The model is therefore not usable in this runtime. The worker must report `failed`/unavailable, and no detection events, FPS, or inference latency are claimed. Do not patch or disable Windows security controls to force the runtime to load. Re-evaluate a supported interpreter/dependency combination or approved inference runtime, then rerun actual-image and video tests before marking this model ready.

## Accuracy and usage limitations

The source model card reports benchmark results on RDD2022, including lower results on its India partition. The card's metrics are not EDAS validation and do not establish accuracy on Pune roads. Evaluate with representative, permissioned Pune images and independently reviewed annotations. Account for road surface, light, camera angle, weather, occlusion, and dataset shift.

No hazard is automatically published from detector output. A user must review the relevant frame and location and submit a normal manual EDAS hazard report.

## Attribution and dependency license

Model source and checkpoint: [Hugging Face model repository](https://huggingface.co/SreekarAditya/yolo-rdd2022-benchmark). Weights and benchmark data are identified as CC BY 4.0 by the source repository; preserve source attribution and review the exact terms before redistribution.

Dataset paper: Arya, D. et al. (2022), *RDD2022: A multi-national image dataset for automatic Road Damage Detection*, [arXiv:2209.08538](https://arxiv.org/abs/2209.08538).

The inference package has its own license (Ultralytics is distributed under AGPL-3.0). Review runtime and distribution obligations independently of the checkpoint license.

## Reproduction

To fetch the selected public checkpoint into the expected local path, run from the repository root in PowerShell:

```powershell
New-Item -ItemType Directory -Force backend/vision/models/pothole | Out-Null
Invoke-WebRequest `
  -Uri "https://huggingface.co/SreekarAditya/yolo-rdd2022-benchmark/resolve/main/yolo-rdd2022-benchmark/yolov8s_seed0_best.pt" `
  -OutFile "backend/vision/models/pothole/road_damage_best.pt"
Get-FileHash -Algorithm SHA256 "backend/vision/models/pothole/road_damage_best.pt"
```

Compare the resulting hash with the value above before use. The file is ignored by Git; never force-add or commit it. Respect the source license when redistributing the artifact.

With the project Python environment and a local real road image:

```powershell
backend\.venv\Scripts\python.exe -m backend.vision --source C:\path\to\road-image.jpg --confidence 0.10 --image-size 640
```

The current known environment fails during prediction and should return a failure status with no detections. A future successful command must be recorded with the input provenance, software versions, checkpoint hash, and actual output; never copy the schema example from the API docs as a prediction.
