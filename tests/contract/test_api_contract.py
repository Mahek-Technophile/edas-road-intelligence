"""Opt-in live EDAS API v2 contract checks; requires pytest."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from typing import Any

import pytest

BASE_URL = os.getenv("EDAS_API_BASE_URL", "").rstrip("/")
USER_TOKEN = os.getenv("EDAS_TEST_USER_TOKEN", "")
ADMIN_TOKEN = os.getenv("EDAS_TEST_ADMIN_TOKEN", "")


@pytest.fixture(scope="session", autouse=True)
def disposable_target() -> None:
    if os.getenv("EDAS_TEST_ENV", "").lower() != "disposable":
        pytest.skip("Set EDAS_TEST_ENV=disposable to enable live API checks")
    if not BASE_URL:
        pytest.skip("Set EDAS_API_BASE_URL for the disposable API")


def call(method: str, path: str, token: str | None = None, payload: Any = None):
    raw = None if payload is None else json.dumps(payload, allow_nan=False).encode()
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if raw is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(f"{BASE_URL}/api/v1{path}", data=raw, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as exc:
        response = exc
    body = response.read()
    return response.status, response.headers, (json.loads(body) if body else None)


def user_token() -> str:
    if not USER_TOKEN:
        pytest.skip("Set EDAS_TEST_USER_TOKEN for authenticated API checks")
    return USER_TOKEN


def admin_token() -> str:
    if not ADMIN_TOKEN:
        pytest.skip("Set EDAS_TEST_ADMIN_TOKEN for admin API checks")
    return ADMIN_TOKEN


def error_schema(body: Any) -> None:
    assert isinstance(body, dict) and set(body) == {"error"}
    error = body["error"]
    assert {"code", "message", "details", "request_id"} <= set(error)
    assert isinstance(error["details"], list)


def test_health_is_public_liveness() -> None:
    status, _, body = call("GET", "/health")
    assert status == 200 and body == {"status": "ok"}


@pytest.mark.parametrize("path", ["/hazards", "/analytics/summary"])
def test_reads_require_auth(path: str) -> None:
    status, _, body = call("GET", path)
    assert status == 401
    error_schema(body)


def test_authenticated_hazard_list_contract() -> None:
    status, _, body = call("GET", "/hazards?limit=3&offset=0", user_token())
    assert status == 200 and isinstance(body.get("items"), list)
    assert isinstance(body.get("total"), int)
    assert body.get("limit") == 3 and body.get("offset") == 0


def test_summary_contains_complete_enum_maps() -> None:
    status, _, body = call("GET", "/analytics/summary", user_token())
    assert status == 200
    assert isinstance(body.get("total_hazards"), int)
    assert set(body.get("hazards_by_type", {})) == {
        "pothole", "road_damage", "open_manhole", "waterlogging", "obstruction"
    }
    assert set(body.get("hazards_by_status", {})) == {"reported", "verified", "assigned", "repaired"}


def test_admin_status_requires_authentication() -> None:
    status, _, body = call("PATCH", f"/hazards/{uuid.uuid4()}/status", payload={"status": "verified"})
    assert status == 401
    error_schema(body)


def test_non_admin_status_update_is_forbidden() -> None:
    status, _, body = call("PATCH", f"/hazards/{uuid.uuid4()}/status", user_token(),
                           {"status": "verified", "reason": "QA authorization check"})
    # Implementations may check auth before resource existence; neither path may succeed.
    assert status in (403, 404)
    assert status != 200
    error_schema(body)


def test_report_rejects_client_selected_reporter_id() -> None:
    payload = {"hazard_type": "pothole", "latitude": 18.5204, "longitude": 73.8567,
               "severity": "low", "source": "manual", "reporter_id": "forged-subject"}
    status, _, body = call("POST", "/hazard-reports", user_token(), payload)
    assert status in (400, 422)
    error_schema(body)


@pytest.mark.parametrize("payload", [
    {"hazard_type": "not-a-category", "latitude": 18.52, "longitude": 73.85, "severity": "low", "source": "manual"},
    {"hazard_type": "pothole", "latitude": 91, "longitude": 73.85, "severity": "low", "source": "manual"},
    {"hazard_type": "pothole", "latitude": 18.52, "longitude": 181, "severity": "low", "source": "manual"},
])
def test_reports_reject_invalid_enum_and_coordinates(payload: dict[str, Any]) -> None:
    status, _, body = call("POST", "/hazard-reports", user_token(), payload)
    assert status in (400, 422)
    error_schema(body)


def test_client_cannot_submit_ai_source() -> None:
    payload = {"hazard_type": "pothole", "latitude": 18.5204, "longitude": 73.8567,
               "severity": "low", "source": "ai"}
    status, _, body = call("POST", "/hazard-reports", user_token(), payload)
    assert status == 403
    error_schema(body)


@pytest.mark.parametrize("payload,status_expected", [
    ({"content_type": "text/plain", "size_bytes": 12}, 415),
    ({"content_type": "image/jpeg", "size_bytes": 10 * 1024 * 1024 + 1}, 413),
])
def test_upload_url_rejects_unsupported_or_oversize(payload: dict[str, Any], status_expected: int) -> None:
    status, _, body = call("POST", "/evidence/upload-url", user_token(), payload)
    assert status == status_expected
    error_schema(body)


def test_admin_token_is_valid_before_mutating_e2e() -> None:
    status, _, _ = call("GET", "/hazards?limit=1", admin_token())
    assert status == 200
