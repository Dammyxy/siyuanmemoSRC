## Why

Review card switching still waits on too much storage and projection work after each answer. Live diagnostics show `review.feedback` can block on pre-request domain sync merge, SQLite worker handling, projection maintenance, and canonical storage repair before the UI can show the next card.

The review path needs one stable, direct authority for immediate advancement: a session frontier. Projection, sync, and repair remain necessary, but they must not be synchronous dependencies of `currentCard + rating -> nextCard`.

## What Changes

- Introduce a review answer hot-path contract where `answerAndAdvance()` returns the next session card immediately from an in-memory/frontier model.
- Move durable review commit into an explicit commit queue that can persist the current card schedule/event without blocking UI advancement.
- Move queue projection maintenance out of the answer critical path; projection updates become hot-patch/deferred/background work with explicit stale/refresh-required diagnostics.
- Move domain sync pre-request merge and storage canonical repair out of per-answer switching unless the current card has a proven conflict that must block the commit.
- Keep projection as the read model for session start, browser/counts, and queue warmup, but not as per-answer next-card authority.
- Add failure semantics for pending commits, stale projection, sync divergence, and repair-required storage instead of hidden fallback or dual-path behavior.
- Add performance diagnostics that separate UI switch time, commit latency, projection maintenance latency, and sync/repair latency.

## Capabilities

### New Capabilities
- `review-answer-hot-path`: Immediate review advancement, async durable commit, projection maintenance off-hot-path, and explicit degraded states for pending/stale repair work.

### Modified Capabilities
- `review-journal-projection-reconciler`: Review journal/projection requirements change so projection maintenance must not be required before UI switches to the next card.
- `sql-first-card-runtime`: SQL-backed review runtime requirements change so review answer commits are durable/idempotent but no longer force synchronous projection rebuild or domain sync merge for ordinary card switching.

## Impact

- Affected review UI/application path: `src/ui/review/v2/reviewSessionController.ts`, `src/ui/review/v2/useReviewSession.ts`, `src/application/adapters/UnifiedQueueStrategy.ts`, `src/application/adapters/review-session/*`.
- Affected worker path: `worker/review/WorkerReviewFeedbackRuntime.ts`, `worker/review/WorkerReviewCardMutationPersistenceModule.ts`, `worker/review/ReviewFeedbackStorageEnvelope.ts`, `worker/truth/*`, `worker/domain-sync/*`.
- Affected projection path: `worker/queue-projection/*`, `src/application/adapters/ReviewSessionProjectionApplier.ts`, `src/application/services/UnifiedDataSourceManager.ts`.
- Affected storage/repair path: `src/core/storage/UnifiedStorageManager.ts`, storage canonicalization diagnostics, and `docs/DDD_RESCAN_BACKLOG.md`.
- Validation must include targeted review-session tests, worker feedback tests, projection stale/deferred tests, storage repair off-hot-path tests, `pnpm run check:boundaries`, and `pnpm build`.
