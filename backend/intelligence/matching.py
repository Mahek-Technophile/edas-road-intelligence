"""PostGIS-independent deterministic matching rules.

The production report RPC should use the equivalent ST_DWithin query and
apply this same active-first, distance-then-ID tie-break. The RPC remains the
authoritative duplicate/concurrency guard.
"""

from __future__ import annotations

import math
from collections.abc import Collection, Sequence

from .models import HazardCandidate, MatchDecision, MatchDisposition, ReportLocation

DEFAULT_MATCH_RADIUS_M = 25.0
EARTH_MEAN_RADIUS_M = 6_371_008.8


def _validate_coordinates(latitude: float, longitude: float) -> None:
    if not math.isfinite(latitude) or not -90.0 <= latitude <= 90.0:
        raise ValueError("latitude must be finite and within [-90, 90]")
    if not math.isfinite(longitude) or not -180.0 <= longitude <= 180.0:
        raise ValueError("longitude must be finite and within [-180, 180]")


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in metres for WGS84 decimal degrees."""

    _validate_coordinates(lat1, lon1)
    _validate_coordinates(lat2, lon2)
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    hav = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    return 2.0 * EARTH_MEAN_RADIUS_M * math.asin(math.sqrt(min(1.0, max(0.0, hav))))


def select_match(
    report: ReportLocation,
    candidates: Sequence[HazardCandidate],
    radius_m: float = DEFAULT_MATCH_RADIUS_M,
) -> MatchDecision:
    """Choose same-type candidate according to API contract v2.

    Any status except repaired is an active candidate. Active candidates win
    over repaired candidates. Within each set selection is shortest distance,
    then lexicographically smallest hazard UUID. A repaired result is a
    challenge only when no active candidate matches.
    """

    _validate_coordinates(report.latitude, report.longitude)
    if not math.isfinite(radius_m) or radius_m <= 0:
        raise ValueError("radius_m must be finite and greater than zero")
    active: list[tuple[float, str]] = []
    repaired: list[tuple[float, str]] = []
    for candidate in candidates:
        if candidate.hazard_type != report.hazard_type:
            continue
        distance = haversine_distance_m(
            report.latitude, report.longitude, candidate.latitude, candidate.longitude
        )
        if distance > radius_m:
            continue
        pair = (distance, candidate.hazard_id)
        (repaired if candidate.status == "repaired" else active).append(pair)
    if active:
        distance, hazard_id = min(active)
        return MatchDecision(MatchDisposition.CONFIRMATION, hazard_id, distance)
    if repaired:
        distance, hazard_id = min(repaired)
        return MatchDecision(MatchDisposition.CHALLENGE, hazard_id, distance)
    return MatchDecision(MatchDisposition.NEW, None, None)


def is_duplicate_reporter(
    reporter_subject: str, existing_reporter_subjects: Collection[str]
) -> bool:
    """Return whether this stable JWT subject has already contributed.

    This is a pure helper, not a race guard; the reporting RPC must enforce
    uniqueness inside its transaction.
    """

    if not reporter_subject:
        raise ValueError("reporter_subject must be non-empty")
    return reporter_subject in existing_reporter_subjects
