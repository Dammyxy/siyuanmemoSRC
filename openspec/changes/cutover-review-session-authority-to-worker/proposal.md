## Why

Live Review grading logs now show ordinary `review.feedback` spending hundreds of milliseconds to more than a second in SQLite delta manifest and sealed-segment host reads. Earlier changes reduced projection pressure and cached some delta evidence, but the deeper problem remains architectural: Review session authority is split between renderer cursor/projection patching and worker feedback commits.

The current path still makes the renderer understand projection-backed queues, generation mismatch, requery-after-feedback, local patching, session exclusions, and storage durability details. That is a shallow interface: callers must know almost as much as the implementation. It also keeps derived-cache work close enough to the Review answer path that a slow projection/delta checkpoint can make grading feel slow.

Anki and Incrementum point to a simpler shape: the backend/session runtime owns answer + advancement, while queue/projection/counter read models are derived and may catch up later. SiYuanMemo should keep SQL-first storage and queue projection, but Review sessions need one active authority: the backend worker.

## What Changes

- Introduce a worker-owned Review session authority that owns active Review session cursor, current card, next-card advancement, session-local counters, pending commit state, and session diagnostics.
- Cut the active Review path away from renderer-owned `ReviewSessionCursor` / `UnifiedQueueStrategy` authority. Renderer Review code becomes a thin adapter to worker session methods and does not keep a fallback cursor authority.
- Define `review.feedback` success as durable Review journal fact append plus worker in-memory SQL/session state update, not queue projection persistence, SQLite delta checkpoint, Browser counter refresh, or main DB snapshot persistence.
- Treat Review journal entries as after-state facts containing enough evidence to replay deterministically: before/after card state, review event, queue impact, reviewedAt, rating, queue type, and idempotency key.
- Keep queue projection rows/counters as derived read models for Browser, queue warmup, and Review session initialization only. Projection is not the per-answer next-card authority.
- Move SQLite delta manifest/sealed segment reads, projection refresh, truth flush, and checkpoint work out of the ordinary Review answer success gate.
- Fail closed when the worker session authority is unavailable. Do not add runtime fallback to renderer cursor, local queue requery, legacy snapshots, or a second active authority.

## Capabilities

### New Capabilities

- `worker-owned-review-session-authority`: Worker backend owns active Review session state and advancement; renderer is a display/input adapter without session cursor authority.

### Modified Capabilities

- `sql-first-card-runtime`: Tightens SQL-first Review semantics so Review feedback updates worker in-memory SQL/session state synchronously but does not require projection/delta checkpoint persistence before returning success.
- `review-journal-projection-reconciler`: Tightens journal/projection semantics so projection reconciliation follows durable Review facts and never becomes Review session authority.

## Impact

- Affected Review UI/application path:
  - `src/ui/review/v2/useReviewSession.ts`
  - `src/ui/review/v2/reviewSessionController.ts`
  - `src/application/adapters/UnifiedReviewAdapter.ts`
  - `src/application/adapters/UnifiedQueueStrategy.ts`
  - `src/application/adapters/review-session/*`
- Affected worker path:
  - `worker/review/WorkerReviewFeedbackRuntime.ts`
  - new worker Review session runtime/module
  - `worker/review/WorkerReviewCardMutationPersistenceModule.ts`
  - `worker/review/ReviewFeedbackStorageEnvelope.ts`
  - `worker/bootstrap/rpc/BackendReviewRpcAdapter.ts`
- Affected projection/storage path:
  - `worker/queue-projection/*`
  - `src/infrastructure/persistence/sqlite/SqliteDatabaseService.ts`
  - `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`
  - `worker/db/ReviewFeedbackJournalStore.ts`
- Affected docs/tests:
  - `ARCHITECTURE.md`
  - `docs/DDD_RESCAN_BACKLOG.md`
  - Review session tests, worker Review feedback tests, projection reconciler tests, transport timing tests, and boundary/build validation.

## Out Of Scope

- No scheduler algorithm rewrite.
- No native SQLite/WAL migration in this change.
- No Browser projection removal.
- No hidden fallback to renderer session authority.
- No legacy snapshot read revival.
