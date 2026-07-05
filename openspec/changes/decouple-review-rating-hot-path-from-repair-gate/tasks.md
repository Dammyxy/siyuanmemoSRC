## 1. Feedback Loop And Baseline

- [x] 1.1 Add a focused worker/session test that simulates repairable domain-sync state and asserts ordinary `review.session.feedback` does not call full pre-request merge when a valid repair gate allows rating.
- [x] 1.2 Add a focused worker/session test proving missing, stale, blocking, and unavailable repair gates fail closed before scheduler commit.
- [x] 1.3 Add a focused current-card conflict test proving current-card divergence blocks rating while unrelated repairable drift can be accepted by the session gate.
- [x] 1.4 Keep or update live-log diagnostics tests so `preMerge` skip/run reasons remain copyable.

## 2. Repair Gate Module

- [x] 2.1 Introduce or deepen a Review-session repair gate Module that owns gate decision creation, validation, expiry, and typed diagnostics.
- [x] 2.2 Wire Review open/session start to create a repair gate from domain-sync diagnostics without performing per-rating repair work.
- [x] 2.3 Define gate expiry on diagnostics generation/source-set/session changes and fail closed when expired.
- [x] 2.4 Preserve explicit user-triggered repair and diagnostics flows outside ordinary rating feedback.

## 3. Worker Rating Hot Path

- [x] 3.1 Change `BackendKernel` pre-request handling so ordinary `review.session.feedback` with a valid gate skips full domain-sync pre-request merge.
- [x] 3.2 Keep full merge available for explicit repair/diagnostics commands and non-rating methods that still require it.
- [x] 3.3 Ensure scheduler commit, review event persistence, sync metadata, and projection impact still commit through SQL-first writer authority.
- [x] 3.4 Return typed unavailable/conflict diagnostics for unsafe gates; do not add fallback, degrade, dual-path, or stale snapshot behavior.

## 4. Application And Diagnostics

- [x] 4.1 Pass repair gate evidence through the existing Review session runtime/client path without leaking domain-sync implementation details into UI callers.
- [x] 4.2 Update copyable worker and frontend timing summaries to show repair-gate skip/run reason for `review.session.feedback`.
- [x] 4.3 Keep `UnifiedQueueStrategy` focused on Review command orchestration; do not fold CDF live relation or Session Read Model optimization into this change.
- [x] 4.4 Preserve explicit repair-required state for UI/diagnostics when drift remains repairable outside the rating click.

## 5. Docs And Debt Ledger

- [x] 5.1 Update `ARCHITECTURE.md` with Review rating hot-path ownership, repair gate lifecycle, and domain-sync repair ownership.
- [x] 5.2 Append `docs/DDD_RESCAN_BACKLOG.md` task delta with fixed and deferred debts.
- [x] 5.3 Record deferred follow-ups for Review Card Preparation Module and Session Read Model Module if live logs still show frontend `consume-advance` cost after this change.

## 6. Validation

- [x] 6.1 Run focused worker/session repair-gate tests.
- [x] 6.2 Run focused Review application/runtime tests for gate propagation and fail-closed diagnostics.
- [x] 6.3 Run focused domain-sync/manual repair tests touched by gate lifecycle.
- [x] 6.4 Run `pnpm run check:boundaries`.
- [x] 6.5 Run `pnpm build`.
- [x] 6.6 Run `openspec validate decouple-review-rating-hot-path-from-repair-gate --strict`.
