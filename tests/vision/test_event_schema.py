from backend.vision.road_damage import _normalize_names
from dataclasses import fields

from backend.vision.schemas import DetectionEvent, ModelCapability


def test_checkpoint_class_mapping_uses_labels_not_assumed_order():
    names = {9: "Pothole", 2: "longitudinal_crack", 7: "D20", 3: "Transverse Crack"}

    assert _normalize_names(names) == {9: "D40", 2: "D00", 7: "D20", 3: "D10"}


def test_detection_event_schema_contains_original_frame_pixel_fields():
    assert [field.name for field in fields(DetectionEvent)] == [
        "event_id", "timestamp_ms", "model", "class_id", "class_name", "label",
        "confidence", "bbox", "track_id", "inference_ms",
    ]


def test_capability_schema_lists_device_and_unavailable_states():
    item = ModelCapability(
        capability="traffic_signs", model_name=None, version=None,
        supported_classes=(), device="cpu", status="MODEL_NOT_CONFIGURED",
        confidence_threshold=None, input_size=None, detail="No sign model configured.",
    )

    payload = item.to_dict()
    assert payload["device"] == "cpu"
    assert payload["status"] == "MODEL_NOT_CONFIGURED"
    assert payload["supported_classes"] == []
