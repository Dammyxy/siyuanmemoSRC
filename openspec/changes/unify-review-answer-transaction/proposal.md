## Why

Live Review scoring evidence shows `review.session.feedback` still pays two serialized durable writes: the main answer commit and a separate Review Transaction Undo Journal append. That is not Anki-style answer authority: schedule mutation, Review Ledger fact, queue impact evidence, and undo evidence should succeed or fail as one answer transaction.

## What Changes

- Move worker-backed answer undo-journal persistence into the `review.feedback` transaction envelope.
- Make `WorkerReviewSessionRuntime.feedback()` build undo evidence before commit and pass it into the answer transaction instead of appending it afterward.
- Keep skip undo persistence unchanged in this slice; skip is not the rating hot path.
- Preserve fail-closed durable undo semantics: if undo evidence cannot be written with the answer transaction, the answer transaction fails.
- Remove the separate `session-feedback-undo-journal-append` timing step for answer scoring; undo persistence is now part of `session-feedback-commit`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `sql-first-card-runtime`: Worker-backed Review answer commits SHALL persist Review Transaction Undo Journal evidence in the same SQL/delta transaction as card schedule and Review Ledger evidence.

## Impact

- Affected code: `worker/review/WorkerReviewSessionRuntime.ts`, `worker/review/WorkerReviewFeedbackRuntime.ts`, `worker/review/WorkerReviewCardMutationPersistenceModule.ts`, `worker/review/ReviewTransactionUndoJournal*.ts`, `worker/db/SqliteDatabaseService.ts`, and focused Review worker tests.
- Affected systems: SRS Review Kernel answer hot path, Review Transaction Undo Journal persistence, worker timing diagnostics, SQLite delta transaction envelope.
- No new dependency, no fallback answer path, no scheduler algorithm change.
