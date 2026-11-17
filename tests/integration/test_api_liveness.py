from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_is_process_liveness_and_has_request_id():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers.get("x-request-id")


def test_protected_endpoint_rejects_missing_bearer_before_database_access():
    response = client.get("/api/v1/hazards")
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "authentication_required"
    assert body["error"]["request_id"]
    assert response.headers.get("x-request-id") == body["error"]["request_id"]


def test_unknown_path_uses_contract_error_envelope():
    response = client.get("/api/v1/no-such-route")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert response.json()["error"]["request_id"] == response.headers["x-request-id"]
