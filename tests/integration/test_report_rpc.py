"""Database contract checks for the atomic EDAS report RPC.

Requires a disposable Supabase-compatible database with the migration already applied.
Writing is gated by two explicit environment variables.
"""
from __future__ import annotations

import os
import uuid

import pytest


@pytest.fixture
def database():
    dsn = os.getenv("EDAS_TEST_DATABASE_URL")
    if not dsn or os.getenv("EDAS_ALLOW_TEST_DATABASE_WRITES") != "1":
        pytest.skip("Set EDAS_TEST_DATABASE_URL and EDAS_ALLOW_TEST_DATABASE_WRITES=1 for disposable DB checks.")
    try:
        import psycopg
    except ImportError:
        pytest.skip("Local PostgreSQL driver is unavailable.")
    connection = psycopg.connect(dsn)
    try:
        yield connection
    finally:
        connection.rollback()
        connection.close()


def submit(connection, lat: float, lon: float, subject: str):
    with connection.cursor() as cursor:
        cursor.execute(
            """SELECT public.edas_submit_hazard_report(
                 'pothole',%s,%s,'high','synthetic integration fixture',%s,NULL,NULL)""",
            (lat, lon, subject),
        )
        return cursor.fetchone()[0]


def test_duplicate_reporter_does_not_inflate_and_second_report_verifies(database):
    first_subject, second_subject = f"test-{uuid.uuid4()}", f"test-{uuid.uuid4()}"
    first = submit(database, 18.5204, 73.8567, first_subject)
    duplicate = submit(database, 18.5204, 73.8567, first_subject)
    assert first["outcome"] == "created"
    assert duplicate["outcome"] == "duplicate"
    assert duplicate["observation_id"] == first["observation_id"]
    assert duplicate["confirmation_count"] == 1
    second = submit(database, 18.5204, 73.8568, second_subject)
    assert second["hazard_id"] == first["hazard_id"]
    assert second["matched_existing_hazard"] is True
    assert second["confirmation_count"] == 2
    assert second["observation_count"] == 2
    assert second["confidence_score"] >= 0.50
    assert second["status"] == "verified"


def test_repaired_hazard_receives_challenge_and_acceptance_creates_successor(database):
    subject = f"test-{uuid.uuid4()}"
    with database.cursor() as cursor:
        cursor.execute(
            """INSERT INTO public.hazards(hazard_type,location,severity,status,confidence_score,
                       confirmation_count,first_seen_at,last_seen_at)
               VALUES('pothole',extensions.ST_SetSRID(extensions.ST_MakePoint(73.8567,18.5204),4326)::extensions.geography,
                      'high','repaired',0.7,1,now(),now()) RETURNING id"""
        )
        repaired_id = cursor.fetchone()[0]
    result = submit(database, 18.5204, 73.8567, subject)
    assert result["outcome"] == "challenge_submitted"
    assert result["hazard_id"] == str(repaired_id)
    assert result["status"] == "repaired"
    with database.cursor() as cursor:
        cursor.execute(
            "SELECT public.edas_resolve_hazard_challenge(%s,'accepted',%s,NULL)",
            (result["challenge_id"], f"admin-{uuid.uuid4()}"),
        )
        resolved = cursor.fetchone()[0]
        assert resolved["status"] == "accepted"
        assert resolved["successor_hazard_id"]
        cursor.execute("SELECT status FROM public.hazards WHERE id=%s", (repaired_id,))
        assert cursor.fetchone()[0] == "repaired"
        cursor.execute("SELECT status,successor_of_hazard_id FROM public.hazards WHERE id=%s",
                       (resolved["successor_hazard_id"],))
        successor = cursor.fetchone()
        assert successor == ("reported", repaired_id)
