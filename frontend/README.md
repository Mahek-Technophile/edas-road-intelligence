# EDAS Frontend

React + TypeScript + Vite dashboard for the EDAS Pune pilot. The client uses only the `/api/v1` contract; it never connects directly to Supabase.

## Run locally

1. Copy `.env.example` to `.env.local` and set `VITE_EDAS_API_BASE` to the FastAPI `/api/v1` base URL.
2. Run `npm install`.
3. Run `npm run dev`.

A Supabase Auth access token must be supplied through **Connect to EDAS**. This prototype has no login endpoint in API contract v2. The token is retained in `sessionStorage` for the current browser tab and sent as a bearer token to the configured API. The API applies admin authorization for status changes and challenge review.

Evidence uploads use the contract's signed upload ticket and direct raw-byte `PUT` to its returned URL. Only JPEG, PNG, and WebP up to 10 MiB are accepted by the client; the API remains authoritative for validation.

Map tiles use OpenStreetMap. External tile access is not required for automated checks; map API data can be fixture-driven when suitable frontend tests are added.
