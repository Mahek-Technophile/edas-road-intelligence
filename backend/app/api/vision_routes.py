"""Authenticated Vision Lab job API, event retrieval, and SSE stream."""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from typing import Any, AsyncIterator
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Header, Query, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from app.core.auth import current_principal
from app.core.errors import ApiError
from app.core.vision_store import (
    SpooledVideo,
    delete_private_video,
    postgrest_request,
    signed_video_url,
    spool_and_validate_video,
    upload_private_video,
)


router = APIRouter(prefix="/api/v1/vision")
SAMPLE_FPS = float(os.getenv("EDAS_VISION_SAMPLE_FPS", "10"))
IMAGE_SIZE = int(os.getenv("EDAS_VISION_IMAGE_SIZE", "640"))
CONFIDENCE = float(os.getenv("EDAS_VISION_CONFIDENCE", "0.10"))
TERMINAL_STATES = {"completed", "failed", "cancelled"}


def _heartbeat_is_recent(value: str) -> bool:
    try:
        checked_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if checked_at.tzinfo is None:
            checked_at = checked_at.replace(tzinfo=timezone.utc)
        age_seconds = (datetime.now(timezone.utc) - checked_at).total_seconds()
        return 0 <= age_seconds <= max(60, int(os.getenv("EDAS_VISION_HEARTBEAT_INTERVAL_SECONDS", "20")) * 3)
    except (TypeError, ValueError):
        return False


def _job_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": str(row["id"]),
        "status": row["status"],
        "progress": float(row["progress"]),
        "duration_ms": row["duration_ms"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "error_message": row["error_message"],
        "width": row.get("width"),
        "height": row.get("height"),
        "source_fps": row.get("source_fps"),
        "decoded_frames": row.get("decoded_frames"),
        "sampled_frames": row.get("sampled_frames"),
        "actual_sample_fps": row.get("actual_sample_fps"),
        "elapsed_ms": row.get("elapsed_ms"),
        "average_inference_ms": row.get("average_inference_ms"),
        "peak_rss_mb": row.get("peak_rss_mb"),
        "video_deleted_at": row.get("video_deleted_at"),
        "events_deleted_at": row.get("events_deleted_at"),
    }


async def _owned_job(job_id: UUID, subject: str) -> dict[str, Any]:
    row = await postgrest_request(
        "POST",
        "rpc/edas_vision_get_job",
        payload={"p_id": str(job_id), "p_user_id": subject},
    )
    if not isinstance(row, dict):
        raise ApiError(404, "not_found", "Vision job was not found.")
    return row


async def _with_video_url(row: dict[str, Any]) -> dict[str, Any]:
    result = _job_payload(row)
    if row.get("video_deleted_at") is not None:
        result["video_url"] = None
        result["video_url_expires_at"] = None
        return result
    try:
        result["video_url"], result["video_url_expires_at"] = await signed_video_url(row["video_path"])
    except RuntimeError as exc:
        raise ApiError(503, "dependency_unavailable", "Private video playback is not configured.") from exc
    return result


def _detection_payload(row: dict[str, Any]) -> dict[str, Any]:
    bbox = row["bbox"]
    if isinstance(bbox, str):
        bbox = json.loads(bbox)
    return {
        "cursor": row["cursor"],
        "event_id": str(row.get("event_id", row.get("id"))),
        "timestamp_ms": row["timestamp_ms"],
        "model": row.get("model", row.get("model_name")),
        "class_id": row["class_id"],
        "class_name": row["class_name"],
        "label": row["label"],
        "confidence": float(row["confidence"]),
        "bbox": bbox,
        "track_id": row["track_id"],
        "inference_ms": float(row["inference_ms"]),
        "created_at": row["created_at"],
    }


def _model_dict(model: Any) -> dict[str, Any]:
    if hasattr(model, "to_dict"):
        item = model.to_dict()
    elif hasattr(model, "model_dump"):
        item = model.model_dump()
    elif is_dataclass(model):
        item = asdict(model)
    elif isinstance(model, dict):
        item = model
    else:
        item = vars(model)
    return {
        "name": item.get("capability", item.get("name", "unknown")),
        "display_name": item.get("model_name", item.get("display_name", "Unknown model")),
        "version": item.get("version"),
        "status": item.get("status", "MODEL_NOT_CONFIGURED"),
        "classes": item.get("supported_classes", item.get("classes", [])),
        "confidence_threshold": item.get("confidence_threshold"),
        "reason": item.get("detail", item.get("reason")),
        "device": item.get("device", "cpu"),
        "input_size": item.get("input_size", IMAGE_SIZE),
    }


@router.post("/jobs", status_code=202)
async def create_job(
    video: UploadFile = File(...),
    principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    spooled: SpooledVideo | None = None
    object_path: str | None = None
    job_id = uuid4()
    try:
        spooled = await spool_and_validate_video(video)
        object_path = await upload_private_video(spooled, job_id)
        signed_url, signed_expiry = await signed_video_url(object_path)
        row = await postgrest_request(
            "POST",
            "rpc/edas_vision_create_job",
            payload={
                "p_id": str(job_id),
                "p_user_id": principal["sub"],
                "p_video_path": object_path,
                "p_video_size_bytes": spooled.size_bytes,
                "p_video_sha256": spooled.sha256,
                "p_duration_ms": spooled.duration_ms,
                "p_width": spooled.width,
                "p_height": spooled.height,
                "p_source_fps": spooled.source_fps,
            },
        )
        result = _job_payload(row)
        result["video_url"] = signed_url
        result["video_url_expires_at"] = signed_expiry
        return result
    except ApiError:
        if object_path is not None:
            await delete_private_video(object_path)
        raise
    except Exception as exc:
        if object_path is not None:
            await delete_private_video(object_path)
        raise ApiError(503, "dependency_unavailable", "The vision job could not be queued.") from exc
    finally:
        if spooled is not None:
            spooled.path.unlink(missing_ok=True)
        await video.close()


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: UUID,
    principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    row = await _owned_job(job_id, principal["sub"])
    return await _with_video_url(row)


@router.get("/jobs/{job_id}/events")
async def get_events(
    job_id: UUID,
    after: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=1000),
    principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    job = await _owned_job(job_id, principal["sub"])
    if job.get("events_deleted_at") is not None:
        return {"items": [], "next_cursor": after, "expired": True}
    rows = await postgrest_request(
        "POST",
        "rpc/edas_vision_get_events",
        payload={
            "p_id": str(job_id),
            "p_user_id": principal["sub"],
            "p_after": after,
            "p_limit": limit,
        },
    )
    items = [_detection_payload(row) for row in (rows if isinstance(rows, list) else [])]
    return {"items": items, "next_cursor": items[-1]["cursor"] if items else after}


def _sse(name: str, payload: dict[str, Any], cursor: int | None = None) -> str:
    lines = []
    if cursor is not None:
        lines.append(f"id: {cursor}")
    lines.append(f"event: {name}")
    encoded = json.dumps(jsonable_encoder(payload), separators=(",", ":"), ensure_ascii=False)
    lines.append(f"data: {encoded}")
    return "\n".join(lines) + "\n\n"


@router.get("/jobs/{job_id}/stream")
async def stream_job(
    job_id: UUID,
    after: int = Query(default=0, ge=0),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    principal: dict[str, Any] = Depends(current_principal),
) -> StreamingResponse:
    await _owned_job(job_id, principal["sub"])
    try:
        cursor_id = max(after, int(last_event_id or "0"))
    except ValueError as exc:
        raise ApiError(400, "invalid_request", "Last-Event-ID must be an integer cursor.") from exc

    async def events() -> AsyncIterator[str]:
        last_state: tuple[str, float] | None = None
        last_keepalive = asyncio.get_running_loop().time()
        next_cursor = cursor_id
        while True:
            job = await _owned_job(job_id, principal["sub"])
            state = (job["status"], float(job["progress"]))
            if state != last_state:
                if job["status"] in TERMINAL_STATES:
                    yield _sse("status", _job_payload(job))
                else:
                    yield _sse("progress", _job_payload(job))
                last_state = state

            rows = await postgrest_request(
                "POST",
                "rpc/edas_vision_get_events",
                payload={
                    "p_id": str(job_id),
                    "p_user_id": principal["sub"],
                    "p_after": next_cursor,
                    "p_limit": 200,
                },
            )
            rows = rows if isinstance(rows, list) else []
            for row in rows:
                item = _detection_payload(row)
                next_cursor = item["cursor"]
                yield _sse("detection", item, next_cursor)
            if job["status"] in TERMINAL_STATES and not rows:
                break
            now = asyncio.get_running_loop().time()
            if now - last_keepalive >= 15:
                yield ": keep-alive\n\n"
                last_keepalive = now
            await asyncio.sleep(1)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: UUID,
    principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    return await postgrest_request(
        "POST",
        "rpc/edas_vision_cancel_job",
        payload={"p_id": str(job_id), "p_user_id": principal["sub"]},
    )


@router.get("/models")
async def list_models(
    _principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    try:
        from backend.vision.pipeline import get_model_capabilities

        models = [_model_dict(item) for item in get_model_capabilities(load_detector=False)]
    except (ImportError, RuntimeError):
        models = []
    workers = await postgrest_request(
        "GET",
        "vision_model_versions",
        params={
            "model_name": "eq.road_damage_yolov8s_rdd2022",
            "select": "status,detail,last_checked_at",
            "order": "created_at.desc",
            "limit": "1",
        },
    )
    worker = workers[0] if isinstance(workers, list) and workers else None
    road_damage = next((item for item in models if item["name"] == "road_damage"), None)
    if road_damage is not None:
        if worker is None or worker["last_checked_at"] is None:
            road_damage.update(status="MODEL_NOT_CONFIGURED", reason="Vision worker has not reported model readiness.")
        elif worker["status"] == "ready" and _heartbeat_is_recent(worker["last_checked_at"]):
            road_damage.update(status="ready", reason=None)
        elif worker["status"] == "ready":
            road_damage.update(status="MODEL_NOT_CONFIGURED", reason="Vision worker heartbeat is stale.")
        else:
            road_damage.update(
                status=worker["status"],
                reason=worker["detail"] or "Vision worker/model is unavailable.",
            )
    return {
        "items": models,
        "sample_fps": SAMPLE_FPS,
        "image_size": IMAGE_SIZE,
        "tracking_available": False,
    }
