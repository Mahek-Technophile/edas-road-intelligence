from datetime import datetime, timedelta, timezone
import math

import pytest

from backend.intelligence import (
    DetectorStatus,
    HazardCandidate,
    MatchDisposition,
    ReportLocation,
    compute_confidence,
    get_detector,
    haversine_distance_m,
    is_duplicate_reporter,
    select_match,
    should_verify,
)


def candidate(hazard_id, *, longitude=73.8567, status="reported", hazard_type="pothole"):
    return HazardCandidate(hazard_id, hazard_type, 18.5204, longitude, status)


def test_haversine_zero_known_distance_and_coordinate_validation():
    assert haversine_distance_m(18.5204, 73.8567, 18.5204, 73.8567) == 0
    assert haversine_distance_m(18.5204, 73.8567, 18.5204, 73.856827) == pytest.approx(12, abs=0.2)
    with pytest.raises(ValueError):
        haversine_distance_m(float("nan"), 0, 0, 0)


def test_match_requires_same_type_and_within_radius():
    report = ReportLocation("pothole", 18.5204, 73.8567)
    assert select_match(report, [candidate("far", longitude=73.86)]).disposition is MatchDisposition.NEW
    assert select_match(report, [candidate("other", hazard_type="obstruction")]).disposition is MatchDisposition.NEW


def test_active_candidate_precedes_repaired_and_ties_use_id():
    report = ReportLocation("pothole", 18.5204, 73.8567)
    result = select_match(report, [
        candidate("z-repaired", status="repaired"),
        candidate("b-active", longitude=73.85675, status="assigned"),
        candidate("a-active", longitude=73.85675, status="verified"),
    ])
    assert result.disposition is MatchDisposition.CONFIRMATION
    assert result.hazard_id == "a-active"


def test_repaired_only_candidate_is_a_challenge():
    result = select_match(ReportLocation("pothole", 18.5204, 73.8567), [candidate("done", status="repaired")])
    assert result.disposition is MatchDisposition.CHALLENGE
    assert result.hazard_id == "done"


def test_duplicate_helper_uses_subject_and_requires_nonempty_subject():
    assert is_duplicate_reporter("subject-a", ["subject-b", "subject-a"])
    assert not is_duplicate_reporter("subject-c", ["subject-a"])
    with pytest.raises(ValueError):
        is_duplicate_reporter("", [])


def test_confidence_formula_recency_and_verification_threshold():
    now = datetime(2026, 11, 17, 10, tzinfo=timezone.utc)
    assert compute_confidence(3, now, now, 0.5) == pytest.approx(0.7)
    stale = compute_confidence(3, now - timedelta(hours=72), now, 0.5)
    assert stale == pytest.approx(0.3 + 0.3 * math.exp(-1) + 0.1)
    assert should_verify(0.5)
    assert not should_verify(0.499)
    with pytest.raises(ValueError):
        compute_confidence(1, now.replace(tzinfo=None), now, 0.5)


def test_detector_reports_unconfigured_without_model_or_compatible_loader():
    result = get_detector().detect(b"opaque bytes")
    assert result.status is DetectorStatus.MODEL_NOT_CONFIGURED
    assert result.detections == ()


def test_detector_loader_is_only_called_for_existing_weights(tmp_path):
    path = tmp_path / "weights.bin"
    path.write_bytes(b"opaque")
    sentinel = object()
    assert get_detector(path, loader=lambda _path: sentinel) is sentinel
    assert get_detector(tmp_path / "missing.bin", loader=lambda _path: sentinel).detect(b"").status is DetectorStatus.MODEL_NOT_CONFIGURED
