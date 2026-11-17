from __future__ import annotations

from dataclasses import dataclass

import pytest

from backend.vision.frame_extractor import iter_sampled_frames
from backend.vision.pipeline import get_model_capabilities, process_video
from backend.vision.road_damage import RoadDamageDetector


class FakeCapture:
    def __init__(self, frame_count: int, fps: float = 25.0, width: int = 1920, height: int = 1080):
        self.frames = [object() for _ in range(frame_count)]
        self.fps = fps
        self.width = width
        self.height = height
        self.index = -1
        self.released = False

    def isOpened(self):
        return True

    def get(self, prop):
        if prop == FakeCV2.CAP_PROP_FRAME_WIDTH:
            return self.width
        if prop == FakeCV2.CAP_PROP_FRAME_HEIGHT:
            return self.height
        if prop == FakeCV2.CAP_PROP_FPS:
            return self.fps
        if prop == FakeCV2.CAP_PROP_FRAME_COUNT:
            return len(self.frames)
        if prop == FakeCV2.CAP_PROP_POS_MSEC:
            return max(0, self.index) * 1000 / self.fps
        return 0

    def read(self):
        self.index += 1
        if self.index >= len(self.frames):
            return False, None
        return True, self.frames[self.index]

    def release(self):
        self.released = True


class FakeCV2:
    CAP_PROP_FRAME_WIDTH = 3
    CAP_PROP_FRAME_HEIGHT = 4
    CAP_PROP_FPS = 5
    CAP_PROP_FRAME_COUNT = 7
    CAP_PROP_POS_MSEC = 0

    def __init__(self, capture: FakeCapture):
        self.capture = capture

    def VideoCapture(self, _path):
        return self.capture


@dataclass
class FakeInfo:
    width: int = 1920
    height: int = 1080
    duration_ms: int = 1000
    source_fps: float = 25.0
    frame_count: int = 25


class FakeDetector:
    ready = True
    load_error = None

    def __init__(self):
        self.frames = []

    def detect_frame(self, frame, timestamp_ms, frame_width, frame_height):
        self.frames.append((frame, timestamp_ms, frame_width, frame_height))
        return ()


def test_sampling_is_timestamp_based_and_releases_capture(tmp_path):
    capture = FakeCapture(frame_count=12)
    info, frames = iter_sampled_frames(tmp_path / "unused.mp4", sample_fps=10, cv2_module=FakeCV2(capture))

    samples = list(frames)

    assert (info.width, info.height, info.frame_count) == (1920, 1080, 12)
    assert [sample.frame_index for sample in samples] == [0, 3, 5, 8, 10]
    assert [sample.timestamp_ms for sample in samples] == [0, 120, 200, 320, 400]
    assert capture.released


def test_pipeline_reports_source_resolution_progress_and_only_detector_events(monkeypatch, tmp_path):
    samples = [
        type("Sample", (), {"frame_index": i * 2, "timestamp_ms": i * 200, "frame_bgr": object()})()
        for i in range(3)
    ]
    monkeypatch.setattr(
        "backend.vision.pipeline.iter_sampled_frames",
        lambda *_args, **_kwargs: (FakeInfo(), iter(samples)),
    )
    detector = FakeDetector()
    output = []
    progress = []

    summary = process_video(
        tmp_path / "unused.mp4", detector=detector, sample_fps=5,
        on_event=output.append, on_progress=lambda *args: progress.append(args),
    )

    assert (summary.width, summary.height) == (1920, 1080)
    assert summary.sampled_frames == 3
    assert summary.decoded_frames == 25
    assert summary.event_count == len(output) == 0
    assert progress[-1][1:] == (4, 25)
    assert all(frame[2:] == (1920, 1080) for frame in detector.frames)


def test_pipeline_honors_cancel_before_inference(monkeypatch, tmp_path):
    samples = iter([type("Sample", (), {"frame_index": 0, "timestamp_ms": 0, "frame_bgr": object()})()])
    monkeypatch.setattr(
        "backend.vision.pipeline.iter_sampled_frames",
        lambda *_args, **_kwargs: (FakeInfo(), samples),
    )
    detector = FakeDetector()

    with pytest.raises(InterruptedError, match="cancelled"):
        process_video(tmp_path / "unused.mp4", detector=detector, should_cancel=lambda: True)

    assert detector.frames == []


def test_missing_checkpoint_and_other_capabilities_are_explicitly_unavailable(tmp_path):
    detector = RoadDamageDetector(weights_path=tmp_path / "not-present.pt")

    capability = detector.capability(load_model=True)
    all_capabilities = get_model_capabilities(detector, load_detector=True)

    assert capability.status == "MODEL_NOT_CONFIGURED"
    assert capability.detail
    assert [item.capability for item in all_capabilities] == [
        "vehicles_pedestrians", "traffic_signs", "road_damage", "obstructions", "lanes"
    ]
    assert all(item.status == "MODEL_NOT_CONFIGURED" for item in all_capabilities)


def test_invalid_checkpoint_classes_are_reported_as_failed(tmp_path):
    weights = tmp_path / "invalid-classes.pt"
    weights.write_bytes(b"test placeholder; never loaded as weights")

    class InvalidClassModel:
        names = {0: "car"}

    detector = RoadDamageDetector(
        weights_path=weights, model_factory=lambda _path: InvalidClassModel(), verify_hash=False
    )

    capability = detector.capability(load_model=True)

    assert capability.status == "failed"
    assert "unsupported road-damage class" in capability.detail


def test_synthetic_1080p_mp4_generator(tmp_path):
    """Generate a tiny codec-dependent fixture; never commit a binary video."""
    cv2 = pytest.importorskip("cv2")
    import numpy as np

    path = tmp_path / "synthetic-road-1080p.mp4"
    writer = cv2.VideoWriter(
        str(path), cv2.VideoWriter_fourcc(*"mp4v"), 10.0, (1920, 1080)
    )
    if not writer.isOpened():
        pytest.skip("OpenCV MP4V encoder is unavailable on this machine")
    try:
        frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
        frame[:, :] = (64, 80, 90)
        for _ in range(5):
            writer.write(frame)
    finally:
        writer.release()

    cap = cv2.VideoCapture(str(path))
    try:
        assert cap.isOpened()
        assert int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) == 1920
        assert int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) == 1080
        assert int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) == 5
    finally:
        cap.release()
