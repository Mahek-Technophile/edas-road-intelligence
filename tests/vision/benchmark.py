"""Real-model road-damage benchmark; never substitutes or fabricates events."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import statistics
import threading
import time
from pathlib import Path


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))
    return ordered[index]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, required=True, help="Short local MP4 video to process")
    parser.add_argument("--image", type=Path, help="Optional actual road image for independent inference")
    parser.add_argument("--sample-fps", type=float, default=10.0)
    parser.add_argument("--image-size", type=int, default=640)
    parser.add_argument("--confidence", type=float, default=0.10)
    args = parser.parse_args()

    if not args.video.is_file():
        parser.error(f"video file does not exist: {args.video}")
    if args.image is not None and not args.image.is_file():
        parser.error(f"image file does not exist: {args.image}")

    try:
        import cv2
        import psutil
        import torch
        import ultralytics

        from backend.vision.frame_extractor import iter_sampled_frames
        from backend.vision.pipeline import process_video
        from backend.vision.road_damage import DEFAULT_WEIGHTS, RoadDamageDetector
    except ImportError as exc:
        raise SystemExit(f"Vision benchmark dependency is missing: {exc}") from exc

    detector = RoadDamageDetector(
        confidence=args.confidence,
        image_size=args.image_size,
    )
    capability = detector.capability(load_model=True)
    if capability.status != "ready":
        raise SystemExit(f"Road-damage model is unavailable: {capability.detail}")
    if torch.cuda.is_available():
        raise SystemExit("This benchmark requires CPU-only inference; CUDA is available in this runtime.")

    checkpoint_hash = hashlib.sha256(DEFAULT_WEIGHTS.read_bytes()).hexdigest()
    process = psutil.Process()
    system = {
        "processor": platform.processor() or None,
        "logical_cpu_count": psutil.cpu_count(logical=True),
        "physical_cpu_count": psutil.cpu_count(logical=False),
        "ram_total_gib": round(psutil.virtual_memory().total / (1024**3), 2),
    }

    # Explicit warm-up keeps model deserialization and initial kernel setup out
    # of the reported steady-state video processing time.
    warm_capture = cv2.VideoCapture(str(args.video))
    try:
        if not warm_capture.isOpened():
            raise SystemExit("OpenCV could not open the MP4 video.")
        ok, warm_frame = warm_capture.read()
        if not ok or warm_frame is None:
            raise SystemExit("The MP4 video has no decodable frames.")
        height, width = warm_frame.shape[:2]
        warm_started = time.perf_counter()
        detector.detect_frame(warm_frame, 0, width, height)
        warmup_ms = (time.perf_counter() - warm_started) * 1000
    finally:
        warm_capture.release()

    # Decoder-only pass: the iterator decodes the full source and emits only
    # configured sample frames. This measures decode throughput independently.
    decode_started = time.perf_counter()
    info, sampled_frames = iter_sampled_frames(args.video, args.sample_fps, cv2_module=cv2)
    try:
        decoded_sample_count = sum(1 for _ in sampled_frames)
    finally:
        close = getattr(sampled_frames, "close", None)
        if close is not None:
            close()
    decode_elapsed_s = max(time.perf_counter() - decode_started, 1e-9)
    decode_fps = info.frame_count / decode_elapsed_s if info.frame_count else None

    latencies: list[float] = []

    class TimedDetector:
        ready = True
        load_error = None

        def detect_frame(self, frame_bgr, timestamp_ms, frame_width, frame_height):
            started = time.perf_counter()
            events = detector.detect_frame(frame_bgr, timestamp_ms, frame_width, frame_height)
            latencies.append((time.perf_counter() - started) * 1000)
            return events

    events_seen = 0
    first_event_job_ms: float | None = None
    job_started = time.perf_counter()
    peak_rss_bytes = [process.memory_info().rss]
    stop_rss_sampling = threading.Event()

    def sample_rss() -> None:
        while not stop_rss_sampling.wait(0.05):
            peak_rss_bytes[0] = max(peak_rss_bytes[0], process.memory_info().rss)

    rss_thread = threading.Thread(target=sample_rss, name="edas-vision-rss", daemon=True)
    rss_thread.start()

    def collect(event) -> None:
        nonlocal events_seen, first_event_job_ms
        events_seen += 1
        if first_event_job_ms is None:
            first_event_job_ms = (time.perf_counter() - job_started) * 1000

    try:
        summary = process_video(
            args.video,
            sample_fps=args.sample_fps,
            image_size=args.image_size,
            confidence=args.confidence,
            on_event=collect,
            detector=TimedDetector(),
        )
    finally:
        stop_rss_sampling.set()
        rss_thread.join()
    duration_seconds = summary.duration_ms / 1000
    processing_seconds_per_video_minute = (
        summary.elapsed_ms / 1000 / duration_seconds * 60 if duration_seconds else None
    )

    result = {
        "model": {
            "name": capability.model_name,
            "version": capability.version,
            "classes": list(capability.supported_classes),
            "device": "cpu",
            "confidence": args.confidence,
            "image_size": args.image_size,
            "checkpoint_sha256": checkpoint_hash,
            "ultralytics_version": ultralytics.__version__,
            "torch_version": torch.__version__,
            "opencv_version": cv2.__version__,
        },
        "system": system,
        "video": {
            "path": str(args.video.resolve()),
            "width": summary.width,
            "height": summary.height,
            "duration_ms": summary.duration_ms,
            "source_fps": summary.source_fps,
            "decoded_frames": summary.decoded_frames,
            "sampled_frames": summary.sampled_frames,
            "decoder_only_fps": round(decode_fps, 3) if decode_fps else None,
            "sampled_frames_decoder_pass": decoded_sample_count,
            "target_sample_fps": args.sample_fps,
            "actual_sample_fps": round(summary.actual_sample_fps, 3),
            "combined_processing_fps": round(summary.decoded_frames / (summary.elapsed_ms / 1000), 3)
            if summary.elapsed_ms > 0 else None,
            "processing_elapsed_ms": round(summary.elapsed_ms, 2),
            "processing_seconds_per_video_minute": round(processing_seconds_per_video_minute, 3)
            if processing_seconds_per_video_minute is not None else None,
            "warmup_inference_ms": round(warmup_ms, 2),
            "per_frame_inference_ms": {
                "count": len(latencies),
                "mean": round(statistics.fmean(latencies), 2) if latencies else None,
                "p50": round(percentile(latencies, 0.50), 2) if latencies else None,
                "p95": round(percentile(latencies, 0.95), 2) if latencies else None,
            },
            "model_inference_fps": round(len(latencies) / (sum(latencies) / 1000), 3)
            if latencies and sum(latencies) > 0 else None,
            "actual_detection_events": events_seen,
            "first_event_from_job_start_ms": round(first_event_job_ms, 2)
            if first_event_job_ms is not None else None,
            "peak_rss_mb_sampled": round(max(peak_rss_bytes[0], process.memory_info().rss) / (1024**2), 2),
            "rss_after_job_mb": round(process.memory_info().rss / (1024**2), 2),
        },
        "event_transport_latency_ms": None,
        "event_transport_note": "Not measured by local pipeline benchmark; run against a disposable API/SSE stack to measure delivery latency.",
    }

    if args.image is not None:
        image = cv2.imread(str(args.image), cv2.IMREAD_COLOR)
        if image is None:
            raise SystemExit(f"OpenCV could not decode image: {args.image}")
        image_height, image_width = image.shape[:2]
        image_events = detector.detect_frame(image, 0, image_width, image_height)
        result["image"] = {
            "path": str(args.image.resolve()),
            "width": image_width,
            "height": image_height,
            "actual_detection_events": [event.to_dict() for event in image_events],
        }

    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
