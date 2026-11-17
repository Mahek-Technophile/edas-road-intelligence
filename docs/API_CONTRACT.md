# EDAS API Contract

Contract version: 2 (MVP proposal; replaces the earlier illustrative contract). Base path: `/api/v1`. All JSON uses UTF-8. Timestamps are RFC 3339 UTC. Coordinates are WGS84 decimal degrees. UUIDs are lowercase canonical UUID strings.

## Prototype assumptions and security boundaries

- Supabase Auth bearer access tokens are required for all endpoints except `GET /health`. Each reporter's stable ID is derived from validated JWT `sub`; clients cannot choose `reporter_id`. Synthetic demo vehicles are separate seeded test users, never a client-controlled production mode.
- Hazard reads and summary are available to authenticated users. Evidence signed reads are available to the uploader or an admin. This is an MVP privacy policy, not a production privacy review.
- Admin is determined only by a trusted `app_metadata.edas_role == "admin"` claim in a validated access token. Supabase documents `user_metadata` as user-editable and `app_metadata` as not user-editable ([JWT claims](https://supabase.com/docs/guides/auth/jwt-fields), [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)). `user_metadata`, request fields, and frontend state are not authorization sources. A token reflects role state until expiry; revocation propagation and emergency revocation are deployment responsibilities.
- Supabase signed upload URL lifetime is provider-controlled and currently documented as 2 hours ([signed uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)); do not claim a 300-second upload TTL unless an alternative proxy/issuer is deployed and verified. Signed read URL TTL defaults to 60 seconds and is configurable. These are MVP defaults, not security guarantees.
- Upload default max size is 10 MiB. Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`. Validate declared type and inspect file signatures; reject mismatch. Limits are configurable and require product confirmation before public launch.
- Private bucket name defaults to `road-evidence`. Default retention is 365 days after upload, configurable. No public bucket/object URLs. Retention requires a scheduled deletion process and backup lifecycle review.
- API rate limits, abuse controls, image redaction, malware scanning, and production privacy/legal review are deployment requirements not supplied by this contract.

## Shared enums

- `hazard_type`: `pothole | road_damage | open_manhole | waterlogging | obstruction`
- `severity`: `low | medium | high | critical`
- `hazard_status`: `reported | verified | assigned | repaired`
- `source`: `manual | ai`
- `challenge_status`: `pending | accepted | rejected`

## Authentication

Send `Authorization: Bearer <Supabase access token>`. The API validates the JWT signature using the configured Supabase project's supported verification method: JWKS for asymmetric signing, or a backend-held legacy JWT secret only if that is the project's configured signing method. Pin an allowed algorithm; require issuer `https://<project-ref>.supabase.co/auth/v1`, audience `authenticated`, `exp`, `nbf` when present, and non-empty `sub`. Never accept the service-role token from a browser. The project reference, issuer, audience, and key source come from deployment configuration; they are not guessed from request content.

Admin endpoints additionally require `app_metadata.edas_role` exactly `admin`. Provision/change this claim only through trusted server-side Supabase Auth Admin API or a protected custom access-token hook. Do not accept `user_metadata.edas_role`, user-editable claims, or a caller-supplied role. Unknown/missing claims deny access. Requiring fresh role state (e.g. short token lifetime/re-auth) is an operational policy, not guaranteed by stateless JWT validation.

## Common data schemas

### Hazard

```json
{
  "id": "uuid",
  "hazard_type": "pothole",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "severity": "high",
  "confidence_score": 0.72,
  "confirmation_count": 3,
  "observation_count": 3,
  "status": "verified",
  "description": "Large pothole near junction",
  "first_seen_at": "2026-11-17T10:00:00Z",
  "last_seen_at": "2026-11-17T10:10:00Z",
  "created_at": "2026-11-17T10:00:00Z",
  "updated_at": "2026-11-17T10:10:00Z",
  "successor_of_hazard_id": null
}
```

`confirmation_count` counts distinct authenticated reporters contributing one independent observation to this hazard. `observation_count` counts independent observations, not duplicate HTTP submissions. Evidence binaries are never returned by the API.

### Observation

```json
{
  "id": "uuid",
  "hazard_id": "uuid",
  "hazard_type": "pothole",
  "latitude": 18.5204,
  "longitude": 73.8567,
  "severity": "high",
  "source": "manual",
  "description": "Large pothole near junction",
  "evidence_id": "uuid-or-null",
  "disposition": "confirmation",
  "created_at": "2026-11-17T10:00:00Z"
}
```

## Endpoints

### GET `/health`

No auth. `200`: `{"status":"ok"}`. This is process liveness only, not a database readiness guarantee.

### POST `/evidence/upload-url`

Authenticated. Request:

```json
{"content_type":"image/jpeg","size_bytes":345678}
```

Response `201`:

```json
{
  "evidence_id":"uuid",
  "bucket":"road-evidence",
  "object_path":"<server-generated-opaque-path>",
  "upload_url":"https://<supabase-storage-signed-upload-url-including-token>",
  "expires_at":"2026-11-17T12:00:00Z",
  "required_headers":{"content-type":"image/jpeg"}
}
```

Path is generated by server and bound to the JWT `sub`; client cannot select bucket/path. Client uploads bytes with HTTP `PUT` to the returned `upload_url` using the required headers and raw binary request body. The ticket creates a `pending` evidence metadata row. `upsert` is disabled. A successful upload does not yet associate evidence with a report. Supabase documents signed upload URLs as valid for 2 hours; if deployment needs a shorter exposure window, route the upload through a service that can enforce it rather than representing the provider URL as 5 minutes.

Errors: `400` invalid body, `401` missing/invalid token, `413` declared size exceeds configured limit, `415` unsupported/mismatched media type, `429` rate limit, `503` Storage unavailable.

### POST `/hazard-reports`

Authenticated. Request:

```json
{
  "hazard_type":"pothole",
  "latitude":18.5204,
  "longitude":73.8567,
  "severity":"high",
  "description":"Large pothole near junction",
  "evidence_id":"uuid-or-null",
  "source":"manual"
}
```

`reporter_id` is not accepted; use JWT `sub`. `evidence_id` must be an uploaded, unexpired/unattached evidence object owned by that subject. `source=ai` is accepted only from a trusted server-side detector integration; ordinary clients may send `manual` only. Coordinates must be finite and within latitude `[-90,90]`, longitude `[-180,180]`. Description max 1000 Unicode characters. Unknown fields rejected.

New confirmation response `201`:

```json
{
  "outcome":"created",
  "hazard_id":"uuid",
  "observation_id":"uuid",
  "challenge_id":null,
  "duplicate":false,
  "matched_existing_hazard":false,
  "confirmation_count":1,
  "observation_count":1,
  "confidence_score":0.42,
  "status":"reported"
}
```

If same reporter already contributed to matched active hazard, return `200` with the existing observation ID, current counts/state, `duplicate:true`, `outcome:"duplicate"`; do not create another observation or increase count/score. This is application idempotency by `(hazard_id, reporter_id)`, not arbitrary request replay caching.

If no eligible active hazard matches but a repaired hazard of same type is within 25 m, record the observation with disposition `challenge`, add a pending challenge, and return `202`:

```json
{
  "outcome":"challenge_submitted",
  "hazard_id":"repaired-hazard-uuid",
  "observation_id":"uuid",
  "challenge_id":"uuid",
  "duplicate":false,
  "matched_existing_hazard":false,
  "confirmation_count":0,
  "observation_count":0,
  "confidence_score":null,
  "status":"repaired"
}
```

Repeated challenge by same reporter returns `200`, `outcome:"duplicate_challenge"`, same IDs, `duplicate:true`; no new challenge contribution. Repaired hazard status never changes during submission. If both active and repaired candidates match, eligible active candidate takes precedence; within each set choose shortest distance then UUID.

Other errors: `400` invalid body/enum, `401` auth, `403` AI source/evidence ownership denied, `404` unknown evidence, `409` evidence already attached/expired or transaction conflict after bounded retry, `413` body too large, `422` coordinate/schema validation, `429` rate limit, `503` database/storage dependency unavailable.

### GET `/hazards`

Authenticated. Query parameters:

- `hazard_type`, `severity`, `status`: enum filters.
- `latitude`, `longitude`, `radius_m`: all three required together; finite WGS84 center; `radius_m` in `(0,50000]`.
- `limit`: default 50, range 1–100.
- `offset`: default 0, range 0–10000.
- `sort`: `last_seen_desc` default or `confidence_desc`.

Response `200`:

```json
{
  "items":[{"id":"uuid","hazard_type":"pothole","latitude":18.5204,"longitude":73.8567,"severity":"high","confidence_score":0.72,"confirmation_count":3,"observation_count":3,"status":"verified","description":"Large pothole near junction","first_seen_at":"2026-11-17T10:00:00Z","last_seen_at":"2026-11-17T10:10:00Z","created_at":"2026-11-17T10:00:00Z","updated_at":"2026-11-17T10:10:00Z","successor_of_hazard_id":null}],
  "total":1,
  "limit":50,
  "offset":0
}
```

`total` is the count after filters and before pagination. Repaired hazards are included unless filtered. Stable secondary ordering is hazard UUID ascending. Errors: `400` invalid/incomplete spatial filters, `401`, `422` out-of-range values.

### GET `/hazards/{hazard_id}`

Authenticated. `200`:

```json
{
  "hazard":{"id":"uuid","hazard_type":"pothole","latitude":18.5204,"longitude":73.8567,"severity":"high","confidence_score":0.72,"confirmation_count":3,"observation_count":3,"status":"verified","description":"Large pothole near junction","first_seen_at":"2026-11-17T10:00:00Z","last_seen_at":"2026-11-17T10:10:00Z","created_at":"2026-11-17T10:00:00Z","updated_at":"2026-11-17T10:10:00Z","successor_of_hazard_id":null},
  "observations":[{"id":"uuid","hazard_id":"uuid","hazard_type":"pothole","latitude":18.5204,"longitude":73.8567,"severity":"high","source":"manual","description":"Large pothole near junction","evidence_id":"uuid-or-null","disposition":"confirmation","created_at":"2026-11-17T10:00:00Z"}],
  "challenges":[]
}
```

Challenges include `id`, `status`, `submitted_at`, `resolved_at`, and `resolution_note` (note visible to authenticated users; no challenger identity exposed). Evidence is represented by `evidence_id`; request a short-lived URL separately. Errors: `401`, `404`.

### GET `/evidence/{evidence_id}/signed-url`

Authenticated uploader or admin only. `200`:

```json
{"evidence_id":"uuid","read_url":"https://<short-lived-supabase-storage-signed-url>","expires_at":"2026-11-17T10:01:00Z"}
```

Errors: `401`, `403`, `404`, `503`. URLs expire after configured TTL and must not be stored in the database or logs.

### GET `/analytics/summary`

Authenticated. Counts cover all hazards in the pilot dataset, including repaired. `200`:

```json
{
  "total_hazards":12,
  "verified_hazards":5,
  "critical_hazards":2,
  "repaired_hazards":1,
  "hazards_by_type":{"pothole":7,"road_damage":2,"open_manhole":1,"waterlogging":1,"obstruction":1},
  "hazards_by_status":{"reported":4,"verified":5,"assigned":2,"repaired":1},
  "pending_challenges":1
}
```

All enum keys are present with zero values when empty. Errors: `401`, `503`.

### PATCH `/hazards/{hazard_id}/status`

Admin JWT required. Request:

```json
{"status":"assigned","reason":"Municipal crew accepted work order"}
```

`reason` optional, max 1000 characters. Allowed transitions: `reported -> verified`, `verified -> assigned`, `assigned -> repaired`; same-state request returns `200` with unchanged hazard and no new event. No backwards transition. Repair challenges are resolved through their own route; they never implicitly reopen a hazard.

Response `200`:

```json
{"hazard":{"id":"uuid","status":"assigned","updated_at":"2026-11-17T10:20:00Z"},"status_event_id":"uuid-or-null"}
```

Errors: `400` invalid enum/body, `401` missing/invalid/expired token, `403` valid non-admin, `404` hazard absent, `409` disallowed transition or concurrent state change, `422` invalid reason.

### PATCH `/hazard-challenges/{challenge_id}`

Admin JWT required. Request:

```json
{"status":"accepted","resolution_note":"Confirmed by field review"}
```

`status` must be `accepted` or `rejected`; note optional, max 1000 chars. Only pending challenges can be resolved. Accepting creates a new active hazard as a successor; it does not mutate the repaired hazard. The new hazard begins `reported`, copies challenge location/type, and links `successor_of_hazard_id` to the repaired hazard. The challenge observation becomes the first observation of the successor, and its original challenge record remains for audit. Atomic transaction with challenge resolution. Response `200`:

```json
{"challenge_id":"uuid","status":"accepted","resolved_at":"2026-11-17T11:00:00Z","successor_hazard_id":"uuid"}
```

For rejected, `successor_hazard_id` is null. Errors: `400`, `401`, `403`, `404`, `409` if already resolved/concurrent conflict, `422` invalid note.

## Error format

All errors use:

```json
{
  "error": {
    "code":"invalid_request",
    "message":"One or more fields are invalid.",
    "details":[{"field":"latitude","issue":"must be between -90 and 90"}],
    "request_id":"uuid"
  }
}
```

`details` may be an empty array and must not contain tokens, signed URLs, secrets, SQL, or internal stack traces. Common codes: `invalid_request`, `authentication_required`, `invalid_token`, `forbidden`, `not_found`, `conflict`, `payload_too_large`, `unsupported_media_type`, `rate_limited`, `dependency_unavailable`, `internal_error`. Framework validation errors are normalized to this schema. Responses also set a request/correlation ID header. No raw exception text is returned.

## Database and transaction requirements

- `hazards`: UUID PK, enum checks, geography(Point,4326), GiST index, non-null severity/status, confidence `[0,1]`, independent confirmation count, `successor_of_hazard_id` self-FK nullable, first/last/created/updated UTC timestamps.
- `hazard_observations`: UUID PK, hazard FK, reporter subject, location, type/severity/source, description, disposition (`confirmation|challenge`), timestamp. Partial unique index on `(hazard_id, reporter_subject)` where disposition=`confirmation`; one challenge per `(hazard_id, reporter_subject)` where disposition=`challenge`. Challenge confirmation count is excluded from repaired hazard totals.
- `hazard_challenges`: UUID PK, repaired hazard FK, unique triggering observation FK, challenger subject, unique `(repaired_hazard_id, challenger_subject)`, status, submission/resolution timestamps, resolver subject, note, successor hazard FK nullable. Enforce status/successor consistency.
- `evidence_objects`: UUID PK, uploader subject, bucket/path unique, MIME/size/checksum, created/expiry/attached timestamps, lifecycle state (`pending|attached|deleted`), nullable unique observation FK until report transaction. Observation evidence IDs are returned by joining this association; no circular FK is required.
- `hazard_status_events`: UUID PK, hazard FK, old/new state, admin subject, reason, timestamp.

For report creation, a single Postgres RPC transaction obtains `pg_advisory_xact_lock` on a fixed EDAS aggregation key, checks idempotency/eligible active candidates, locks selected hazard row, creates aggregate if absent, inserts observation subject to partial uniqueness, attaches evidence, recomputes count/confidence, and commits. Repaired candidate challenge creation uses the same lock and a separate partial uniqueness path. On unique/serialization conflict, rollback and retry the whole operation a small bounded number of times; return a conflict after exhaustion. All writers must call this RPC; revoke direct client table write grants. Use PostGIS `ST_DWithin(geography, geography, 25)` with GiST index. Never perform a separate unlocked SELECT then INSERT from application code.

## PostGIS capability check

PostGIS availability in the target EDAS Supabase project is **not verified**: this repository has no project reference, database URL, Supabase config, migration, or project connection available to inspect. Supabase documents PostGIS as an enableable extension ([PostGIS guide](https://supabase.com/docs/guides/database/extensions/postgis)), but that does not prove it is enabled in this specific project. Before migration execution, an authorized operator must run `SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis';` against the target project and confirm Dashboard → Database → Extensions shows it enabled. If absent, enable with `CREATE EXTENSION postgis SCHEMA extensions;` if allowed, then verify geography type, `ST_DWithin`, and GiST operator/index support. If unavailable, use a tested Haversine candidate path with latitude/longitude indexes and the same transaction advisory lock; document that larger datasets may require PostGIS. Do not assume PostGIS in application startup.
