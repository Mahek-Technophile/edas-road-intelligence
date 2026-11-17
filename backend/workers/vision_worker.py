"""PostgREST-backed Vision Lab worker; no database driver or Redis required.

Run with ``python -m backend.workers.vision_worker`` from the repository root.
All database access uses service-role-only RPCs; the key stays in this process.
Private videos are retained for 30 days and event rows for 365 days by default.
Only terminal jobs are eligible. Job status, summary and safe error text remain.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import tempfile
import time
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from backend.app.core.config import settings
from backend.vision.pipeline import process_video
from backend.vision.road_damage import (
    DEFAULT_IMAGE_SIZE,
    EXPECTED_SHA256,
    MODEL_NAME,
    MODEL_VERSION,
    RoadDamageDetector,
)


LOGGER = logging.getLogger("edas.vision_worker")
POLL_SECONDS = max(0.2, float(os.getenv("EDAS_VISION_WORKER_POLL_SECONDS", "1")))
VIDEO_BUCKET = os.getenv("EDAS_VISION_STORAGE_BUCKET", "vision-videos")
SAMPLE_FPS = float(os.getenv("EDAS_VISION_SAMPLE_FPS", "10"))
IMAGE_SIZE = int(os.getenv("EDAS_VISION_IMAGE_SIZE", "640"))
CONFIDENCE = float(os.getenv("EDAS_VISION_CONFIDENCE", "0.10"))
CHUNK_SIZE = 1024 * 1024
VIDEO_RETENTION_DAYS = max(1, int(os.getenv("EDAS_VISION_VIDEO_RETENTION_DAYS", "30")))
EVENT_RETENTION_DAYS = max(1, int(os.getenv("EDAS_VISION_EVENT_RETENTION_DAYS", "365")))
CLEANUP_INTERVAL_SECONDS = max(60, int(os.getenv("EDAS_VISION_CLEANUP_INTERVAL_SECONDS", "3600")))
HEARTBEAT_INTERVAL_SECONDS = max(10, int(os.getenv("EDAS_VISION_HEARTBEAT_INTERVAL_SECONDS", "20")))


def _service_config() -> tuple[str, str]:
    try:
        return settings.require_storage()
    except RuntimeError as exc:
        raise RuntimeError("Supabase server configuration is incomplete.") from exc


def _rest(method: str, endpoint: str, *, params: dict[str, str] | None = None,
          payload: dict[str, Any] | None = None, prefer: str | None = None) -> Any:
    base, key = _service_config()
    headers = {
        "apikey": key, "authorization": f"Bearer {key}",
        "accept-profile": "public", "content-profile": "public",
    }
    if payload is not None:
        headers["content-type"] = "application/json"
    if prefer:
        headers["prefer"] = prefer
    with httpx.Client(timeout=30) as client:
        response = client.request(method, f"{base}/rest/v1/{endpoint.lstrip('/')}",
                                  headers=headers, params=params, json=payload)
    response.raise_for_status()
    return response.json() if response.content else None


def _rpc(name: str, payload: dict[str, Any] | None = None) -> Any:
    return _rest("POST", f"rpc/{name}", payload=payload or {})


def _event_dict(event: Any) -> dict[str, Any]:
    if hasattr(event, "to_dict"):
        return event.to_dict()
    if hasattr(event, "model_dump"):
        return event.model_dump()
    if is_dataclass(event):
        return asdict(event)
    if isinstance(event, dict):
        return event
    return vars(event)


def _download_video(job: dict[str, Any], destination: Path) -> None:
    base, key = _service_config()
    bucket = quote(job["video_bucket"], safe="")
    path = quote(job["video_path"], safe="/")
    url = f"{base}/storage/v1/object/{bucket}/{path}"
    headers = {"apikey": key, "authorization": f"Bearer {key}"}
    digest = hashlib.sha256()
    size = 0
    with httpx.Client(timeout=httpx.Timeout(120, connect=15)) as client:
        with client.stream("GET", url, headers=headers) as response:
            response.raise_for_status()
            with destination.open("wb") as target:
                for chunk in response.iter_bytes(CHUNK_SIZE):
                    size += len(chunk)
                    if size > job["video_size_bytes"]:
                        raise ValueError("Stored video size exceeds its metadata.")
                    digest.update(chunk)
                    target.write(chunk)
    if size != job["video_size_bytes"] or digest.hexdigest() != job["video_sha256"]:
        raise ValueError("Stored video failed its integrity check.")


def _delete_video_object(bucket: str, object_path: str) -> bool:
    base, key = _service_config()
    url = f"{base}/storage/v1/object/{quote(bucket, safe='')}/{quote(object_path, safe='/')}"
    response = httpx.delete(url, headers={"apikey": key, "authorization": f"Bearer {key}"}, timeout=20)
    if response.status_code in {200, 204, 404}:
        return True
    response.raise_for_status()
    return False


def _cleanup_retention() -> None:
    """Remove expired private bytes/events while retaining job audit metadata."""
    older_video = (datetime.now(timezone.utc).timestamp() - VIDEO_RETENTION_DAYS * 86400)
    video_cutoff = datetime.fromtimestamp(older_video, timezone.utc).isoformat()
    videos = _rest("GET", "vision_jobs", params={
        "select": "id,video_bucket,video_path", "video_deleted_at": "is.null",
        "status": "in.(completed,failed,cancelled)", "created_at": f"lt.{video_cutoff}",
        "order": "created_at.asc", "limit": "100",
    }) or []
    for job in videos:
        try:
            if _delete_video_object(job["video_bucket"], job["video_path"]):
                _rest("PATCH", "vision_jobs", params={"id": f"eq.{job['id']}", "video_deleted_at": "is.null"},
                      payload={"video_deleted_at": datetime.now(timezone.utc).isoformat(),
                               "updated_at": datetime.now(timezone.utc).isoformat()}, prefer="return=minimal")
        except (httpx.HTTPError, RuntimeError):
            LOGGER.warning("Video retention cleanup deferred for job %s", job["id"])

    event_cutoff = datetime.fromtimestamp(
        datetime.now(timezone.utc).timestamp() - EVENT_RETENTION_DAYS * 86400, timezone.utc
    ).isoformat()
    expired = _rest("GET", "vision_jobs", params={
        "select": "id", "events_deleted_at": "is.null",
        "status": "in.(completed,failed,cancelled)", "created_at": f"lt.{event_cutoff}",
        "order": "created_at.asc", "limit": "100",
    }) or []
    for job in expired:
        _rest("DELETE", "vision_detections", params={"job_id": f"eq.{job['id']}"}, prefer="return=minimal")
        _rest("PATCH", "vision_jobs", params={"id": f"eq.{job['id']}", "events_deleted_at": "is.null"},
              payload={"events_deleted_at": datetime.now(timezone.utc).isoformat(),
                       "updated_at": datetime.now(timezone.utc).isoformat()}, prefer="return=minimal")


def _register_model(detector: RoadDamageDetector) -> str:
    capability = detector.capability()
    status = capability.status
    detail = None if status == "ready" else "Road-damage model is not ready on the Vision worker. Inspect worker logs."
    config = {
        "device": "cpu", "confidence_threshold": capability.confidence_threshold,
        "input_size": capability.input_size or DEFAULT_IMAGE_SIZE,
        "supported_classes": list(capability.supported_classes),
    }
    _rest("POST", "vision_model_versions", params={"on_conflict": "model_name,version,weights_hash"},
          payload={"model_name": MODEL_NAME, "version": MODEL_VERSION,
                   "weights_hash": EXPECTED_SHA256, "configuration": config,
                   "licence": "CC BY 4.0", "enabled": status == "ready", "status": status,
                   "detail": detail, "last_checked_at": datetime.now(timezone.utc).isoformat()},
          prefer="resolution=merge-duplicates,return=minimal")
    return status


def _claim_job() -> dict[str, Any] | None:
    return _rpc("edas_vision_claim_job")


def _is_cancelled(job_id: Any) -> bool:
    return bool(_rpc("edas_vision_is_cancelled", {"p_id": str(job_id)}))


def _save_detection(job_id: Any, event: Any) -> None:
    item = _event_dict(event)
    bbox = item["bbox"]
    if hasattr(bbox, "model_dump"):
        bbox = bbox.model_dump()
    elif is_dataclass(bbox):
        bbox = asdict(bbox)
    _rpc("edas_vision_save_detection", {
        "p_job_id": str(job_id), "p_event_id": str(item.get("event_id")),
        "p_timestamp_ms": int(item["timestamp_ms"]), "p_model_name": str(item["model"]),
        "p_class_id": int(item["class_id"]), "p_class_name": str(item["class_name"]),
        "p_label": str(item["label"]), "p_confidence": float(item["confidence"]),
        "p_bbox": bbox, "p_track_id": item.get("track_id"),
        "p_inference_ms": float(item.get("inference_ms", 0)),
    })


def _progress(job_id: Any, percent: float, source_frame_index: int) -> None:
    _rpc("edas_vision_update_progress", {
        "p_id": str(job_id), "p_progress": min(99.0, max(0.0, float(percent))),
        "p_frame_count": max(0, int(source_frame_index)),
    })


def _finish_job(job_id: Any, summary: Any) -> None:
    data = summary.to_dict() if hasattr(summary, "to_dict") else _event_dict(summary)
    _rpc("edas_vision_complete_job", {
        "p_id": str(job_id), "p_duration_ms": int(data["duration_ms"]),
        "p_width": int(data["width"]), "p_height": int(data["height"]),
        "p_source_fps": float(data["source_fps"]), "p_decoded_frames": int(data["decoded_frames"]),
        "p_sampled_frames": int(data["sampled_frames"]),
        "p_actual_sample_fps": float(data["actual_sample_fps"]), "p_elapsed_ms": int(data["elapsed_ms"]),
        "p_average_inference_ms": float(data["average_inference_ms"]),
        "p_peak_rss_mb": data.get("peak_rss_mb"),
    })


def _mark_failed(job_id: Any, message: str) -> None:
    _rpc("edas_vision_mark_failed", {"p_id": str(job_id), "p_error_message": message[:1000]})


def _heartbeat() -> None:
    _rest("PATCH", "vision_model_versions", params={
        "model_name": f"eq.{MODEL_NAME}", "version": f"eq.{MODEL_VERSION}",
        "weights_hash": f"eq.{EXPECTED_SHA256}",
    }, payload={"last_checked_at": datetime.now(timezone.utc).isoformat()}, prefer="return=minimal")


def _process(job: dict[str, Any], detector: RoadDamageDetector) -> None:
    job_id = job["id"]
    last_cancel_check = 0.0
    cancelled = False

    def should_cancel() -> bool:
        nonlocal last_cancel_check, cancelled
        now = time.monotonic()
        if now - last_cancel_check >= 1.0:
            cancelled = _is_cancelled(job_id)
            last_cancel_check = now
        return cancelled

    def on_event(event: Any) -> None:
        if not should_cancel():
            _save_detection(job_id, event)

    def on_progress(percent: float, source_frame_index: int, _estimated_frames: int) -> None:
        if not should_cancel():
            _progress(job_id, percent, source_frame_index)

    with tempfile.TemporaryDirectory(prefix="edas-vision-worker-") as directory:
        source_path = Path(directory) / "source.mp4"
        try:
            _download_video(job, source_path)
            summary = process_video(source_path, sample_fps=SAMPLE_FPS, image_size=IMAGE_SIZE,
                                    confidence=CONFIDENCE, on_event=on_event,
                                    on_progress=on_progress, should_cancel=should_cancel,
                                    detector=detector)
            if should_cancel():
                return
            _finish_job(job_id, summary)
        except InterruptedError:
            return
        except Exception as exc:
            LOGGER.exception("Vision processing failed for job %s (%s)", job_id, type(exc).__name__)
            try:
                _mark_failed(job_id, "Video analysis failed. Check the MP4 stream and local model configuration.")
            except Exception as persist_exc:
                LOGGER.error("Could not persist failure state for job %s (%s)", job_id, type(persist_exc).__name__)


def run_worker() -> None:
    LOGGER.info("Vision worker started; sampling target %.1f FPS on CPU", SAMPLE_FPS)
    detector = RoadDamageDetector(confidence=CONFIDENCE)
    model_status = _register_model(detector)
    if model_status != "ready":
        LOGGER.error("Road-damage model is unavailable; status=%s", model_status)
    try:
        stale_count = _rpc("edas_vision_mark_stale_jobs")
        if stale_count:
            LOGGER.warning("Marked %s stale Vision job(s) failed after worker restart.", stale_count)
    except Exception as exc:
        LOGGER.warning("Stale job recovery deferred (%s)", type(exc).__name__)
    last_cleanup = 0.0
    last_heartbeat = time.monotonic()
    while True:
        now = time.monotonic()
        if now - last_cleanup >= CLEANUP_INTERVAL_SECONDS:
            try:
                _cleanup_retention()
            except Exception as exc:
                LOGGER.warning("Vision retention cleanup deferred (%s)", type(exc).__name__)
            last_cleanup = now
        if now - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
            try:
                _heartbeat()
            except Exception as exc:
                LOGGER.warning("Vision model heartbeat deferred (%s)", type(exc).__name__)
            last_heartbeat = now
        try:
            job = _claim_job()
        except Exception as exc:
            LOGGER.warning("Vision queue poll deferred (%s)", type(exc).__name__)
            time.sleep(POLL_SECONDS)
            continue
        if job is None:
            time.sleep(POLL_SECONDS)
            continue
        _process(job, detector)


def main() -> None:
    logging.basicConfig(level=os.getenv("EDAS_VISION_LOG_LEVEL", "INFO"))
    try:
        run_worker()
    except KeyboardInterrupt:
        LOGGER.info("Vision worker stopped")


if __name__ == "__main__":
    main()
