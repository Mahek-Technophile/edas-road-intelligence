from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWK

from app.core.config import settings
from app.core.errors import ApiError

bearer = HTTPBearer(auto_error=False)
_jwks_lock = asyncio.Lock()
_jwks_cache: tuple[float, list[dict[str, Any]]] | None = None
_JWKS_TTL_SECONDS = 300


async def _jwks() -> list[dict[str, Any]]:
    global _jwks_cache
    now = time.monotonic()
    if _jwks_cache and now < _jwks_cache[0]:
        return _jwks_cache[1]
    if not settings.supabase_url:
        raise ApiError(503, "dependency_unavailable", "Authentication is not configured.")
    async with _jwks_lock:
        now = time.monotonic()
        if _jwks_cache and now < _jwks_cache[0]:
            return _jwks_cache[1]
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json")
                response.raise_for_status()
                keys = response.json().get("keys", [])
            if not isinstance(keys, list):
                raise ValueError("Invalid JWKS")
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise ApiError(503, "dependency_unavailable", "Authentication key service is unavailable.") from exc
        _jwks_cache = (now + _JWKS_TTL_SECONDS, keys)
        return keys


async def decode_access_token(token: str) -> dict[str, Any]:
    issuer = settings.issuer
    if not issuer:
        raise ApiError(503, "dependency_unavailable", "Authentication is not configured.")
    try:
        header = jwt.get_unverified_header(token)
        algorithm = header.get("alg")
        if settings.legacy_jwt_secret and settings.legacy_jwt_algorithm:
            if algorithm != settings.legacy_jwt_algorithm or algorithm != "HS256":
                raise jwt.InvalidAlgorithmError("Unexpected signing algorithm")
            key: Any = settings.legacy_jwt_secret
            algorithms = ["HS256"]
        else:
            if algorithm not in settings.jwt_algorithms or algorithm not in {"ES256", "RS256"}:
                raise jwt.InvalidAlgorithmError("Unexpected signing algorithm")
            kid = header.get("kid")
            jwk = next((item for item in await _jwks() if item.get("kid") == kid), None)
            if jwk is None:
                raise jwt.InvalidKeyError("Unknown signing key")
            key = PyJWK.from_dict(jwk, algorithm=algorithm).key
            algorithms = [algorithm]
        claims = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience="authenticated",
            issuer=issuer,
            options={"require": ["sub", "exp", "iss", "aud"]},
        )
        if not isinstance(claims.get("sub"), str) or not claims["sub"].strip():
            raise jwt.InvalidTokenError("Missing subject")
        return claims
    except ApiError:
        raise
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise ApiError(401, "invalid_token", "The access token is invalid or expired.") from exc


async def current_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict[str, Any]:
    cached = getattr(request.state, "edas_principal", None)
    if cached is not None:
        return cached
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ApiError(401, "authentication_required", "A bearer access token is required.")
    claims = await decode_access_token(credentials.credentials)
    request.state.edas_principal = claims
    return claims


def require_admin(claims: dict[str, Any]) -> str:
    app_metadata = claims.get("app_metadata")
    if not isinstance(app_metadata, dict) or app_metadata.get("edas_role") != "admin":
        raise ApiError(403, "forbidden", "Administrator access is required.")
    return claims["sub"]
