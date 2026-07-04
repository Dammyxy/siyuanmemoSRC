## 1. Feedback Loop And Baseline

- [x] 1.1 Add or update a focused Review session test that injects a delayed backend `review.feedback` commit and asserts UI `currentItem` advances from the session frontier before the delayed commit resolves
- [x] 1.2 Add a focused projection test where projection is stale, unavailable, or generation-mismatched after answer and Review still advances from session frontier
- [x] 1.3 Add a worker/review test that records separate timing buckets for commit, projection maintenance, sync, and repair work
- [x] 1.4 Capture current live-log-derived budgets in test names or diagnostics: UI switch p95 target, commit latency, projection latency, and pre-merge latency

## 2. Session Frontier Authority

- [x] 2.1 Introduce a `ReviewSessionFrontier` or equivalent internal Module under `src/application/adapters/review-session/` that owns immediate next-card selection for active sessions
- [x] 2.2 Move rate/skip/custom advancement in `UnifiedQueueStrategy` to return next card from the session frontier instead of requiring queue projection mutation first
- [x] 2.3 Update `reviewSessionController.ts` so `grade()` assigns `currentItem` from the frontier result and does not await full backend/projection maintenance for visible switching
- [x] 2.4 Preserve session-local counters/history when projection counters are stale, deferred, or refresh-required

## 3. Async Durable Commit Queue

- [x] 3.1 Add an idempotent Review commit queue Interface that records pending/applied/failed states with card id, rating, reviewedAt, queue type, session id, and idempotency key
- [x] 3.2 Route durable scheduler commit and review event persistence through the commit queue without hiding failures
- [x] 3.3 Surface `commit-pending`, `commit-applied`, and `commit-failed` diagnostics to Review session state
- [x] 3.4 Add retry/repair behavior for failed commits without resubmitting duplicate review events

## 4. Projection Maintenance Out Of Hot Path

- [x] 4.1 Split worker `review.feedback` durable commit from queue projection rebuild/delta work so projection can return patched, deferred, stale, or refresh-required impact
- [x] 4.2 Remove synchronous full projection row rebuild from the ordinary SRS answer path when a session frontier can advance
- [x] 4.3 Update `ReviewSessionProjectionApplier` and related diagnostics to apply hot patches when available and otherwise mark projection stale/deferred without blocking UI
- [x] 4.4 Extend `review-journal-projection-reconciler` handling so async commit evidence later reconciles journal/projection state safely

## 5. Sync And Repair Off Hot Path

- [x] 5.1 Prevent ordinary Review answer switching from triggering full pre-request domain sync merge unless current-card conflict evidence requires fail-closed handling
- [x] 5.2 Move repeated Xiuyuan binding/card DTO canonical repair out of Review answer reads and into explicit repair or background maintenance
- [x] 5.3 Add typed diagnostics for `sync-divergent`, `projection-stale`, and `repair-required` rather than hidden fallback or automatic repair in getters
- [x] 5.4 Ensure no Review answer path calls full load/save, full merge, `queue.projection.replace`, or canonical repair before visible next-card assignment

## 6. Documentation And Debt Ledger

- [x] 6.1 Update `ARCHITECTURE.md` to describe session frontier authority, async commit queue, projection read-model role, and off-hot-path sync/repair ownership
- [x] 6.2 Append `docs/DDD_RESCAN_BACKLOG.md` task delta with fixed and deferred debts
- [x] 6.3 Update or add runtime performance diagnostic notes showing separated UI switch, commit, projection, sync, and repair buckets

## 7. Validation

- [x] 7.1 Run targeted Review session tests for delayed commit, stale projection, failed commit, skip/custom advancement, and unavailable current card
- [x] 7.2 Run targeted worker Review feedback tests for idempotent commit, projection deferred/hot-patch impact, journal evidence reconciliation, and sync divergence handling
- [x] 7.3 Run targeted storage tests proving canonical repair is not hidden in Review answer read paths
- [x] 7.4 Run `pnpm run check:boundaries`
- [x] 7.5 Run `pnpm build`
