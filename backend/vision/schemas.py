"""Stable event and capability schemas shared by the worker and Vision API."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class BoundingBox:
    """XYXY pixel coordinates in the original decoded video frame."""

    x1: float
    y1: float
    x2: float
    y2: float


@dataclass(frozen=True, slots=True)
class DetectionEvent:
    event_id: str
    timestamp_ms: int
    model: str
    class_id: int
    class_name: str
    label: str
    confidence: float
    bbox: BoundingBox
    track_id: int | None
    inference_ms: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class ModelCapability:
    capability: Literal[
        "vehicles_pedestrians", "traffic_signs", "road_damage", "obstructions", "lanes"
    ]
    model_name: str | None
    version: str | None
    supported_classes: tuple[str, ...]
    device: Literal["cpu"]
    status: Literal["ready", "MODEL_NOT_CONFIGURED", "failed"]
    confidence_threshold: float | None
    input_size: int | None
    detail: str | None = None

    def to_dict(self) -> dict:
        value = asdict(self)
        value["supported_classes"] = list(self.supported_classes)
        return value


@dataclass(frozen=True, slots=True)
class VideoProcessingSummary:
    width: int
    height: int
    duration_ms: int
    source_fps: float
    decoded_frames: int
    sampled_frames: int
    event_count: int
    elapsed_ms: float
    average_inference_ms: float
    actual_sample_fps: float
    peak_rss_mb: float | None

    def to_dict(self) -> dict:
        return asdict(self)
