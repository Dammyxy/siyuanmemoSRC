## Why

Live `review.session.feedback` logs now show the removed undo-journal append is gone, but the remaining slow time is concentrated inside `session-feedback-commit` at ~370-435ms while host storage effects explain only ~32-44ms. The commit Module is still too shallow diagnostically: it hides scheduler, SQL writes, delta capture, delta encode, and delta append work behind one label.

## What Changes

- Add Review answer transaction timing spans inside the worker-owned Review commit path for scheduler, SQL writes, queue impact, undo journal, and sync metadata.
- Add SQLite transaction and SQLite delta diagnostic spans that separate writer time, SQL commit, delta capture, append preflight, pending-size estimates, entry build, segment encode, segment write, manifest write, and total delta persist.
- Keep behavior unchanged: no scheduling, queue, storage, durability, or fallback semantics change.
- Keep diagnostics in existing timing evidence surfaces; do not add normal-path console log flood.

## Capabilities

### New Capabilities
- `review-feedback-transaction-internals`: Diagnostic coverage for worker Review answer transaction internals.

### Modified Capabilities
- `sql-first-card-runtime`: SQL-first Review feedback persistence exposes internal SQLite transaction and delta timing evidence for measured optimization.

## Impact

- Affected code: `worker/review/WorkerReviewCardMutationPersistenceModule.ts`, `src/infrastructure/persistence/sqlite/SqliteDatabaseService.ts`, `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`.
- Affected tests: Review feedback timing tests and SQLite persistence tests.
- Affected docs: `ARCHITECTURE.md`, `docs/DDD_RESCAN_BACKLOG.md`.
- No public contract or durable storage format change.
