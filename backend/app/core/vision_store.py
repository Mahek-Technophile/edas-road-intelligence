"""Private video-storage helpers for Vision Lab jobs."""

from __future__ import annotations

import asyncio
import hashlib
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator
from urllib.parse import quote
from uuid import UUID

import httpx

from app.core.config import settings
from app.core.errors import ApiError


VIDEO_BUCKET = os.getenv("EDAS_VISION_STORAGE_BUCKET", "vision-videos")
MAX_VIDEO_BYTES = min(200 * 1024 * 1024, max(1, int(os.getenv("EDAS_VISION_MAX_VIDEO_SIZE_BYTES", str(200 * 1024 * 1024)))))
MAX_VIDEO_DURATION_SECONDS = min(600, max(1, int(os.getenv("EDAS_VISION_MAX_DURATION_SECONDS", "600"))))
SIGNED_VIDEO_URL_TTL_SECONDS = int(os.getenv("EDAS_VISION_SIGNED_URL_TTL_SECONDS", "3600"))
UPLOAD_CHUNK_BYTES = 1024 * 1024


@dataclass(frozen=True, slots=True)
class SpooledVideo:
    path: Path
    size_bytes: int
    sha256: str
    duration_ms: int
    width: int
    height: int
    source_fps: float


async def spool_and_validate_video(upload: object) -> SpooledVideo:
    """Validate MP4 bytes, size, duration, dimensions, and decoder readability."""
    content_type = getattr(upload, "content_type", None)
    if content_type != "video/mp4":
        raise ApiError(415, "unsupported_media_type", "Upload a video/mp4 file.")
    announced_size = getattr(upload, "size", None)
    if announced_size is not None and announced_size > MAX_VIDEO_BYTES:
        raise ApiError(413, "payload_too_large", "Video exceeds the configured upload limit.")

    temp = tempfile.NamedTemporaryFile(prefix="edas-vision-", suffix=".mp4", delete=False)
    temp_path = Path(temp.name)
    digest = hashlib.sha256()
    total = 0
    try:
        reader = getattr(upload, "read")
        while True:
            chunk = await reader(UPLOAD_CHUNK_BYTES)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_VIDEO_BYTES:
                raise ApiError(413, "payload_too_large", "Video exceeds the configured upload limit.")
            digest.update(chunk)
            await asyncio.to_thread(temp.write, chunk)
        await asyncio.to_thread(temp.flush)
        await asyncio.to_thread(temp.close)

        if total < 12:
            raise ApiError(415, "unsupported_media_type", "The uploaded MP4 file is invalid.")
        with temp_path.open("rb") as video:
            header = video.read(12)
        if header[4:8] != b"ftyp":
            raise ApiError(415, "unsupported_media_type", "The uploaded file is not a valid MP4 container.")

        try:
            import cv2
        except ImportError as exc:
            raise ApiError(503, "dependency_unavailable", "OpenCV video support is not installed.") from exc
        capture = cv2.VideoCapture(str(temp_path))
        try:
            if not capture.isOpened():
                raise ApiError(415, "unsupported_media_type", "The MP4 video could not be decoded.")
            fps = float(capture.get(cv2.CAP_PROP_FPS))
            frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
            if fps <= 0 or frame_count <= 0 or width <= 0 or height <= 0:
                raise ApiError(415, "unsupported_media_type", "The MP4 video has invalid stream metadata.")
            if width > 7680 or height > 4320:
                raise ApiError(422, "invalid_request", "Video dimensions exceed the supported 8K limit.")
            duration_ms = round(frame_count / fps * 1000)
            if duration_ms <= 0 or duration_ms > MAX_VIDEO_DURATION_SECONDS * 1000:
                raise ApiError(422, "invalid_request", "Video duration exceeds the configured 10-minute limit.")
            ok, frame = capture.read()
            if not ok or frame is None:
                raise ApiError(415, "unsupported_media_type", "The MP4 video contains no decodable frames.")
        finally:
            capture.release()

        return SpooledVideo(
            path=temp_path,
            size_bytes=total,
            sha256=digest.hexdigest(),
            duration_ms=duration_ms,
            width=width,
            height=height,
            source_fps=fps,
        )
    except Exception:
        try:
            await asyncio.to_thread(temp.close)
        finally:
            temp_path.unlink(missing_ok=True)
        raise


def _storage_headers(base: str, service_key: str) -> dict[str, str]:
    return {
        "apikey": service_key,
        "authorization": f"Bearer {service_key}",
        "x-upsert": "false",
    }


async def postgrest_request(
    method: str,
    endpoint: str,
    *,
    params: dict[str, str] | None = None,
    payload: dict | None = None,
    prefer: str | None = None,
) -> Any:
    """Call Supabase PostgREST with the server-only service key.

    Vision routes pass ownership subjects only after validating the user's JWT.
    Keep this helper private to the FastAPI process; never expose the key or
    route these requests through browser code.
    """
    try:
        base, service_key = settings.require_storage()
    except RuntimeError as exc:
        raise ApiError(503, "dependency_unavailable", "Supabase server configuration is incomplete.") from exc
    headers = {
        "apikey": service_key,
        "authorization": f"Bearer {service_key}",
        "accept-profile": "public",
        "content-profile": "public",
    }
    if payload is not None:
        headers["content-type"] = "application/json"
    if prefer:
        headers["prefer"] = prefer
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.request(
                method,
                f"{base}/rest/v1/{endpoint.lstrip('/')}",
                headers=headers,
                params=params,
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise ApiError(503, "dependency_unavailable", "Supabase data API is unavailable.") from exc
    if response.status_code >= 400:
        error_code = None
        try:
            error_code = response.json().get("code")
        except (ValueError, AttributeError):
            pass
        if error_code == "P0002":
            raise ApiError(404, "not_found", "Vision job was not found.")
        if error_code == "42501":
            raise ApiError(403, "forbidden", "The requested vision operation is not permitted.")
        if error_code in {"23505", "40001", "P0001"}:
            raise ApiError(409, "conflict", "The vision job conflicts with its current state.")
        if error_code in {"22023", "22P02"}:
            raise ApiError(400, "invalid_request", "The vision request is invalid.")
        raise ApiError(503, "dependency_unavailable", "Supabase data API could not complete the request.")
    if response.status_code == 204 or not response.content:
        return None
    try:
        return response.json()
    except ValueError as exc:
        raise ApiError(503, "dependency_unavailable", "Supabase returned an invalid response.") from exc


async def _file_chunks(path: Path) -> AsyncIterator[bytes]:
    with path.open("rb") as source:
        while True:
            chunk = await asyncio.to_thread(source.read, UPLOAD_CHUNK_BYTES)
            if not chunk:
                break
            yield chunk


def _absolute_storage_url(base: str, signed_path: str) -> str:
    if signed_path.startswith("https://") or signed_path.startswith("http://"):
        return signed_path
    if signed_path.startswith("/storage/v1/"):
        return f"{base}{signed_path}"
    if signed_path.startswith("/"):
        return f"{base}/storage/v1{signed_path}"
    return f"{base}/storage/v1/{signed_path.lstrip('/')}"


async def upload_private_video(video: SpooledVideo, job_id: UUID) -> str:
    base, service_key = settings.require_storage()
    object_path = f"jobs/{job_id}/source.mp4"
    url = f"{base}/storage/v1/object/{quote(VIDEO_BUCKET, safe='')}/{quote(object_path, safe='/')}"
    headers = _storage_headers(base, service_key)
    headers["content-type"] = "video/mp4"
    headers["content-length"] = str(video.size_bytes)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=10)) as client:
            response = await client.post(url, headers=headers, content=_file_chunks(video.path))
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ApiError(503, "dependency_unavailable", "Private video storage could not accept the upload.") from exc
    return object_path


async def delete_private_video(object_path: str) -> None:
    try:
        base, service_key = settings.require_storage()
        url = f"{base}/storage/v1/object/{quote(VIDEO_BUCKET, safe='')}/{quote(object_path, safe='/')}"
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.delete(url, headers=_storage_headers(base, service_key))
            if response.status_code not in {200, 204, 404}:
                response.raise_for_status()
    except (httpx.HTTPError, RuntimeError):
        # The path remains private; scheduled retention cleanup can remove it later.
        return


async def signed_video_url(object_path: str) -> tuple[str, str]:
    base, service_key = settings.require_storage()
    ttl = min(max(SIGNED_VIDEO_URL_TTL_SECONDS, 60), 3600)
    url = f"{base}/storage/v1/object/sign/{quote(VIDEO_BUCKET, safe='')}/{quote(object_path, safe='/')}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                url,
                headers=_storage_headers(base, service_key),
                json={"expiresIn": ttl},
            )
            response.raise_for_status()
            payload = response.json()
        signed_path = payload.get("signedURL") or payload.get("signedUrl") or payload.get("url")
        if not isinstance(signed_path, str) or not signed_path:
            raise ValueError("Storage returned no signed URL")
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise ApiError(503, "dependency_unavailable", "Private video playback is unavailable.") from exc
    expires_at = datetime.now(timezone.utc).timestamp() + ttl
    return _absolute_storage_url(base, signed_path), datetime.fromtimestamp(expires_at, timezone.utc).isoformat().replace("+00:00", "Z")
