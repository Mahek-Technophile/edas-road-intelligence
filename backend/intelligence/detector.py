"""Detector boundary that never fabricates vision results."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Callable, Protocol, TypeAlias


class DetectorStatus(str, Enum):
    READY = "ready"
    MODEL_NOT_CONFIGURED = "MODEL_NOT_CONFIGURED"


@dataclass(frozen=True, slots=True)
class Detection:
    """A future detector output; confidence must be between zero and one."""

    hazard_type: str
    confidence: float
    bounding_box: tuple[float, float, float, float] | None = None


@dataclass(frozen=True, slots=True)
class DetectionResult:
    status: DetectorStatus
    detections: tuple[Detection, ...] = ()


class Detector(Protocol):
    def detect(self, image_bytes: bytes) -> DetectionResult:
        """Analyze one image. Implementations must not infer without a model."""


ModelLoader: TypeAlias = Callable[[Path], Detector]


class _UnconfiguredDetector:
    def detect(self, image_bytes: bytes) -> DetectionResult:
        return DetectionResult(DetectorStatus.MODEL_NOT_CONFIGURED)


def get_detector(
    weights_path: str | Path | None = None,
    loader: ModelLoader | None = None,
) -> Detector:
    """Build a detector only with an explicit existing path and compatible loader.

    No compatible weights or model loader are shipped with EDAS. Missing path,
    missing file, or missing loader fails closed as MODEL_NOT_CONFIGURED.
    """

    if weights_path is None or loader is None:
        return _UnconfiguredDetector()
    path = Path(weights_path)
    if not path.is_file():
        return _UnconfiguredDetector()
    return loader(path)
