## Why

After the CDF preparation optimization, Review rating no longer spends visible time in frontend next-card preparation. New live logs show the remaining 0.5-1.1s latency is dominated by `session-runtime-answer`, with worker `review.session.feedback` attribution pointing to `session-feedback-commit`, `database:reviewFeedback.total`, and SQLite delta host effects such as `sqlite.writeBinary`, `sqlite.writeJSON`, and `sqlite.readBinary`.

This change targets the next measured bottleneck: make Review session feedback commit latency diagnosable and reduce unnecessary SQLite delta host work without weakening durable Review commit semantics.

## What Changes

- Add focused diagnostics/tests that split `review.session.feedback` commit time into session transaction, SQLite delta append, manifest/open-segment IO, queue-impact/projection, and host bridge wait where available.
- Keep ordinary Review rating fail-closed: committed success still requires durable review event/card projection/delta or equivalent storage evidence.
- Optimize only measured redundant SQLite delta/session-commit work on the hot path; do not introduce stale success, async durability, or a broad storage rewrite.
- Preserve existing CDF preparation improvements and avoid reintroducing frontend `prepare-selected-review-card` work into the rating path.
- Record whether a later native SQLite/WAL or Session Read Model change is still needed after this narrower commit-path optimization.

## Capabilities

### New Capabilities
- `review-session-sqlite-commit-hot-path`: Covers Review session feedback commit timing, SQLite delta host-path attribution, and safe hot-path reduction of redundant commit IO.

### Modified Capabilities

## Impact

- Affected code:
  - `worker/review/WorkerReviewFeedbackRuntime.ts`
  - `worker/review/WorkerReviewCardMutationPersistenceModule.ts`
  - `worker/bootstrap/ReviewFeedbackTimingScope.ts`
  - `src/infrastructure/persistence/sqlite/SqliteDatabaseService.ts`
  - `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`
  - `src/infrastructure/persistence/sqlite/__tests__/*`
  - `worker/__tests__/*` and Review/session hot-path tests as needed
- Affected systems:
  - Review session feedback commit
  - SQLite delta v2 append/manifest/open-segment host effects
  - Review feedback timing diagnostics
  - Durable Review commit envelope
- Validation requires focused worker/SQLite tests, strict OpenSpec validation, `pnpm run check:boundaries`, and `pnpm build`.
