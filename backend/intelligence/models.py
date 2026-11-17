"""Typed values shared by the intelligence engine and API adapter."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class MatchDisposition(str, Enum):
    """How a reporting transaction treats a new observation."""

    NEW = "new"
    CONFIRMATION = "confirmation"
    CHALLENGE = "challenge"


@dataclass(frozen=True, slots=True)
class ReportLocation:
    """Fields needed to match an incoming report."""

    hazard_type: str
    latitude: float
    longitude: float


@dataclass(frozen=True, slots=True)
class HazardCandidate:
    """Read-only candidate supplied by the caller; no DB object is required."""

    hazard_id: str
    hazard_type: str
    latitude: float
    longitude: float
    status: str


@dataclass(frozen=True, slots=True)
class MatchDecision:
    """Selected candidate; new decisions have no ID or distance."""

    disposition: MatchDisposition
    hazard_id: str | None
    distance_m: float | None
