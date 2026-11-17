"""Pure, deterministic road intelligence primitives for the EDAS API layer.

The backend owns persistence and transaction safety. These functions decide
how report/candidate values are classified; they do not access storage.
"""

from .confidence import compute_confidence, should_verify
from .detector import Detection, DetectionResult, DetectorStatus, get_detector
from .matching import (
    DEFAULT_MATCH_RADIUS_M,
    haversine_distance_m,
    is_duplicate_reporter,
    select_match,
)
from .models import HazardCandidate, MatchDecision, MatchDisposition, ReportLocation

__all__ = [
    "DEFAULT_MATCH_RADIUS_M", "Detection", "DetectionResult", "DetectorStatus",
    "HazardCandidate", "MatchDecision", "MatchDisposition", "ReportLocation",
    "compute_confidence", "get_detector", "haversine_distance_m",
    "is_duplicate_reporter", "select_match", "should_verify",
]
