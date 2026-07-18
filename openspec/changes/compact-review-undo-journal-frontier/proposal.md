## Why

A representative 113-card Review rating currently appends a 575,046-byte SQLite delta segment because the undo journal persists complete card objects for both the before and after session frontiers, then duplicates that row in delta changes and the mutation envelope. This durability payload dominates the remaining rating latency even though undo only needs ordered identities plus the reviewed card's complete before/after schedule evidence.

## What Changes

- Persist Review undo session frontiers as ordered card identities and scalar cursor/projection metadata instead of complete card arrays.
- Hydrate compact frontiers from the authoritative SQLite card repository when undo restores a worker session; Browser projection remains derived state and cannot supply undo authority.
- Fail undo closed before mutation when any required frontier card cannot be reconstructed.
- Normalize legacy full-card frontier journal rows through a one-way read compatibility path so already-persisted undo remains usable.
- Add a representative 113-card durability budget proving the serialized Review feedback SQLite delta entry remains below 64 KiB while complete reviewed-card before/after evidence is preserved.

## Capabilities

### New Capabilities

- `compact-review-undo-journal-frontier`: Defines the compact durable frontier representation, authoritative hydration, legacy normalization, fail-closed behavior, and Review feedback payload budget.

### Modified Capabilities

None.

## Impact

- Affected code:
  - `worker/review/ReviewTransactionUndoJournal.ts`
  - `worker/review/ReviewTransactionUndoJournalStore.ts`
  - `worker/review/WorkerReviewSessionRuntime.ts`
  - `worker/db/SqliteDatabaseService.ts`
  - focused worker Review/session/SQLite delta tests
- Affected systems:
  - worker-backed Review answer undo evidence
  - restart-safe SessionQueueIndex restoration
  - SQLite delta mutation payload size
- No public RPC, rating semantics, Review Ledger audit semantics, or Browser projection authority changes.
