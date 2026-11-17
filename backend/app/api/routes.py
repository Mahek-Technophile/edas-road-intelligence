from __future__ import annotations

from typing import Any
from uuid import UUID


from fastapi import APIRouter, Depends, Query, Request, Response


from app.core.auth import current_principal, require_admin
from app.core.config import settings
from app.core.db import get_connection
from app.core.errors import ApiError
from app.schemas import (
    ChallengeUpdate,
    HazardReport,
    HazardStatus,
    HazardType,
    Severity,
    StatusUpdate,
    UploadUrlRequest,
)
from app.storage import create_signed_read_url, issue_upload_ticket, validate_pending_evidence


router = APIRouter(prefix="/api/v1")


def _map_db_error(exc: Exception) -> ApiError:
    state = getattr(exc,'sqlstate',None)
    if state == "42501":
        return ApiError(403, "forbidden", "The requested operation is not permitted.")
    if state == "P0002":
        return ApiError(404, "not_found", "The requested resource was not found.")
    if state in {"40001", "23505", "P0001"}:
        return ApiError(409, "conflict", "The operation conflicts with the current resource state.")
    if state in {"22023", "22P02"}:
        return ApiError(400, "invalid_request", "The request is invalid.")
    return ApiError(503, "dependency_unavailable", "The database is unavailable.")


async def _query_one(connection: Any, sql: str, params: tuple = ()) -> dict | None:
    return await (await connection.execute(sql, params)).fetchone()


def _hazard_select() -> str:
    return """SELECT h.id,h.hazard_type,
        extensions.ST_Y(h.location::extensions.geometry) AS latitude,
        extensions.ST_X(h.location::extensions.geometry) AS longitude,
        h.severity,h.confidence_score,h.confirmation_count,
        (SELECT count(*) FROM public.hazard_observations o
          WHERE o.hazard_id=h.id AND o.disposition='confirmation') AS observation_count,
        h.status,h.description,h.first_seen_at,h.last_seen_at,h.created_at,h.updated_at,
        h.successor_of_hazard_id
      FROM public.hazards h"""


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/evidence/upload-url", status_code=201)
async def create_upload_url(
    body: UploadUrlRequest,
    connection: Any = Depends(get_connection),
    principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    return await issue_upload_ticket(connection, principal["sub"], body.content_type, body.size_bytes)


@router.get("/evidence/{evidence_id}/signed-url")
async def signed_evidence_url(
    evidence_id: UUID,
    connection: Any = Depends(get_connection),
    principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    admin = isinstance(principal.get("app_metadata"), dict) and principal["app_metadata"].get("edas_role") == "admin"
    return await create_signed_read_url(evidence_id, principal["sub"], admin, connection)


@router.post("/hazard-reports")
async def create_hazard_report(
    body: HazardReport,
    response: Response,
    connection: Any = Depends(get_connection),
    principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    if body.source.value != "manual":
        raise ApiError(403, "forbidden", "AI reports can only be submitted by a trusted detector integration.")
    evidence_checksum = None
    if body.evidence_id is not None:
        evidence_checksum = await validate_pending_evidence(connection, body.evidence_id, principal["sub"])
    try:
        cursor = await connection.execute(
            """SELECT public.edas_submit_hazard_report(%s,%s,%s,%s,%s,%s,%s,%s) AS result""",
            (
                body.hazard_type.value,
                body.latitude,
                body.longitude,
                body.severity.value,
                body.description,
                principal["sub"],
                body.evidence_id,
                evidence_checksum,
            ),
        )
        result = (await cursor.fetchone())["result"]
    except Exception as exc:
        raise _map_db_error(exc) from exc
    if result["outcome"] in {"duplicate", "duplicate_challenge"}:
        response.status_code = 200
    elif result["outcome"] == "challenge_submitted":
        response.status_code = 202
    else:
        response.status_code = 201
    return result


@router.get("/hazards")
async def list_hazards(
    hazard_type: HazardType | None = None,
    severity: Severity | None = None,
    status: HazardStatus | None = None,
    latitude: float | None = Query(default=None, ge=-90, le=90, allow_inf_nan=False),
    longitude: float | None = Query(default=None, ge=-180, le=180, allow_inf_nan=False),
    radius_m: float | None = Query(default=None, gt=0, le=50000, allow_inf_nan=False),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10000),
    sort: str = Query(default="last_seen_desc", pattern="^(last_seen_desc|confidence_desc)$"),
    connection: Any = Depends(get_connection),
    _principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    spatial_args = (latitude, longitude, radius_m)
    if any(value is not None for value in spatial_args) and not all(value is not None for value in spatial_args):
        raise ApiError(400, "invalid_request", "latitude, longitude, and radius_m must be supplied together.")
    clauses: list[str] = []
    params: list[Any] = []
    if hazard_type is not None:
        clauses.append("h.hazard_type=%s")
        params.append(hazard_type.value)
    if severity is not None:
        clauses.append("h.severity=%s")
        params.append(severity.value)
    if status is not None:
        clauses.append("h.status=%s")
        params.append(status.value)
    if latitude is not None and longitude is not None and radius_m is not None:
        clauses.append("extensions.ST_DWithin(h.location,extensions.ST_SetSRID(extensions.ST_MakePoint(%s,%s),4326)::extensions.geography,%s)")
        params.extend((longitude, latitude, radius_m))
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    try:
        total = (await (await connection.execute(f"SELECT count(*) AS total FROM public.hazards h{where}", tuple(params))).fetchone())["total"]
        order = "h.last_seen_at DESC,h.id ASC" if sort == "last_seen_desc" else "h.confidence_score DESC,h.id ASC"
        query = _hazard_select() + where + f" ORDER BY {order} LIMIT %s OFFSET %s"
        rows = await (await connection.execute(query, tuple(params + [limit, offset]))).fetchall()
    except Exception as exc:
        raise _map_db_error(exc) from exc
    return {"items": rows, "total": total, "limit": limit, "offset": offset}


@router.get("/hazards/{hazard_id}")
async def hazard_detail(
    hazard_id: UUID,
    connection: Any = Depends(get_connection),
    _principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    try:
        hazard = await _query_one(connection, _hazard_select() + " WHERE h.id=%s", (hazard_id,))
        if hazard is None:
            raise ApiError(404, "not_found", "Hazard was not found.")
        observations = await (await connection.execute(
            """SELECT o.id,o.hazard_id,o.hazard_type,o.latitude,o.longitude,o.severity,o.source,o.description,
                      e.id AS evidence_id,o.disposition,o.created_at
                 FROM public.hazard_observations o
                 LEFT JOIN public.evidence_objects e ON e.observation_id=o.id
                WHERE o.hazard_id=%s ORDER BY o.created_at ASC,o.id ASC""",
            (hazard_id,),
        )).fetchall()
        challenges = await (await connection.execute(
            """SELECT id,status,submitted_at,resolved_at,resolution_note FROM public.hazard_challenges
                WHERE repaired_hazard_id=%s ORDER BY submitted_at ASC,id ASC""",
            (hazard_id,),
        )).fetchall()
    except Exception as exc:
        raise _map_db_error(exc) from exc
    return {"hazard": hazard, "observations": observations, "challenges": challenges}


@router.get("/analytics/summary")
async def analytics_summary(
    connection: Any = Depends(get_connection),
    _principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    try:
        counts = await _query_one(
            connection,
            """SELECT count(*) AS total_hazards,
                      count(*) FILTER(WHERE status='verified') AS verified_hazards,
                      count(*) FILTER(WHERE severity='critical') AS critical_hazards,
                      count(*) FILTER(WHERE status='repaired') AS repaired_hazards
                 FROM public.hazards""",
        )
        types = await (await connection.execute("SELECT hazard_type,count(*) AS n FROM public.hazards GROUP BY hazard_type")).fetchall()
        statuses = await (await connection.execute("SELECT status,count(*) AS n FROM public.hazards GROUP BY status")).fetchall()
        pending = await _query_one(connection, "SELECT count(*) AS n FROM public.hazard_challenges WHERE status='pending'")
    except Exception as exc:
        raise _map_db_error(exc) from exc
    type_keys = [item.value for item in HazardType]
    status_keys = [item.value for item in HazardStatus]
    return {
        **counts,
        "hazards_by_type": {key: next((row["n"] for row in types if row["hazard_type"] == key), 0) for key in type_keys},
        "hazards_by_status": {key: next((row["n"] for row in statuses if row["status"] == key), 0) for key in status_keys},
        "pending_challenges": pending["n"],
    }


@router.patch("/hazards/{hazard_id}/status")
async def update_hazard_status(
    hazard_id: UUID,
    body: StatusUpdate,
    connection: Any = Depends(get_connection),
    principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    admin_subject = require_admin(principal)
    try:
        cursor = await connection.execute(
            "SELECT public.edas_update_hazard_status(%s,%s,%s,%s) AS result",
            (hazard_id, body.status.value, admin_subject, body.reason),
        )
        result = (await cursor.fetchone())["result"]
    except Exception as exc:
        raise _map_db_error(exc) from exc
    return {"hazard": {"id": result["id"], "status": result["status"], "updated_at": result["updated_at"]},
            "status_event_id": result["status_event_id"]}


@router.patch("/hazard-challenges/{challenge_id}")
async def resolve_hazard_challenge(
    challenge_id: UUID,
    body: ChallengeUpdate,
    connection: Any = Depends(get_connection),
    principal: dict[str, Any] = Depends(current_principal),
) -> dict[str, Any]:
    admin_subject = require_admin(principal)
    try:
        cursor = await connection.execute(
            "SELECT public.edas_resolve_hazard_challenge(%s,%s,%s,%s) AS result",
            (challenge_id, body.status, admin_subject, body.resolution_note),
        )
        return (await cursor.fetchone())["result"]
    except Exception as exc:
        raise _map_db_error(exc) from exc
