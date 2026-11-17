# EDAS Vision pipeline

For the complete product architecture and setup, see [EDAS Technical Documentation](../../docs/TECHNICAL_DOCUMENTATION.md), [Vision API](../../docs/VISION_API.md), and the [Vision Model Registry](../../docs/vision-models/README.md). This file records implementation-specific checkpoint and class-map details.

The first configured capability is road-damage detection with the YOLOv8s
RDD2022 seed-0 checkpoint. The checkpoint is downloaded locally to
`backend/vision/models/pothole/road_damage_best.pt`; its artifact is ignored by
Git and verified against SHA-256
`565aae6915e34e4f7f4c44dac0bdcf9fff21b83c4adc74cc97ca09cc31882ce8` before
loading. Set `EDAS_VISION_MODEL_PATH` to use another local file (the legacy
`EDAS_ROAD_DAMAGE_WEIGHTS` alias is also accepted); custom
checkpoints must expose the same four recognized class names.

The pinned checkpoint's stored class map was inspected: `0=longitudinal_crack`,
`1=transverse_crack`, `2=alligator_crack`, `3=pothole`. The detector resolves
classes from the loaded checkpoint metadata and does not infer class identity
from an assumed position. Output boxes use `x1,y1,x2,y2` pixel coordinates in
the original decoded frame. The model runs on CPU at 640px with configurable
confidence (default `0.10`). OpenCV samples a configurable target of 10 frames
per second; this is a sampling target, not a throughput guarantee.

## Attribution and limits

Weights and benchmark data are released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Source: [SreekarAditya/yolo-rdd2022-benchmark](https://huggingface.co/SreekarAditya/yolo-rdd2022-benchmark),
checkpoint [`yolo-rdd2022-benchmark/yolov8s_seed0_best.pt`](https://huggingface.co/SreekarAditya/yolo-rdd2022-benchmark/blob/main/yolo-rdd2022-benchmark/yolov8s_seed0_best.pt).
Please preserve this attribution and the license when redistributing the
checkpoint. Ultralytics itself is distributed under AGPL-3.0; review that
license before distributing a bundled runtime.

The RDD2022 dataset citation is:

> Arya, D., Maeda, H., Ghosh, S. K., Toshniwal, D., Mraz, A., Kashiyama, T., &amp;
> Sekimoto, Y. (2022). *RDD2022: A multi-national image dataset for automatic
> Road Damage Detection*. arXiv:2209.08538.

The model card reports YOLOv8s India-partition mAP50 of 0.3096 and pothole
(D40) AP50 of 0.3557. Those are benchmark figures, not EDAS validation. Confirm
results on Pune imagery before treating detections as reliable. EDAS does not
automatically publish detector output as a public hazard. Vehicle/pedestrian,
traffic-sign, obstruction, lane, and tracking capabilities remain explicitly
unavailable until their own compatible assets and implementations are added.
