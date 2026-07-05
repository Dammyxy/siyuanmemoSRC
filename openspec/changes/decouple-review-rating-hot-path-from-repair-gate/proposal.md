## Why

Live Review grading logs now prove ordinary rating still waits on repairable domain-sync `pre-request-merge` before the worker can answer. The current hot path mixes two responsibilities that should be separate: applying the current card rating, and repairing cross-source domain-sync drift.

## What Changes

- Introduce a Review rating hot-path contract where ordinary `review.session.feedback` does not run full domain-sync repair/merge before applying a rating.
- Introduce an explicit domain-sync repair gate for Review sessions: session open/diagnostics may classify `clean`, `repairable`, `blocking`, or `unavailable`, but each rating click consumes a cached gate decision instead of recomputing full merge.
- Preserve fail-closed behavior for real current-card conflicts, missing writer authority, unavailable repair state, or known blocking divergence.
- Move repairable merge/repair work to explicit repair lifecycle, Review-session preflight, idle/background maintenance, or user-triggered diagnostics rather than per-rating RPC.
- Keep diagnostic evidence copyable so live logs can prove whether the rating path skipped repair merge and why.
- Do not change scheduler algorithm, CDF live relation refresh, next-card preparation, Browser projection warmup, or Session Read Model behavior in this change.

## Capabilities

### New Capabilities
- `review-rating-hot-path-repair-gate`: Review rating applies through a narrow hot path that consumes an explicit repair gate decision instead of running full domain-sync repair/merge per rating.

### Modified Capabilities
- `sql-first-card-runtime`: SQL-backed Review session feedback must not require full pre-request domain-sync merge for ordinary rating when the active repair gate is clean or already accepted for the current session.
- `manual-sync-direction-resolution`: Domain-sync repairability remains explicit and actionable, but repairable drift is routed through a repair gate lifecycle rather than repeated per-rating merge.

## Impact

- Affected Review path: `src/application/adapters/UnifiedQueueStrategy.ts`, `src/application/adapters/review-session/*`, `src/application/clients/*Backend*`, and focused Review session tests.
- Affected worker path: `worker/bootstrap/BackendKernel.ts`, `worker/bootstrap/rpc/BackendReviewRpcAdapter.ts`, `worker/review/WorkerReviewSessionRuntime.ts`, worker domain-sync/SQLite diagnostics, and focused worker RPC tests.
- Affected domain-sync path: Review safety/gate services, domain-sync diagnostics, repair preview/apply semantics, and copyable slow-log summaries.
- Documentation: `ARCHITECTURE.md`, `docs/DDD_RESCAN_BACKLOG.md`, and this OpenSpec change.
- Validation: focused Review hot-path/repair-gate tests, worker `review.session.feedback` timing tests, domain-sync safety tests, `pnpm run check:boundaries`, `pnpm build`, and strict OpenSpec validation.
