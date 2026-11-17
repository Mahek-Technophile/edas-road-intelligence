"""Opt-in, mutating report workflow against a disposable EDAS deployment."""

from __future__ import annotations

import json
import os
import concurrent.futures
import urllib.error
import urllib.request
import uuid

import pytest

BASE_URL = os.getenv("EDAS_API_BASE_URL", "").rstrip("/")
TOKENS = [os.getenv(f"EDAS_TEST_VEHICLE_{letter}_TOKEN", "") for letter in "ABCD"]
ADMIN = os.getenv("EDAS_TEST_ADMIN_TOKEN", "")
PREFIX = f"[synthetic-edas-qa:{uuid.uuid4()}]"


@pytest.fixture(scope="session", autouse=True)
def disposable_target() -> None:
    if os.getenv("EDAS_TEST_ENV", "").lower() != "disposable":
        pytest.skip("Mutating E2E test requires EDAS_TEST_ENV=disposable")
    if not BASE_URL:
        pytest.skip("Set EDAS_API_BASE_URL")
    if not all(TOKENS) or not ADMIN:
        pytest.skip("Set four distinct synthetic vehicle tokens and EDAS_TEST_ADMIN_TOKEN")


def api(method: str, path: str, token: str, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{BASE_URL}/api/v1{path}", data=body, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as exc:
        response = exc
    raw = response.read()
    return response.status, (json.loads(raw) if raw else None)


def report(token: str, latitude: float, longitude: float):
    return api("POST", "/hazard-reports", token, {
        "hazard_type": "pothole", "latitude": latitude, "longitude": longitude,
        "severity": "high", "description": f"{PREFIX} synthetic concurrency/lifecycle scenario",
        "source": "manual",
    })


def test_three_reporters_duplicate_then_repair_challenge() -> None:
    # About 11 m north and 8 m east in Pune; all reports target one synthetic hazard.
    base_lat, base_lon = 18.520400, 73.856700
    first_status, first = report(TOKENS[0], base_lat, base_lon)
    assert first_status == 201 and first["outcome"] == "created"
    hazard_id = first["hazard_id"]

    second_status, second = report(TOKENS[1], base_lat + 0.000100, base_lon)
    third_status, third = report(TOKENS[2], base_lat, base_lon + 0.000085)
    assert second_status in (200, 201) and third_status in (200, 201)
    assert second["hazard_id"] == hazard_id == third["hazard_id"]
    assert second["duplicate"] is False and third["duplicate"] is False
    assert third["confirmation_count"] == 3
    assert third["observation_count"] == 3

    duplicate_status, duplicate = report(TOKENS[0], base_lat, base_lon)
    assert duplicate_status == 200
    assert duplicate["duplicate"] is True and duplicate["outcome"] == "duplicate"
    assert duplicate["confirmation_count"] == 3
    assert duplicate["observation_count"] == 3

    # Read current state, then take only valid forward transitions. Each write is
    # an admin operation and should create an audit event except for same-state.
    detail_status, detail = api("GET", f"/hazards/{hazard_id}", TOKENS[0])
    assert detail_status == 200
    current = detail["hazard"]["status"]
    transitions = {"reported": "verified", "verified": "assigned", "assigned": "repaired"}
    while current != "repaired":
        next_state = transitions[current]
        status, body = api("PATCH", f"/hazards/{hazard_id}/status", ADMIN,
                           {"status": next_state, "reason": f"{PREFIX} synthetic E2E"})
        assert status == 200, body
        current = next_state

    challenge_status, challenge = report(TOKENS[3], base_lat + 0.000050, base_lon)
    assert challenge_status == 202
    assert challenge["outcome"] == "challenge_submitted"
    assert challenge["status"] == "repaired"
    assert challenge["confirmation_count"] == 0 and challenge["observation_count"] == 0

    # A subsequent report must leave the repaired hazard unchanged.
    detail_status, after = api("GET", f"/hazards/{hazard_id}", TOKENS[0])
    assert detail_status == 200 and after["hazard"]["status"] == "repaired"
    challenge_id = challenge["challenge_id"]
    resolved_status, resolved = api("PATCH", f"/hazard-challenges/{challenge_id}", ADMIN,
                                    {"status": "accepted", "resolution_note": f"{PREFIX} synthetic review"})
    assert resolved_status == 200
    assert resolved["successor_hazard_id"]
    assert resolved["successor_hazard_id"] != hazard_id


def test_parallel_nearby_reports_are_single_aggregate() -> None:
    """Submit three distinct synthetic subjects simultaneously at one location."""
    suffix = int(uuid.uuid4().hex[:4], 16)
    base_lat = 18.53 + (suffix % 100) * 0.00005
    base_lon = 73.85 + ((suffix // 100) % 100) * 0.00005
    points = [(base_lat, base_lon), (base_lat + 0.00008, base_lon),
              (base_lat, base_lon + 0.00007)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda args: report(*args),
                                [(TOKENS[i], *points[i]) for i in range(3)]))
    for status, body in results:
        assert status in (200, 201), body
    hazard_ids = {body["hazard_id"] for _, body in results}
    assert len(hazard_ids) == 1
    assert all(body["duplicate"] is False for _, body in results)
    assert max(body["confirmation_count"] for _, body in results) == 3
    assert max(body["observation_count"] for _, body in results) == 3
