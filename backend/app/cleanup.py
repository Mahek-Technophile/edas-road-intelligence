from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx
import psycopg
from psycopg.rows import dict_row

from app.core.config import settings


async def cleanup_evidence() -> int:
    dsn = settings.require_database_url()
    base, key = settings.require_storage()
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.evidence_retention_days)
    async with await psycopg.AsyncConnection.connect(dsn, row_factory=dict_row) as connection:
        rows = await (await connection.execute(
            """SELECT id,bucket,object_path FROM public.evidence_objects
                WHERE (lifecycle_state='pending' AND expires_at<=now())
                   OR (lifecycle_state='attached' AND created_at<=%s)
                ORDER BY created_at LIMIT 500""",
            (cutoff,),
        )).fetchall()
        removed = 0
        async with httpx.AsyncClient(timeout=20) as client:
            for row in rows:
                try:
                    response = await client.delete(
                        f"{base}/storage/v1/object/{quote(row['bucket'], safe='')}",
                        headers={"apikey": key, "authorization": f"Bearer {key}", "content-type": "application/json"},
                        json={"prefixes": [row["object_path"]]},
                    )
                    if response.status_code not in {200, 204, 404}:
                        continue
                    await connection.execute(
                        """UPDATE public.evidence_objects
                              SET lifecycle_state='deleted'
                            WHERE id=%s""",
                        (row["id"],),
                    )
                    removed += 1
                except httpx.HTTPError:
                    # Leave metadata unchanged so a later scheduled run can retry.
                    continue
        await connection.commit()
        return removed


if __name__ == "__main__":
    print(asyncio.run(cleanup_evidence()))
