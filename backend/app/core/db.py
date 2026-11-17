from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from fastapi import Request

from app.core.auth import decode_access_token
from app.core.config import settings
from app.core.errors import ApiError


async def get_connection(request: Request) -> AsyncIterator[Any]:
    authorization = request.headers.get("authorization", "")
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token:
        raise ApiError(401, "authentication_required", "A bearer access token is required.")
    request.state.edas_principal = await decode_access_token(token)
    try:
        dsn = settings.require_database_url()
        import psycopg
        from psycopg.rows import dict_row
        async with await psycopg.AsyncConnection.connect(dsn, row_factory=dict_row) as connection:
            yield connection
    except RuntimeError as exc:
        raise ApiError(503, "dependency_unavailable", "Database is not configured.") from exc
    except ImportError as exc:
        raise ApiError(503, "dependency_unavailable", "The PostgreSQL driver is unavailable.") from exc
    except Exception as exc:
        if exc.__class__.__module__.startswith("psycopg"):
            raise ApiError(503, "dependency_unavailable", "Database is unavailable.") from exc
        raise
