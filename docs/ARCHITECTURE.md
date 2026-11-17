# EDAS Final Architecture and Readiness

## 1. Scope and repository assessment

This plan is for the Pune pilot. It leaves `MASTER_SPEC.md` unchanged. `API_CONTRACT.md` is now version 2 with concrete endpoint schemas and explicit MVP assumptions.

The repository remains a scaffold: top-level `backend/`, `frontend/`, `scripts/`, `supabase/migrations/`, `tests/{contract,e2e,integration}/`, and `docs/`. There are no application source files, migrations, dependency manifests, or test cases yet.

## 2. System architecture

```text
React + TypeScript + Vite + Leaflet
    | HTTPS JSON /api/v1 + user JWT
    v
FastAPI -> JWT/admin authorization -> service/domain layer
    |                                 |-- deterministic road intelligence
    |                                 |-- Supabase Storage signed URL service
    +-> PostgreSQL transaction/RPC -> hazards, observations, challenges,
                                      evidence metadata, status audit
Supabase private Storage bucket holds image binaries
```

The browser does not receive a service-role key and does not write directly to PostgreSQL. FastAPI derives reporter identity from validated JWT `sub`; client-supplied reporter IDs and roles are not trusted. Image bytes live only in private Supabase Storage. The API stores object metadata/path only. Detector absence returns `MODEL_NOT_CONFIGURED`; manual reporting is independent.

## 3. Final database schema

The implementation migrations must define these tables and constraints:

| Table | Columns and constraints |
|---|---|
| `hazards` | `id UUID PK`; constrained hazard type, severity and status; `location geography(Point,4326)` (or explicit documented fallback); `confidence_score REAL CHECK 0..1`; `confirmation_count INTEGER >= 0`; timestamps; nullable `successor_of_hazard_id` self-FK. Add GiST location index, plus status/type/last-seen indexes. |
| `hazard_observations` | `id UUID PK`; `hazard_id FK`; `reporter_subject TEXT`; observed coordinates/type/severity/source; `disposition confirmation|challenge`; description; created time; synthetic provenance. Partial unique indexes on `(hazard_id, reporter_subject)` separately for each disposition. Confirmation count is unique confirmation observations only. |
| `hazard_challenges` | `id UUID PK`; repaired hazard FK; unique triggering observation FK; challenger subject; status `pending|accepted|rejected`; submitted/resolved times; resolver subject/note; nullable successor hazard FK. Unique `(repaired_hazard_id, challenger_subject)` and state/successor consistency checks. |
| `evidence_objects` | `id UUID PK`; uploader subject; bucket/object path unique; content type, byte size, checksum; created/expiry/attached times; lifecycle `pending|attached|deleted`; nullable unique observation FK while pending. API joins this association to expose `evidence_id`; no circular FK is needed. Contains no binary. |
| `hazard_status_events` | `id UUID PK`; hazard FK; old/new status; admin subject; optional reason; timestamp. Append-only audit trail. |

`observation_count` is the number of independent observations and can be derived from rows or maintained transactionally; duplicate HTTP submissions are not observations. Status changes and audit insertions are atomic. Challenge acceptance creates a successor hazard; the repaired hazard stays repaired. The challenge observation is reassigned to the successor and changed to confirmation within the same review transaction; the challenge row retains its original repaired hazard and observation reference for audit.

### Migration sequence

1. PostGIS has been verified in the EDAS Supabase Mumbai project as extension `postgis` version `3.3.7` in schema `extensions`. Use PostGIS geography and spatial indexing for the pilot migrations; confirm the migration role can access the extension and required functions when applying migrations.
2. Create `hazards`, `evidence_objects`, and `hazard_observations` with FK/check constraints and uniqueness indexes.
3. Create `hazard_challenges` and `hazard_status_events` with lifecycle constraints and indexes.
4. Add report-ingestion and challenge-review RPCs, grants, and least-privilege policies. Revoke direct client writes to base tables.
5. Configure the private Storage bucket/policies and cleanup job through versioned Supabase configuration where supported; verify in a disposable project.
6. Apply the exact migration set to a disposable Supabase-compatible database, run migration/integration tests, then promote to pilot.

## 4. Atomic concurrency strategy

All report writes go through one Postgres RPC transaction. It obtains `pg_advisory_xact_lock` on a fixed EDAS aggregation key, checks duplicate reporter/idempotency, queries same-type active candidates within 25 m, and selects by distance then UUID. If none, it checks repaired candidates and routes to challenge; if neither, it creates a hazard. The transaction inserts observation/challenge, attaches pending evidence if supplied, updates count/confidence/timestamps, and commits. Unique indexes provide a second defense. On serialization/unique conflict, rollback and retry a small bounded number of times; after exhaustion return `409`. No application-side unlocked SELECT-then-INSERT is allowed. The global lock is a deliberate low-volume Pune pilot tradeoff; measure before replacing it with finer spatial locks.

## 5. Authentication and authorization

Validate Supabase access JWT signature using configured project JWKS/asymmetric key and allowed algorithm; require configured issuer `https://<project-ref>.supabase.co/auth/v1`, audience `authenticated`, valid `exp`/`nbf`, and non-empty `sub`. All routes except health require a bearer token. Status/challenge review requires trusted `app_metadata.edas_role == "admin"`; `user_metadata`, request body, client UI, and service-role claims are never an authorization source. Provision claims only through a protected server-side Auth Admin API/custom token hook. Fail closed. Stateless token role changes may not take effect until token refresh/expiry; emergency revocation policy is an operational concern. Never put secrets in frontend environment/builds.

## 6. Storage defaults and their limits

Contract v2 proposes configurable MVP defaults: private `road-evidence` bucket; JPEG/PNG/WebP only; 10 MiB max; inspect actual file signatures as well as declared MIME type; Supabase signed upload URL provider lifetime (currently documented as 2 hours), signed read TTL 60 seconds; retention 365 days from creation. Do not claim a shorter upload TTL unless a verified proxy enforces it. Signed reads are limited to uploader/admin. FastAPI creates opaque object keys and validates ownership, state, metadata and size before associating an upload. A scheduled cleanup removes expired pending/orphaned objects and applies retention. These defaults are prototype assumptions, not production security guarantees; rate limiting, malware scanning, image redaction, backup deletion behavior, and legal/privacy review require deployment/product work.

## 7. PostGIS verification status

PostGIS is **verified** in the target EDAS Supabase Mumbai project: extension `postgis`, version `3.3.7`, schema `extensions`, confirmed by direct SQL verification. Use `geography(Point,4326)`, `ST_DWithin`, and a GiST location index in the pilot schema. At migration time, confirm the migration role can resolve the extension's types and functions from `extensions` (including the configured search path or schema-qualified references), and verify the spatial query/index path in the disposable database. The repository does not store project credentials or connection details. If a future deployment target lacks PostGIS, use a tested Haversine candidate path with latitude/longitude indexes under the same transaction lock, and document the expected scale limitation.

The reported direct SQL verification returned `postgis`, version `3.3.7`, schema `extensions`. Validate migration-role access and the geography/query/index path in a disposable migration before applying the schema to the pilot dataset. Do not silently assume extension availability on other deployment targets.

## 8. Integration dependencies and execution order

1. Supply project reference/configuration securely; provision admin claim through trusted server-side control; use the verified PostGIS 3.3.7 installation in schema `extensions` and validate migration-role access.
2. Finalize configuration values (bucket name, upload limits/retention) from contract v2 defaults; create branch/worktree ownership plan.
3. Agent 1 implements migrations, bucket policy, atomic RPC, JWT validation, API and storage integration. Agent 2 implements pure deterministic intelligence interface/tests. Agent 3 implements contract v2 client/UI. Agent 4 prepares/runs integration and E2E suites. Do not overlap ownership described in `AGENT_OWNERSHIP.md`.
4. Integrate schema and domain interface, then backend transaction/auth/storage routes, then frontend.
5. Run concurrency, duplicate, challenge review, Storage, auth/audit, contract, frontend, and full end-to-end checks on integrated branch. Record actual commands and results.

## 9. Remaining blockers and prototype assumptions

Product-level API and challenge decisions are specified in contract v2. Before deployment, the operator still must provide the actual Supabase project reference/JWT verification config and credentials, confirm migration-role access to verified PostGIS, provision trusted admins, configure Storage policies/cleanup, and choose whether to retain the stated MVP limits. Supabase currently documents its signed upload URL lifetime as two hours; a shorter TTL would require a verified proxy. Defaults are configurable and must not be presented as production guarantees. Rate/abuse defenses and privacy review are outside this prototype contract. No application code has been implemented and no agents have been launched.
