"""Run real local RDD2022 inference on an image or video."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from .pipeline import process_video
from .road_damage import DEFAULT_CONFIDENCE, DEFAULT_IMAGE_SIZE, RoadDamageDetector

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def _memory_mb() -> float | None:
    try:
        import psutil
        import os

        return psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
    except ImportError:
        return None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m backend.vision",
        description="Run CPU-only EDAS road-damage inference on a local image or video.",
    )
    parser.add_argument("--source", required=True, type=Path, help="Local image or video path")
    parser.add_argument("--output-json", type=Path, help="Write result JSON here instead of stdout")
    parser.add_argument("--sample-fps", type=float, default=10.0, help="Video frame sampling target")
    parser.add_argument("--image-size", type=int, default=DEFAULT_IMAGE_SIZE, help="Model input size")
    parser.add_argument("--confidence", type=float, default=DEFAULT_CONFIDENCE, help="Detection threshold")
    parser.add_argument("--weights", type=Path, help="Local checkpoint; defaults to EDAS_VISION_MODEL_PATH or pinned weights")
    return parser


def run(source: Path, *, sample_fps: float, image_size: int, confidence: float,
        weights: Path | None) -> dict:
    if not source.is_file():
        raise FileNotFoundError(f"Input file does not exist: {source}")
    suffix = source.suffix.casefold()
    if suffix not in IMAGE_SUFFIXES | VIDEO_SUFFIXES:
        raise ValueError(f"Unsupported input extension: {suffix or '(none)'}")

    detector = RoadDamageDetector(weights, confidence, image_size)
    load_started = time.perf_counter()
    capability = detector.capability(load_model=True)
    load_ms = (time.perf_counter() - load_started) * 1000.0
    if capability.status != "ready":
        return {
            "status": capability.status,
            "model": capability.to_dict(),
            "source": str(source.resolve()),
            "events": [],
        }

    result = {
        "status": "completed",
        "model": capability.to_dict(),
        "model_load_ms": load_ms,
        "source": str(source.resolve()),
        "events": [],
    }
    if suffix in IMAGE_SUFFIXES:
        try:
            import cv2
        except ImportError as exc:
            raise RuntimeError("OpenCV is not installed") from exc
        image = cv2.imread(str(source), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("OpenCV could not decode the input image")
        height, width = image.shape[:2]
        inference_started = time.perf_counter()
        events = detector.detect_frame(image, 0, width, height)
        result["image"] = {
            "width": width,
            "height": height,
            "inference_ms": (time.perf_counter() - inference_started) * 1000.0,
        }
        result["events"] = [event.to_dict() for event in events]
        result["peak_rss_mb"] = _memory_mb()
        return result

    events = []
    summary = process_video(
        source,
        sample_fps=sample_fps,
        image_size=image_size,
        confidence=confidence,
        detector=detector,
        on_event=events.append,
    )
    result["video"] = summary.to_dict()
    result["events"] = [event.to_dict() for event in events]
    return result


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if not 0 < args.sample_fps <= 60:
            raise ValueError("sample-fps must be in (0, 60]")
        if not 0 <= args.confidence <= 1:
            raise ValueError("confidence must be between zero and one")
        if args.image_size < 32:
            raise ValueError("image-size must be at least 32 pixels")
        result = run(
            args.source,
            sample_fps=args.sample_fps,
            image_size=args.image_size,
            confidence=args.confidence,
            weights=args.weights,
        )
        encoded = json.dumps(result, indent=2, ensure_ascii=False)
        if args.output_json:
            args.output_json.parent.mkdir(parents=True, exist_ok=True)
            args.output_json.write_text(encoded + "\n", encoding="utf-8")
        else:
            print(encoded)
        return 0 if result["status"] == "completed" else 3
    except Exception as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
