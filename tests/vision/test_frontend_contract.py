from pathlib import Path

from app.main import app


ROOT = Path(__file__).resolve().parents[2]


def test_fastapi_app_mounts_vision_contract_routes():
    paths = {route.path for route in app.routes if hasattr(route, "path")}
    for route in app.routes:
        included = getattr(route, "original_router", None)
        if included is not None:
            paths.update(child.path for child in included.routes if hasattr(child, "path"))
    assert {
        "/api/v1/vision/models",
        "/api/v1/vision/jobs",
        "/api/v1/vision/jobs/{job_id}",
        "/api/v1/vision/jobs/{job_id}/events",
        "/api/v1/vision/jobs/{job_id}/stream",
        "/api/v1/vision/jobs/{job_id}/cancel",
    } <= paths


def test_vision_ui_uses_contract_routes_and_labels_unavailable_models():
    source = (ROOT / "frontend" / "src" / "pages" / "VisionLab.tsx").read_text(encoding="utf-8")

    assert "'/vision/models'" in source
    assert "`/vision/jobs/${encodeURIComponent(jobId)}/events?after=${after}&limit=500`" in source
    assert "`${API_BASE}/vision/jobs/${encodeURIComponent(job.job_id)}/stream`" in source
    assert "'MODEL_NOT_CONFIGURED'" in source
    assert "'Unavailable'" in source
    assert "the UI does not generate placeholder detections" in source
