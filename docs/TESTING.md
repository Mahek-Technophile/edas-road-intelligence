# EDAS Testing Strategy

## Principles

Test the specified behavior, not an imagined detector. The manual reporting flow must work with no model weights installed. Tests must use synthetic fixtures and isolated test configuration; never require production credentials or expose service-role secrets. Tests are not considered passed until they have actually been run and their command output or CI result is recorded.

The repository currently contains no application source, dependency manifests, test configuration, migrations, or test cases. This document defines the plan; it does not claim any checks have run.

## Test layers

### Intelligence unit tests

- Haversine distances at known points, including points around Pune and zero distance; confirm meters and boundary behavior.
- Same category within the 25 m default matches; different category, outside radius, and repaired candidate do not.
- Independent reporter count does not increase for repeat submissions by the same reporter; different reporters do increase it.
- Repeated same-reporter submission resolves to the existing observation and does not inflate observation/confirmation semantics defined by the revised contract.
- Repaired hazard candidates route to a challenge and never change repaired status or its confirmation count; repeated challenger cannot inflate challenge count.
- Confidence follows `C = 0.5V + 0.3R + 0.2E`, is clamped/validated in `[0,1]`, and verification occurs at the defined `0.50` threshold. Use a controllable clock for recency tests.
- Detector interface returns `MODEL_NOT_CONFIGURED` when weights are absent and does not block manual reports.

### Backend/API contract tests

- `GET /health`, hazard list/detail, report creation, summary analytics, and status update conform to the shared API contract.
- Validate enum rejection, invalid UUIDs, invalid/out-of-range WGS84 coordinates, invalid radius, and missing/oversized input according to the agreed API limits.
- Check filtering and spatial query semantics, response timestamps, empty results, and stable error shape/status codes once specified.
- Verify no secret appears in API responses or logs and protected status changes reject unauthenticated/unauthorized callers according to the approved pilot policy.
- Verify report insertion, observation association, confirmation count and confidence persist consistently.
- Verify unauthenticated, invalid-token, non-admin, forged request-body role, and expired-token status changes fail closed; permitted admin update and audit event commit or roll back together.
- Verify signed upload authorization is short-lived and scoped; wrong bucket/path, wrong owner, unsupported type, oversize object and arbitrary evidence URL are rejected.
- Verify signed reads require authorized access and database rows contain only evidence metadata/path, not binary data or a durable public URL.
- Verify challenge review endpoints require admin authorization if included in the approved contract.

### Database and integration tests

- Apply migrations to a disposable Supabase-compatible PostgreSQL test instance; verify constraints, foreign keys, indexes, and enum/range checks.
- Submit repeated observations from one reporter and distinct reporters; assert observation retention policy and independent confirmation totals.
- Exercise concurrent nearby reports to detect duplicate hazard creation or inconsistent counts.
- Run parallel transactions at identical and near-cell-boundary locations; assert the aggregation lock plus unique constraints prevent duplicate hazards and duplicate reporter contributions, and that no updates are lost.
- Re-observe repaired hazards and verify the agreed challenge behavior without silently reopening the repaired row.
- Inject transaction failures between status update/audit insert and report/match/count steps; assert each operation rolls back atomically.
- Confirm private Storage bucket policy, metadata association, orphan cleanup path, and that image bytes never appear in PostgreSQL.
- Test both PostGIS query path and fallback path if both are supported.

### Frontend checks

- Run the production TypeScript/Vite build and lint/type checks configured by the project.
- Test API client handling of loading, empty, validation, network, and server errors.
- Verify report form validation, map filters and popups, dashboard summary, hazard detail, and status flow against API-shaped fixtures or a test API.
- Keep service-role credentials out of built assets; check public environment configuration contains no secrets.

### End-to-end acceptance scenario

Using an isolated database and clearly synthetic reporters, submit the three specified observations at the same pothole (12 m and 8 m offsets), including parallel requests. Assert one aggregated active hazard, three observations, three independent reporters, updated confidence, and verification at threshold according to the implemented formula. Retry one reporter and assert no inflation. Upload evidence through the signed path and verify only metadata is stored in PostgreSQL. Mark repaired through an authenticated admin, assert an audit event, then submit a subsequent observation and assert challenge creation without silent reopening. Assert non-admin status updates fail. Capture API/UI evidence and tear down fixtures after the run.

## Test data and environment

- Use deterministic fixtures, injected clock, and fixed coordinates. Clearly mark all demo and synthetic records.
- Keep local credentials in ignored environment files. `.env.example` contains placeholders only. Use a dedicated disposable database/project for integration tests; never point destructive fixtures at production.
- Avoid dependence on external tile servers or model downloads in automated tests. Stub map tiles/API edges where suitable; test detector-not-configured behavior without weights.

## Execution and reporting

After manifests and scripts exist, document exact commands here (expected layers: Python unit/API tests, frontend checks, migration/integration tests, and end-to-end tests). Until then, do not invent commands. For each run, record commit, environment, exact command, exit status, and summary; distinguish not run, failed, blocked, and passed. QA should run the full suite on the integrated branch and report observed output, not agent assumptions.
