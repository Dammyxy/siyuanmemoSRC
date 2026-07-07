## Why

Live `review.session.feedback` traces now show the remaining 370-400ms scoring latency is not scheduler work or host IO. It is dominated by `sql.sync-metadata-touch` doing full-store metadata/hash work and SQLite delta pending-byte estimates stringifying the whole pending snapshot twice per answer.

## What Changes

- Add an Anki-style Review mutation stamp path so Review answer transactions can mark collection/store mutation in O(1) without loading the full store or recalculating full content hash.
- Add SQLite delta pending-byte accounting so ordinary append classification uses stored/accounted pending bytes instead of serializing the whole snapshot on each append.
- Deepen the Review answer transaction Module so callers still submit one answer while the implementation owns the fixed hot transaction sequence: answer facts, O(1) mutation stamp, undo evidence, delta append, and diagnostics.
- Preserve durability and fail-closed behavior: no async success path, no split durable answer transaction, no scheduler algorithm change, no Browser/Queue projection authority change.

## Capabilities

### New Capabilities
- `review-answer-hot-transaction`: Review answer hot transaction stays O(1) with respect to global store size and accumulated delta history.

### Modified Capabilities
- `sql-first-card-runtime`: SQL-first Review persistence must expose and use O(1) mutation stamp and delta pending-byte accounting for the Review answer hot path.

## Impact

- Affected code: `worker/review/WorkerReviewCardMutationPersistenceModule.ts`, `worker/review/WorkerReviewFeedbackRuntime.ts`, `src/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository.ts`, `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`, `src/infrastructure/persistence/sqlite/SqliteDatabaseService.ts`.
- Affected tests: focused Review feedback runtime tests and SQLite delta persistence tests.
- Affected docs: `CONTEXT.md`, `ARCHITECTURE.md`, `docs/DDD_RESCAN_BACKLOG.md`.
- No public RPC shape or durable storage format breaking change.
