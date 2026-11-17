# EDAS QA harness

This harness targets API contract v2 and is opt-in. The live tests are read-only
except the E2E lifecycle/concurrency cases, which create synthetic hazards,
observations, status events, challenges and a successor hazard. No cleanup API is
defined by contract v2, so use a dedicated disposable Supabase-compatible project
and remove its fixtures through an approved reset/cleanup procedure after the run.

## Required environment

Use environment variables from a secret manager or local ignored environment;
never commit token values. Do not point these tests at the pilot or production.

- `EDAS_TEST_ENV=disposable` is a required safety gate.
- `EDAS_API_BASE_URL` is the origin, for example `http://127.0.0.1:8000` (without
  `/api/v1`).
- `EDAS_TEST_USER_TOKEN`: synthetic non-admin token for contract auth checks.
- `EDAS_TEST_ADMIN_TOKEN`: synthetic admin token carrying trusted
  `app_metadata.edas_role=admin` for status/challenge review.
- `EDAS_TEST_VEHICLE_A_TOKEN` through `EDAS_TEST_VEHICLE_D_TOKEN`: four distinct
  synthetic non-admin subjects for independent reporter/challenge behavior.
- Python and `pytest` must be installed in the QA environment.

Tokens should be short lived and scoped to the disposable test project. The tests
never accept reporter IDs from the client; distinct JWT `sub` claims supply the
independent synthetic subjects.

## Run

From the repository root in this worktree, run:

```powershell
./scripts/qa/run-qa.ps1
```

Or execute only read/validation contract tests:

```powershell
python -m pytest -q tests/contract
```

The E2E test exercises three nearby reporters, a repeat report from one subject,
forward admin status transitions, a challenge to a repaired hazard, challenge
acceptance/successor creation, and concurrent first reports from three synthetic
subjects. It expects repeated test runs to use a disposable database or a reset
dataset because the API has no fixture deletion endpoint.

## Coverage and dependencies

The harness can verify HTTP auth, JSON/error envelopes, enum maps, input
validation, upload-ticket MIME/size rejections, duplicates, aggregation,
authorization, repaired challenge behavior and concurrent aggregation when the
corresponding services and tokens are configured. Migration constraints,
PostGIS/GiST query plans, private Storage policies, object signature inspection,
database rollback injection, and audit persistence need direct disposable
PostgreSQL/Supabase integration access; this API-only harness does not claim those
checks. Report them separately from passed/not-run API checks.
