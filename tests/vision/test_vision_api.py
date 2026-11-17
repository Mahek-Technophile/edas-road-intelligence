from __future__ import annotations

from uuid import UUID

import pytest
from starlette.requests import Request
from types import SimpleNamespace

from app.api import vision_routes
from app.core.auth import current_principal
from app.core.errors import ApiError
from app.core.vision_store import spool_and_validate_video


JOB_ID = UUID("8e8eaad9-4e82-4462-8f88-97507276a6a3")


def run_immediate(coroutine):
    """Drive endpoint coroutines whose test doubles complete awaits immediately.

    Managed Windows sandboxes can block even the local socketpair used by
    Starlette TestClient. These endpoint-level checks need no socket or live
    event loop; fail clearly if an awaitable unexpectedly yields control.
    """
    try:
        coroutine.send(None)
    except StopIteration as result:
        return result.value
    finally:
        coroutine.close()
    raise AssertionError("Test double yielded; use an async test environment")


class Cursor:
    def __init__(self, row=None, rows=None):
        self.row = row
        self.rows = rows or []

    async def fetchone(self):
        return self.row

    async def fetchall(self):
        return self.rows


def job_row(status="completed"):
    return {
        "id": JOB_ID, "user_id": "alice", "video_bucket": "vision-videos",
        "video_path": f"jobs/{JOB_ID}/source.mp4", "video_size_bytes": 100,
        "status": status, "progress": 100.0, "duration_ms": 5000,
        "width": 1920, "height": 1080, "source_fps": 30.0,
        "decoded_frames": 150, "sampled_frames": 50, "actual_sample_fps": 10.0,
        "elapsed_ms": 100.0, "average_inference_ms": 2.0, "peak_rss_mb": None,
        "error_message": None, "created_at": "2026-11-17T10:00:00Z",
        "updated_at": "2026-11-17T10:00:00Z", "video_deleted_at": None,
        "events_deleted_at": None,
    }


def test_auth_dependency_requires_bearer_credentials():
    request = Request({"type": "http", "method": "GET", "path": "/"})

    with pytest.raises(ApiError) as caught:
        run_immediate(current_principal(request, None))

    assert caught.value.status_code == 401
    assert caught.value.code == "authentication_required"


def test_job_is_not_visible_to_another_authenticated_subject(monkeypatch):
    async def get_job(_job_id, _subject):
        raise ApiError(404, "not_found", "Vision job was not found.")

    monkeypatch.setattr(vision_routes, "_owned_job", get_job)
    with pytest.raises(ApiError) as caught:
        run_immediate(vision_routes.get_job(JOB_ID, {"sub": "mallory"}))

    assert caught.value.status_code == 404
    assert caught.value.code == "not_found"


def test_event_cursor_is_scoped_to_owned_job_without_fabricating_detections(monkeypatch):
    async def owned(_job_id, subject):
        assert subject == "alice"
        return job_row()

    async def request(_method, endpoint, *, payload=None, **_kwargs):
        assert endpoint == "rpc/edas_vision_get_events"
        assert payload["p_user_id"] == "alice"
        assert payload["p_after"] == 6
        assert payload["p_limit"] == 10
        return []

    monkeypatch.setattr(vision_routes, "_owned_job", owned)
    monkeypatch.setattr(vision_routes, "postgrest_request", request)

    payload = run_immediate(
        vision_routes.get_events(JOB_ID, after=6, limit=10, principal={"sub": "alice"})
    )

    assert payload == {"items": [], "next_cursor": 6}


def test_cancel_is_scoped_to_authenticated_owner(monkeypatch):
    async def request(_method, endpoint, *, payload=None, **_kwargs):
        assert endpoint == "rpc/edas_vision_cancel_job"
        assert payload == {"p_id": str(JOB_ID), "p_user_id": "alice"}
        return {"job_id": str(JOB_ID), "status": "cancelled"}

    monkeypatch.setattr(vision_routes, "postgrest_request", request)

    payload = run_immediate(vision_routes.cancel_job(JOB_ID, {"sub": "alice"}))

    assert payload == {"job_id": str(JOB_ID), "status": "cancelled"}


def test_sse_emits_terminal_state_without_inventing_detections(monkeypatch):
    monkeypatch.setattr(vision_routes.asyncio, "get_running_loop", lambda: SimpleNamespace(time=lambda: 0.0))
    async def owned(_job_id, subject):
        assert subject == "alice"
        return job_row()

    async def request(_method, endpoint, *, payload=None, **_kwargs):
        assert endpoint == "rpc/edas_vision_get_events"
        return []

    monkeypatch.setattr(vision_routes, "_owned_job", owned)
    monkeypatch.setattr(vision_routes, "postgrest_request", request)
    response = run_immediate(
        vision_routes.stream_job(JOB_ID, after=0, last_event_id=None, principal={"sub": "alice"})
    )

    async def read_stream():
        return [chunk async for chunk in response.body_iterator]

    chunks = run_immediate(read_stream())
    body = "".join(chunk.decode() if isinstance(chunk, bytes) else chunk for chunk in chunks)
    assert "event: status\n" in body
    assert "event: detection\n" not in body


def test_sse_rejects_invalid_last_event_id(monkeypatch):
    async def owned(_job_id, _subject):
        return job_row()

    monkeypatch.setattr(vision_routes, "_owned_job", owned)
    with pytest.raises(ApiError) as caught:
        run_immediate(
            vision_routes.stream_job(JOB_ID, after=0, last_event_id="not-a-cursor",
                                     principal={"sub": "alice"})
        )

    assert caught.value.status_code == 400
    assert caught.value.code == "invalid_request"


def test_non_video_upload_is_rejected_before_storage_work():
    with pytest.raises(ApiError) as caught:
        run_immediate(spool_and_validate_video(type("ImageUpload", (), {"content_type": "image/jpeg"})()))

    assert caught.value.status_code == 415
    assert caught.value.code == "unsupported_media_type"
