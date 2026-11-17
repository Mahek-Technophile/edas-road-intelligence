from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    supabase_url: str | None
    service_role_key: str | None
    jwt_algorithms: tuple[str, ...]
    legacy_jwt_secret: str | None
    legacy_jwt_algorithm: str | None
    evidence_bucket: str
    evidence_max_size_bytes: int
    evidence_retention_days: int
    signed_read_ttl_seconds: int

    @classmethod
    def load(cls) -> "Settings":
        algorithms = tuple(
            item.strip()
            for item in os.getenv("SUPABASE_JWT_ALGORITHMS", "ES256,RS256").split(",")
            if item.strip()
        )
        return cls(
            database_url=os.getenv("DATABASE_URL"),
            supabase_url=os.getenv("SUPABASE_URL", "").rstrip("/") or None,
            service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            jwt_algorithms=algorithms,
            legacy_jwt_secret=os.getenv("SUPABASE_JWT_SECRET"),
            legacy_jwt_algorithm=os.getenv("SUPABASE_JWT_ALGORITHM"),
            evidence_bucket=os.getenv("EDAS_EVIDENCE_BUCKET", "road-evidence"),
            evidence_max_size_bytes=int(os.getenv("EDAS_EVIDENCE_MAX_SIZE_BYTES", str(10 * 1024 * 1024))),
            evidence_retention_days=int(os.getenv("EDAS_EVIDENCE_RETENTION_DAYS", "365")),
            signed_read_ttl_seconds=int(os.getenv("EDAS_SIGNED_READ_TTL_SECONDS", "60")),
        )

    @property
    def issuer(self) -> str | None:
        return f"{self.supabase_url}/auth/v1" if self.supabase_url else None

    def require_database_url(self) -> str:
        if not self.database_url:
            raise RuntimeError("DATABASE_URL is not configured")
        return self.database_url

    def require_storage(self) -> tuple[str, str]:
        if not self.supabase_url or not self.service_role_key:
            raise RuntimeError("Supabase Storage server configuration is incomplete")
        return self.supabase_url, self.service_role_key


settings = Settings.load()
