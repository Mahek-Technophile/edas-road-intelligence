from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from uuid import UUID, uuid4
from typing import Any

import httpx


from app.core.config import settings
from app.core.errors import ApiError


_ALLOWED_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def _storage_headers(base_url: str, key: str) -> dict[str, str]:
    return {"apikey": key, "authorization": f"Bearer {key}", "content-type": "application/json"}


def _absolute_storage_url(base: str, signed: str) -> str:
    if signed.startswith("http://") or signed.startswith("https://"):
        return signed
    return f"{base}/storage/v1{signed if signed.startswith('/') else '/' + signed}"


async def issue_upload_ticket(
    connection: Any,
    subject: str,
    content_type: str,
    size_bytes: int,
) -> dict:
    if content_type not in _ALLOWED_TYPES:
        raise ApiError(415, "unsupported_media_type", "Only JPEG, PNG, and WebP images are accepted.")
    if size_bytes > min(settings.evidence_max_size_bytes, 10 * 1024 * 1024):
        raise ApiError(413, "payload_too_large", "Evidence exceeds the configured size limit.")
    try:
        base, key = settings.require_storage()
    except RuntimeError as exc:
        raise ApiError(503, "dependency_unavailable", "Evidence storage is not configured.") from exc
    evidence_id = uuid4()
    path = f"uploads/{uuid4().hex}.{_ALLOWED_TYPES[content_type]}"
    expires = datetime.now(timezone.utc) + timedelta(hours=2)
    async with connection.transaction():
        await connection.execute(
            """INSERT INTO public.evidence_objects
               (id,uploader_subject,bucket,object_path,content_type,size_bytes,expires_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s)""",
            (evidence_id, subject, settings.evidence_bucket, path, content_type, size_bytes, expires),
        )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{base}/storage/v1/object/upload/sign/{quote(settings.evidence_bucket, safe='')}/{quote(path, safe='/')}",
                headers=_storage_headers(base, key),
                json={"upsert": False},
            )
            response.raise_for_status()
            payload = response.json()
            signed = payload.get("url") or payload.get("signedURL") or payload.get("signedUrl")
            if not isinstance(signed, str):
                raise ValueError("Storage did not return a signed upload path")
    except (httpx.HTTPError, ValueError) as exc:
        await connection.execute("DELETE FROM public.evidence_objects WHERE id=%s AND lifecycle_state='pending'", (evidence_id,))
        raise ApiError(503, "dependency_unavailable", "Evidence storage could not issue an upload URL.") from exc
    return {
        "evidence_id": str(evidence_id),
        "bucket": settings.evidence_bucket,
        "object_path": path,
        "upload_url": _absolute_storage_url(base, signed),
        "expires_at": expires.isoformat().replace("+00:00", "Z"),
        "required_headers": {"content-type": content_type},
    }


def _signature_matches(content_type: str, content: bytes) -> bool:
    if content_type == "image/jpeg":
        return content.startswith(bytes.fromhex("ffd8ff"))
    if content_type == "image/png":
        return content.startswith(bytes.fromhex("89504e470d0a1a0a"))
    if content_type == "image/webp":
        return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return False


async def validate_pending_evidence(
    connection: Any, evidence_id: UUID, subject: str
) -> str:
    row = await (await connection.execute(
        """SELECT id,object_path,bucket,content_type,size_bytes,expires_at,lifecycle_state
           FROM public.evidence_objects WHERE id=%s AND uploader_subject=%s""",
        (evidence_id, subject),
    )).fetchone()
    if row is None:
        raise ApiError(404, "not_found", "Evidence was not found.")
    if row["lifecycle_state"] != "pending" or row["expires_at"] <= datetime.now(timezone.utc):
        raise ApiError(409, "conflict", "Evidence is expired or already attached.")
    try:
        base, key = settings.require_storage()
        url = f"{base}/storage/v1/object/{quote(row['bucket'], safe='')}/{quote(row['object_path'], safe='/')}"
        async with httpx.AsyncClient(timeout=20) as client:
            async with client.stream("GET", url, headers={"apikey": key, "authorization": f"Bearer {key}"}) as response:
                if response.status_code == 404:
                    raise ApiError(409, "conflict", "Evidence upload is not available.")
                response.raise_for_status()
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > min(row["size_bytes"], settings.evidence_max_size_bytes, 10 * 1024 * 1024):
                        raise ApiError(413, "payload_too_large", "Evidence exceeds the configured size limit.")
    except ApiError:
        raise
    except (httpx.HTTPError, RuntimeError) as exc:
        raise ApiError(503, "dependency_unavailable", "Evidence storage is unavailable.") from exc
    if len(body) != row["size_bytes"] or not _signature_matches(row["content_type"], bytes(body)):
        raise ApiError(415, "unsupported_media_type", "Evidence content does not match its declared image type.")
    checksum = hashlib.sha256(body).hexdigest()
    return checksum


async def create_signed_read_url(evidence_id: UUID, subject: str, is_admin: bool, connection: Any) -> dict:
    row = await (await connection.execute(
        """SELECT id,uploader_subject,bucket,object_path,lifecycle_state
           FROM public.evidence_objects WHERE id=%s AND lifecycle_state='attached'""",
        (evidence_id,),
    )).fetchone()
    if row is None:
        raise ApiError(404, "not_found", "Evidence was not found.")
    if row["uploader_subject"] != subject and not is_admin:
        raise ApiError(403, "forbidden", "Evidence access is not permitted.")
    try:
        base, key = settings.require_storage()
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{base}/storage/v1/object/sign/{quote(row['bucket'], safe='')}/{quote(row['object_path'], safe='/')}",
                headers=_storage_headers(base, key),
                json={"expiresIn": min(max(settings.signed_read_ttl_seconds, 1), 3600)},
            )
            response.raise_for_status()
            signed = response.json().get("signedURL") or response.json().get("signedUrl") or response.json().get("url")
            if not isinstance(signed, str):
                raise ValueError("Storage did not return a signed read path")
    except (httpx.HTTPError, ValueError, RuntimeError) as exc:
        raise ApiError(503, "dependency_unavailable", "Evidence storage is unavailable.") from exc
    expires = datetime.now(timezone.utc) + timedelta(seconds=min(max(settings.signed_read_ttl_seconds, 1), 3600))
    return {"evidence_id": str(evidence_id), "read_url": _absolute_storage_url(base, signed),
            "expires_at": expires.isoformat().replace("+00:00", "Z")}
