"""OpenCV frame sampling that preserves source timestamps and resolution."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


class VideoDecodeError(RuntimeError):
    """Raised when OpenCV cannot open or decode a video stream."""


@dataclass(frozen=True, slots=True)
class VideoInfo:
    width: int
    height: int
    duration_ms: int
    source_fps: float
    frame_count: int


@dataclass(frozen=True, slots=True)
class FrameSample:
    frame_index: int
    timestamp_ms: int
    frame_bgr: object


def iter_sampled_frames(
    video_path: str | Path,
    sample_fps: float = 10.0,
    *,
    cv2_module=None,
) -> tuple[VideoInfo, Iterator[FrameSample]]:
    """Open a video and return metadata plus a timestamp-based sampled iterator.

    Frames remain at their decoded dimensions. The model may resize internally;
    emitted box coordinates are expected to map back to this original frame.
    The caller must exhaust the iterator or call its ``close`` method so the
    capture handle is released.
    """
    if sample_fps <= 0:
        raise ValueError("sample_fps must be greater than zero")
    if cv2_module is None:
        try:
            import cv2 as cv2_module
        except ImportError as exc:
            raise VideoDecodeError("OpenCV is not installed") from exc

    capture = cv2_module.VideoCapture(str(video_path))
    if not capture.isOpened():
        capture.release()
        raise VideoDecodeError("The uploaded file could not be opened as a video")

    width = int(capture.get(cv2_module.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2_module.CAP_PROP_FRAME_HEIGHT))
    source_fps = float(capture.get(cv2_module.CAP_PROP_FPS) or 0.0)
    frame_count = int(capture.get(cv2_module.CAP_PROP_FRAME_COUNT) or 0)
    duration_ms = round(frame_count * 1000 / source_fps) if source_fps > 0 else 0
    if width < 1 or height < 1:
        capture.release()
        raise VideoDecodeError("The video does not contain valid frame dimensions")

    info = VideoInfo(width, height, duration_ms, source_fps, frame_count)

    def samples() -> Iterator[FrameSample]:
        frame_index = 0
        next_sample_ms = 0.0
        interval_ms = 1000.0 / sample_fps
        try:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                raw_timestamp = float(capture.get(cv2_module.CAP_PROP_POS_MSEC) or 0.0)
                if raw_timestamp > 0 or frame_index == 0:
                    timestamp_ms = round(raw_timestamp)
                elif source_fps > 0:
                    timestamp_ms = round(frame_index * 1000 / source_fps)
                else:
                    timestamp_ms = round(frame_index * interval_ms)
                if timestamp_ms + 0.5 >= next_sample_ms:
                    yield FrameSample(frame_index, timestamp_ms, frame)
                    while next_sample_ms <= timestamp_ms:
                        next_sample_ms += interval_ms
                frame_index += 1
        finally:
            capture.release()

    return info, samples()
