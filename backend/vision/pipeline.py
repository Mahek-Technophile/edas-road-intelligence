"""Video decode, sampled road-damage inference, and progress callbacks."""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Callable

from .frame_extractor import VideoDecodeError, iter_sampled_frames
from .road_damage import DEFAULT_CONFIDENCE, DEFAULT_IMAGE_SIZE, RoadDamageDetector, get_road_damage_detector
from .schemas import DetectionEvent, ModelCapability, VideoProcessingSummary


def get_model_capabilities(
    detector: RoadDamageDetector | None = None,
    *,
    load_detector: bool = False,
) -> list[ModelCapability]:
    """Report each capability independently; unimplemented models stay unavailable.

    The API should keep ``load_detector`` false so weights are loaded only in
    the processing worker. Use true for an explicit local model-load check.
    """
    road_damage = (detector or get_road_damage_detector()).capability(load_model=load_detector)
    unavailable = (
        ModelCapability("vehicles_pedestrians", None, None, (), "cpu", "MODEL_NOT_CONFIGURED", None, None,
                        "No vehicle/pedestrian model weights are configured."),
        ModelCapability("traffic_signs", None, None, (), "cpu", "MODEL_NOT_CONFIGURED", None, None,
                        "No traffic-sign model weights are configured."),
        ModelCapability("obstructions", None, None, (), "cpu", "MODEL_NOT_CONFIGURED", None, None,
                        "No road-obstruction model is configured."),
        ModelCapability("lanes", None, None, (), "cpu", "MODEL_NOT_CONFIGURED", None, None,
                        "No lane-segmentation model is configured."),
    )
    return [unavailable[0], unavailable[1], road_damage, unavailable[2], unavailable[3]]


def _peak_rss_mb() -> float | None:
    try:
        import psutil
        return psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
    except ImportError:
        return None


def process_video(
    video_path: str | Path,
    *,
    sample_fps: float = 10.0,
    image_size: int = DEFAULT_IMAGE_SIZE,
    confidence: float = DEFAULT_CONFIDENCE,
    on_event: Callable[[DetectionEvent], None] | None = None,
    on_progress: Callable[[float, int, int], None] | None = None,
    should_cancel: Callable[[], bool] | None = None,
    detector: RoadDamageDetector | None = None,
) -> VideoProcessingSummary:
    """Analyze video frames on CPU without altering the source video.

    ``on_progress`` receives percent complete, source frame index and estimated
    source frame count. ``on_event`` receives only model-produced event objects.
    ``should_cancel`` is polled between decoded frames.
    """
    if sample_fps <= 0:
        raise ValueError("sample_fps must be greater than zero")
    active_detector = detector or get_road_damage_detector(confidence=confidence, image_size=image_size)
    if not active_detector.ready:
        raise RuntimeError(active_detector.load_error or "Road-damage model is unavailable")

    info, frames = iter_sampled_frames(video_path, sample_fps)
    started = time.perf_counter()
    inference_total = 0.0
    frame_inference_count = 0
    decoded = 0
    sampled = 0
    event_count = 0
    last_frame_index = -1
    peak_rss = _peak_rss_mb()
    try:
        for sample in frames:
            if should_cancel is not None and should_cancel():
                raise InterruptedError("Vision job was cancelled")
            decoded = sample.frame_index + 1
            last_frame_index = sample.frame_index
            sampled += 1
            inference_started = time.perf_counter()
            events = active_detector.detect_frame(sample.frame_bgr, sample.timestamp_ms, info.width, info.height)
            inference_total += (time.perf_counter() - inference_started) * 1000.0
            frame_inference_count += 1
            current_rss = _peak_rss_mb()
            if current_rss is not None:
                peak_rss = max(peak_rss or 0.0, current_rss)
            event_count += len(events)
            if on_event is not None:
                for event in events:
                    on_event(event)
            if on_progress is not None:
                total = info.frame_count
                percent = min(99.0, (sample.timestamp_ms / info.duration_ms * 100.0)) if info.duration_ms else 0.0
                on_progress(percent, sample.frame_index, total)
    finally:
        close = getattr(frames, "close", None)
        if close is not None:
            close()
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    if info.frame_count:
        decoded = info.frame_count
    elif info.source_fps > 0 and last_frame_index >= 0:
        decoded = last_frame_index + 1
    duration_ms = info.duration_ms
    if duration_ms == 0 and info.source_fps > 0 and last_frame_index >= 0:
        duration_ms = round((last_frame_index + 1) * 1000 / info.source_fps)
    return VideoProcessingSummary(
        width=info.width,
        height=info.height,
        duration_ms=duration_ms,
        source_fps=info.source_fps,
        decoded_frames=decoded,
        sampled_frames=sampled,
        event_count=event_count,
        elapsed_ms=elapsed_ms,
        average_inference_ms=inference_total / frame_inference_count if frame_inference_count else 0.0,
        actual_sample_fps=sampled / (duration_ms / 1000.0) if duration_ms else 0.0,
        peak_rss_mb=peak_rss,
    )
