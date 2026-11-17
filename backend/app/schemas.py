from __future__ import annotations

from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HazardType(str, Enum):
    pothole = "pothole"
    road_damage = "road_damage"
    open_manhole = "open_manhole"
    waterlogging = "waterlogging"
    obstruction = "obstruction"


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class HazardStatus(str, Enum):
    reported = "reported"
    verified = "verified"
    assigned = "assigned"
    repaired = "repaired"


class ReportSource(str, Enum):
    manual = "manual"
    ai = "ai"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HazardReport(StrictModel):
    hazard_type: HazardType
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    severity: Severity
    description: str | None = Field(default=None, max_length=1000)
    evidence_id: UUID | None = None
    source: ReportSource = ReportSource.manual


class UploadUrlRequest(StrictModel):
    content_type: str
    size_bytes: int = Field(ge=1)


class StatusUpdate(StrictModel):
    status: HazardStatus
    reason: str | None = Field(default=None, max_length=1000)


class ChallengeUpdate(StrictModel):
    status: Literal["accepted", "rejected"]
    resolution_note: str | None = Field(default=None, max_length=1000)
