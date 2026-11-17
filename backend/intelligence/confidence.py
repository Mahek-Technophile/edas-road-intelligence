"""Confidence heuristic from the EDAS master specification."""

from __future__ import annotations

import math
from datetime import datetime, timezone


def compute_confidence(
    independent_reporters: int,
    last_seen_at: datetime,
    now: datetime,
    evidence_quality: float,
) -> float:
    """Compute C = 0.5V + 0.3R + 0.2E and clamp the result to [0, 1].

    E is provided by the caller (0..1); this engine does not infer quality
    merely from file presence. For the MVP backend adapter assumption, E=1.0
    when a valid evidence object is attached, otherwise E=0.0. Change that
    mapping centrally if product calibration later specifies another rule.
    Timestamps must be timezone-aware. Future observations have zero age.
    """

    if isinstance(independent_reporters, bool) or not isinstance(independent_reporters, int) or independent_reporters < 0:
        raise ValueError("independent_reporters must be a non-negative integer")
    if not math.isfinite(evidence_quality) or not 0.0 <= evidence_quality <= 1.0:
        raise ValueError("evidence_quality must be finite and within [0, 1]")
    if last_seen_at.tzinfo is None or last_seen_at.utcoffset() is None:
        raise ValueError("last_seen_at must be timezone-aware")
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    age_hours = max(0.0, (now.astimezone(timezone.utc) - last_seen_at.astimezone(timezone.utc)).total_seconds() / 3600.0)
    reporter_factor = min(independent_reporters / 5.0, 1.0)
    recency_factor = math.exp(-age_hours / 72.0)
    score = 0.5 * reporter_factor + 0.3 * recency_factor + 0.2 * evidence_quality
    return min(1.0, max(0.0, score))


def should_verify(confidence_score: float, threshold: float = 0.50) -> bool:
    """Return whether a validated confidence score reaches the threshold."""

    if not math.isfinite(confidence_score) or not 0.0 <= confidence_score <= 1.0:
        raise ValueError("confidence_score must be finite and within [0, 1]")
    if not math.isfinite(threshold) or not 0.0 <= threshold <= 1.0:
        raise ValueError("threshold must be finite and within [0, 1]")
    return confidence_score >= threshold
