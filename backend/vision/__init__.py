"""CPU-first video analysis for the EDAS Vision Lab."""

from .pipeline import get_model_capabilities, process_video
from .road_damage import RoadDamageDetector, get_road_damage_detector
from .schemas import DetectionEvent, ModelCapability, VideoProcessingSummary

__all__ = [
    "DetectionEvent",
    "ModelCapability",
    "RoadDamageDetector",
    "VideoProcessingSummary",
    "get_model_capabilities",
    "get_road_damage_detector",
    "process_video",
]
