## Why

SiYuanMemo's SRS Review Kernel now owns answer authority, Review Ledger facts, Card Schedule Store state, SessionQueueIndex advancement, and restart-safe replay, but worker-backed `go-back` is still closer to session-state restoration than Anki-style transaction undo. This leaves the final core SRS architecture gap: answer, schedule mutation, review fact, queue advancement, and undo evidence should be one backend-owned transaction contract rather than several recoverable side effects.

This matters now because the storage and performance work has already separated Review truth from Browser projection, SQLite delta sync, and renderer cursor state. The next architecture step can be a deep Module refactor instead of another hot-path patch.

## What Changes

- Introduce a backend-owned **Review Transaction Undo Journal** as the durable evidence for undoing a committed worker-backed Review answer.
- Make `SrsReviewKernel.answer()` write undo evidence in the same success envelope as Review Ledger append/reuse, Card Schedule Store commit, and SessionQueueIndex advance.
- Make `SrsReviewKernel.undo()` use only journal evidence to restore card schedule state, session frontier/counters/lookahead, and derived projection invalidation.
- Preserve auditability: undo must not silently erase Review Ledger history; it must append or mark explicit reversal/supersession evidence.
- Allow a broad internal refactor of Review answer implementation if it reduces shallow seams, but keep the external kernel interface small.
- Keep BrowserProjectionIndex, renderer ReviewHistory, Review Session Cursor, SQLite delta segments, and Domain Sync repair as adapters or derived state, not undo authority.
- **BREAKING** for worker-backed Review sessions: renderer/local go-back fallback is not allowed once the worker SRS Review Kernel owns the session.

## Capabilities

### New Capabilities

- `review-transaction-undo-journal`: Defines durable Anki-style undo/go-back authority for worker-backed Review answers, including transaction evidence, reversal semantics, restart-safe undo, and projection invalidation.

### Modified Capabilities

- `sql-first-card-runtime`: Tightens Review answer durability so undo evidence is part of the backend-owned Review transaction envelope for worker-backed sessions.
- `review-journal-projection-reconciler`: Extends replay/reconciliation expectations so undone/reversed Review transaction evidence rebuilds card schedule and derived queue state consistently.

## Impact

- Affected code:
  - `worker/review/SrsReviewKernel.ts`
  - `worker/review/WorkerReviewSessionRuntime.ts`
  - `worker/review/WorkerReviewCardMutationPersistenceModule.ts`
  - `worker/review/WorkerReviewFeedbackRuntime.ts`
  - `worker/db/SqliteDatabaseService.ts`
  - `worker/bootstrap/rpc/BackendReviewRpcAdapter.ts`
  - `src/application/adapters/review-session/*`
  - `src/application/adapters/UnifiedQueueStrategy.ts`
  - `packages/contracts/src/backend-rpc/review.ts`
  - focused worker/application/backend tests
- Affected systems:
  - SRS Review Kernel answer/undo contract
  - Review Ledger and Card Schedule Store authority
  - SessionQueueIndex current/lookahead/counter restore
  - Review truth replay/backfill and projection invalidation
  - renderer go-back adapter behavior for worker-backed sessions
- Validation requires restart-safe undo tests, focused SRS Review Kernel tests, backend RPC contract tests, queue/session application tests, strict OpenSpec validation, `pnpm run check:boundaries`, and `pnpm build`.
