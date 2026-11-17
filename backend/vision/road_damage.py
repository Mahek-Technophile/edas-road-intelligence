"""RDD2022 YOLOv8s detector. The checkpoint is optional at runtime and ignored by Git."""

from __future__ import annotations

import hashlib
import importlib
import importlib.util
import os
import threading
import time
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from .schemas import BoundingBox, DetectionEvent, ModelCapability

MODEL_NAME = "road_damage_yolov8s_rdd2022"
MODEL_VERSION = "seed0"
EXPECTED_SHA256 = "565aae6915e34e4f7f4c44dac0bdcf9fff21b83c4adc74cc97ca09cc31882ce8"
DEFAULT_WEIGHTS = Path(__file__).parent / "models" / "pothole" / "road_damage_best.pt"
DEFAULT_CONFIDENCE = 0.10
DEFAULT_IMAGE_SIZE = 640

_CODE_LABELS = {
    "D00": "Longitudinal crack",
    "D10": "Transverse crack",
    "D20": "Alligator crack",
    "D40": "Pothole",
}
_NAME_ALIASES = {
    "d00": "D00", "longitudinal crack": "D00", "longitudinal_crack": "D00",
    "d10": "D10", "transverse crack": "D10", "transverse_crack": "D10",
    "d20": "D20", "alligator crack": "D20", "alligator/fatigue crack": "D20",
    "alligator_crack": "D20", "fatigue crack": "D20",
    "d40": "D40", "pothole": "D40",
}
_PINNED_CHECKPOINT_NAMES = {
    0: "longitudinal_crack",
    1: "transverse_crack",
    2: "alligator_crack",
    3: "pothole",
}


def _weight_path(path: str | Path | None) -> Path:
    if path is not None:
        return Path(path)
    configured = os.getenv("EDAS_VISION_MODEL_PATH") or os.getenv("EDAS_ROAD_DAMAGE_WEIGHTS")
    return Path(configured) if configured else DEFAULT_WEIGHTS


def _normalize_names(names) -> dict[int, str]:
    items = names.items() if isinstance(names, dict) else enumerate(names)
    result: dict[int, str] = {}
    for raw_id, raw_name in items:
        class_id = int(raw_id)
        name = str(raw_name).strip()
        code = _NAME_ALIASES.get(name.casefold())
        if code is None:
            raise ValueError(f"Checkpoint contains an unsupported road-damage class: {name!r}")
        result[class_id] = code
    if set(result.values()) != set(_CODE_LABELS):
        raise ValueError("Checkpoint class map must contain exactly D00, D10, D20, and D40")
    if len(result) != 4:
        raise ValueError("Checkpoint class map has duplicate or unexpected class IDs")
    return result


class RoadDamageDetector:
    """Lazy, CPU-only detector with explicit load failures and one-time model reuse."""

    def __init__(
        self,
        weights_path: str | Path | None = None,
        confidence: float = DEFAULT_CONFIDENCE,
        image_size: int = DEFAULT_IMAGE_SIZE,
        *,
        model_factory=None,
        verify_hash: bool = True,
    ) -> None:
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("confidence must be between zero and one")
        if image_size < 32:
            raise ValueError("image_size must be at least 32 pixels")
        self.weights_path = _weight_path(weights_path)
        self.confidence = confidence
        self.image_size = image_size
        self._model_factory = model_factory
        self._verify_hash = verify_hash
        self._model = None
        self._class_codes: dict[int, str] | None = None
        self._load_error: str | None = None
        self._lock = threading.Lock()

    @property
    def ready(self) -> bool:
        try:
            self._load()
            return True
        except Exception as exc:
            self._load_error = str(exc)
            return False

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def _load(self):
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            if not self.weights_path.is_file():
                raise FileNotFoundError(f"Road-damage checkpoint is missing: {self.weights_path}")
            if self._verify_hash and self.weights_path.resolve() == DEFAULT_WEIGHTS.resolve():
                digest = hashlib.sha256()
                with self.weights_path.open("rb") as checkpoint:
                    for chunk in iter(lambda: checkpoint.read(1024 * 1024), b""):
                        digest.update(chunk)
                if digest.hexdigest() != EXPECTED_SHA256:
                    raise ValueError("Road-damage checkpoint SHA-256 does not match the pinned artifact")
            if self._model_factory is None:
                try:
                    from ultralytics import YOLO
                    # Ultralytics loads the checkpoint before it imports
                    # torchvision; validate that runtime here so the worker
                    # does not mark a detector ready when first inference would
                    # fail. This performs no prediction and emits no events.
                    importlib.import_module("torchvision")
                except ImportError as exc:
                    raise RuntimeError(f"Ultralytics/PyTorch/torchvision runtime is unavailable: {exc}") from exc
                model = YOLO(str(self.weights_path), task="detect")
            else:
                model = self._model_factory(self.weights_path)
            names = getattr(model, "names", None)
            if names is None:
                raise ValueError("Checkpoint does not expose class names")
            class_codes = _normalize_names(names)
            if hasattr(model, "to"):
                model.to("cpu")
            self._class_codes = class_codes
            self._model = model
            return model

    def capability(self, *, load_model: bool = True) -> ModelCapability:
        """Describe the model; callers can avoid loading a second copy in API workers.

        Metadata-only mode checks the pinned artifact, its digest, and the
        inference package without deserializing the checkpoint. The worker
        performs the actual model load on first job and reports failures there.
        """
        if not load_model and self._model is None:
            if not self.weights_path.is_file():
                return ModelCapability(
                    capability="road_damage", model_name=MODEL_NAME, version=MODEL_VERSION,
                    supported_classes=tuple(_CODE_LABELS), device="cpu", status="MODEL_NOT_CONFIGURED",
                    confidence_threshold=self.confidence, input_size=self.image_size,
                    detail="RDD2022 road-damage checkpoint is not present.",
                )
            try:
                if self.weights_path.resolve() == DEFAULT_WEIGHTS.resolve():
                    digest = hashlib.sha256()
                    with self.weights_path.open("rb") as checkpoint:
                        for chunk in iter(lambda: checkpoint.read(1024 * 1024), b""):
                            digest.update(chunk)
                    if digest.hexdigest() != EXPECTED_SHA256:
                        raise ValueError("Pinned checkpoint SHA-256 does not match")
                    class_codes = _normalize_names(_PINNED_CHECKPOINT_NAMES)
                else:
                    return ModelCapability(
                        capability="road_damage", model_name=MODEL_NAME, version=MODEL_VERSION,
                        supported_classes=(), device="cpu", status="failed",
                        confidence_threshold=self.confidence, input_size=self.image_size,
                        detail="Custom checkpoint compatibility has not been verified.",
                    )
                if importlib.util.find_spec("ultralytics") is None or importlib.util.find_spec("torch") is None:
                    raise RuntimeError("Ultralytics and PyTorch dependencies are not installed")
            except Exception as exc:
                self._load_error = str(exc)
                return ModelCapability(
                    capability="road_damage", model_name=MODEL_NAME, version=MODEL_VERSION,
                    supported_classes=tuple(_CODE_LABELS), device="cpu", status="failed",
                    confidence_threshold=self.confidence, input_size=self.image_size,
                    detail=str(exc),
                )
            ordered_classes = tuple(class_codes[index] for index in sorted(class_codes))
            return ModelCapability(
                capability="road_damage", model_name=MODEL_NAME, version=MODEL_VERSION,
                supported_classes=ordered_classes, device="cpu", status="ready",
                confidence_threshold=self.confidence, input_size=self.image_size,
                detail="Checkpoint and dependencies are configured; the worker loads weights lazily on its first job.",
            )
        try:
            self._load()
        except Exception as exc:
            detail = str(exc)
            self._load_error = detail
            status = "MODEL_NOT_CONFIGURED" if isinstance(exc, FileNotFoundError) else "failed"
            return ModelCapability(
                capability="road_damage", model_name=MODEL_NAME, version=MODEL_VERSION,
                supported_classes=tuple(_CODE_LABELS), device="cpu", status=status,
                confidence_threshold=self.confidence, input_size=self.image_size,
                detail=detail,
            )
        return ModelCapability(
            capability="road_damage", model_name=MODEL_NAME, version=MODEL_VERSION,
            supported_classes=tuple(_CODE_LABELS), device="cpu", status="ready",
            confidence_threshold=self.confidence, input_size=self.image_size,
        )

    def detect_frame(
        self,
        frame_bgr,
        timestamp_ms: int,
        frame_width: int,
        frame_height: int,
    ) -> tuple[DetectionEvent, ...]:
        """Infer one original-size BGR frame; return real model detections only."""
        model = self._load()
        if frame_width <= 0 or frame_height <= 0 or frame_bgr is None:
            raise ValueError("A valid original-resolution frame is required")
        started = time.perf_counter()
        results = model.predict(
            source=frame_bgr,
            imgsz=self.image_size,
            conf=self.confidence,
            device="cpu",
            verbose=False,
            save=False,
        )
        inference_ms = (time.perf_counter() - started) * 1000.0
        if not results:
            return ()
        result = results[0]
        boxes = getattr(result, "boxes", None)
        if boxes is None or len(boxes) == 0:
            return ()
        events: list[DetectionEvent] = []
        for box in boxes:
            class_id = int(box.cls.reshape(-1)[0].item())
            class_code = self._class_codes[class_id]
            confidence = float(box.conf.reshape(-1)[0].item())
            xyxy = box.xyxy.reshape(-1, 4)[0].tolist()
            x1, y1, x2, y2 = (float(value) for value in xyxy)
            # Ultralytics maps xyxy back to source dimensions. Clamp defensively
            # to avoid rounding outside the original 1080p frame.
            bbox = BoundingBox(
                x1=max(0.0, min(x1, float(frame_width))),
                y1=max(0.0, min(y1, float(frame_height))),
                x2=max(0.0, min(x2, float(frame_width))),
                y2=max(0.0, min(y2, float(frame_height))),
            )
            events.append(DetectionEvent(
                event_id=str(uuid4()), timestamp_ms=max(0, int(timestamp_ms)),
                model=MODEL_NAME, class_id=class_id, class_name=class_code,
                label=_CODE_LABELS[class_code], confidence=max(0.0, min(1.0, confidence)),
                bbox=bbox, track_id=None, inference_ms=inference_ms,
            ))
        return tuple(events)


@lru_cache(maxsize=4)
def get_road_damage_detector(
    weights_path: str | None = None,
    confidence: float = DEFAULT_CONFIDENCE,
    image_size: int = DEFAULT_IMAGE_SIZE,
) -> RoadDamageDetector:
    """Return one lazily loaded detector instance per worker configuration."""
    return RoadDamageDetector(weights_path, confidence, image_size)
