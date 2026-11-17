# EDAS Agent Ownership and Worktree Plan

## Coordination rules

Implementation starts only after explicit approval. Each implementation agent works in its own isolated Git worktree/branch. The integration lead owns integration and shared-interface decisions. Agents must not edit another agent's owned files. Shared API contract, database schema, and cross-cutting configuration changes require a proposal to the integration lead before editing. Never commit credentials or real user/driver identities. Do not claim an AI detector works without compatible configured model weights.

## File ownership

| Role | Exclusive ownership | Deliverables |
|---|---|---|
| Agent 1 — Backend and Supabase | `backend/` excluding `backend/intelligence/`, `supabase/migrations/`, backend-specific tests under `tests/contract/` and `tests/integration/` | FastAPI routes/auth, Storage signing and validation, repository/RPC, migrations, constraints, audit/challenge persistence and API tests |
| Agent 2 — Road Intelligence Engine | `backend/intelligence/`, intelligence unit tests under `backend/tests/` or a dedicated `tests/intelligence/` | Pure matching rules, deterministic tie-breaking contract, confidence calculation, repaired-hazard challenge disposition interface, detector interface with `MODEL_NOT_CONFIGURED` behavior |
| Agent 3 — Frontend and Dashboard | `frontend/` | Responsive dashboard, map, filters, report form, detail view, API client, loading/empty/error states and frontend build checks |
| Agent 4 — QA and Integration Testing | `tests/e2e/`, shared test reports and integration harness files explicitly assigned by lead | Contract compatibility checks, end-to-end scenarios, integration plan/results and reproducible test instructions |
| Integration lead | Shared docs and integration-only files, including `docs/API_CONTRACT.md` when an approved revision is needed | Interface decisions, branch integration, conflict resolution and final acceptance review |

The current repository has no test framework configuration or source files. Before agents start, the lead must finalize the exact shared test paths and intelligence package placement. If Agent 1 and Agent 2 require edits under `backend/`, preserve ownership by placing the engine under the dedicated `backend/intelligence/` boundary and excluding it from Agent 1 ownership. Agent 2 owns only that subdirectory and its tests; Agent 1 owns the remaining backend. QA does not alter application behavior to make a test pass; defects go to the owning agent.

## Branch and integration protocol

1. Create one task branch/worktree per agent from the same approved baseline; record branch names and owners in the task tracker.
2. Keep commits scoped to owned files. Do not merge another agent's branch into an agent worktree.
3. The lead integrates in this order: migrations/domain types, intelligence interface, backend routes, frontend client, then QA harness. Resolve contract changes centrally before dependent merges.
4. Require each agent to report changed paths, assumptions, commands run, actual results, and known gaps. QA independently runs the agreed suite on the integrated branch.
5. Do not report test success without captured command output or CI evidence. Keep synthetic demo records labeled.

## Shared boundary agreements

- `docs/API_CONTRACT.md` remains the frontend/backend source of truth until a reviewed revision is approved.
- Database migrations are owned by Agent 1; intelligence does not add schema changes independently.
- Agent 2 publishes a small documented domain interface for Agent 1 to call. Agent 1 owns HTTP/Pydantic adaptation, transaction-safe aggregation RPC, persistence, auth, and Storage integration.
- Agent 3 consumes only the API contract and does not access Supabase directly.
- Agent 4 owns test orchestration, not product implementation. It may request changes from the owning agent.
- Contract changes for duplicate response semantics, challenge disposition, signed upload/read flows, and protected admin transitions are integration-lead decisions before Agent 3/Agent 1 begin dependent work.

## Expected handoff

Each task should provide a short handoff with implementation summary, files changed, tests added, exact checks run and results, environment requirements, and unresolved integration questions. Merge only after the lead confirms file ownership and the QA gate passes.
