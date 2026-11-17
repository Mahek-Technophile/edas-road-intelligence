# EDAS Prompt Library

These are reusable instructions for people using Codex or another engineering assistant on this repository. They are **not** prompts used at runtime by the Vision detector: the current detector is conventional computer-vision inference and no generative prompt model is connected to the application.

Copy a prompt and fill in the bracketed task details. Before assigning coding work, confirm the target branch/worktree and the ownership table in [Agent Ownership](AGENT_OWNERSHIP.md).

## 1. Repository-aware implementation prompt

```text
You are contributing to the existing EDAS repository, not starting a new project.
Before changing files, read docs/MASTER_SPEC.md, docs/API_CONTRACT.md,
docs/ARCHITECTURE.md, docs/AGENT_OWNERSHIP.md, and docs/TESTING.md, then inspect
the actual code and Git status. The repository is authoritative when documentation
and implementation differ; report material discrepancies instead of silently
inventing behavior.

Task: [specific change]
Allowed files: [exact paths or ownership area]
Do not modify: [reserved paths / other-agent files]

Keep the change narrow, follow existing interfaces, preserve authentication and
privacy boundaries, and do not fabricate model results. Do not apply migrations,
deploy, push, or modify another worktree. Run only relevant checks that can safely
use this environment. Report changed files, exact commands/results, assumptions,
blockers, and remaining work. Do not claim a test, integration, or inference run
that did not actually pass.
```

## 2. Backend / Supabase implementation prompt

```text
Implement [backend change] in the Agent 1 ownership boundary only. Follow the
existing FastAPI patterns and the API contract. Derive identity from the validated
Supabase JWT subject; never accept a caller-supplied owner or role. Keep service-role
credentials server-only. For database writes requiring concurrency guarantees,
use reviewed transaction/RPC behavior and constraints rather than an unlocked
read-then-write sequence. Preserve private Storage behavior and avoid returning
internal SQL or credential details. Do not execute a migration against the live
project. Add or update owned tests and report exactly what ran.
```

## 3. Road intelligence / model integration prompt

```text
Implement [intelligence capability] behind the shared EDAS interfaces. First inspect
the actual schema and deterministic fallback behavior. Do not assume weights, model
files, accelerators, or geographic accuracy exist. A capability is ready only after
its configured runtime can perform inference successfully. Resolve class mappings
from verified model metadata, emit timestamped structured outputs, and make failure
states explicit. Never add synthetic detection output to production UI/API paths.
Document model source, exact artifact/hash, license, class map, input/output
coordinates, local benchmark method, known regional limitations, and tests.
```

## 4. Frontend / product UI prompt

```text
Implement [screen or interaction] in the frontend ownership boundary. Use the
documented API and existing design system; do not invent endpoints or fake success
states. Make loading, empty, unavailable, error, and completed states clear and
consistent with actual backend responses. Keep credentials out of built assets and
local storage; follow the current token/session handling pattern. For Vision Lab,
show model-backed events only, synchronize overlays to source timestamps, and
require a person to review before creating a normal hazard report. Do not add a
visible "demo" or "MVP" badge unless explicitly requested.
```

## 5. QA / integration prompt

```text
Validate [specific behavior] using tests and scripts in the Agent 4 ownership
boundary. Do not modify application source or tests/integration/. Use fake external
dependencies only to test mechanics; mark such checks as unit/fake-based. Use real
model output only when a real configured model and real input were actually run.
Never run destructive database checks against the pilot project. Report exact
commands and observed output, distinguish pass/fail/blocked/not-run, and include
security/ownership cases relevant to the change.
```

## 6. Field-image model evaluation prompt

```text
Evaluate the configured EDAS road-damage model on the supplied, permissioned Pune
road images. Do not alter the checkpoint or confidence threshold during the first
pass. Record the artifact SHA-256, runtime/versions, device, source image IDs,
resolution, preprocessing, and exact command. Compare outputs with independent
human-reviewed annotations using a documented class mapping and IoU criterion.
Report precision, recall, false positives/negatives, per-class counts, and examples
of failure, with uncertainty and sample-selection limits. Do not infer performance
from the model card or from unannotated clips, and do not publish the images or
locations without authorization.
```

## 7. Documentation update prompt

```text
Update [documentation files] to match the current repository implementation. Verify
routes, defaults, status values, CLI options, environment variables, and migration
objects directly from source. Preserve the core API contract as the source of truth
for hazard workflows. State what has not been applied or tested. Keep examples
clearly illustrative and never present schema examples as real detections. Add
cross-links, remove stale claims only when source evidence supports the correction,
and do not alter MASTER_SPEC.md unless the task specifically requires it.
```

## 8. Prompt use checklist

- State one deliverable and a concrete ownership boundary.
- Provide the target branch/worktree and expected API/model contract.
- Distinguish design examples from real production data.
- Require exact verification evidence and honest limitations.
- Keep operational secrets out of prompts, commits, screenshots, and logs.
- Ask for a plan only when needed; otherwise authorize the implementation action directly.
