## Why

Live Review logs show card rating sometimes takes 3-15s and can fail or become ambiguous while handling `review.feedback`. The same trace shows backend host-effect timeouts, SQLite transaction persist/restore failures, open-segment repair failures, repeated Xiuyuan sync pressure, and truth flush pending errors, so this change stabilizes the user-visible card rating path as one end-to-end Review feedback reliability problem rather than as isolated storage symptoms.

## What Changes

- Define an end-to-end card rating feedback contract: rating must either commit once with proven durable evidence or fail closed with a clear retryable/unavailable/repair-required state.
- Add hot-path latency guardrails for `review.feedback`, including a budgeted synchronous commit path and explicit separation of secondary work such as truth flush, queue projection maintenance, Browser projection warmup, and Xiuyuan/native-Riff sync.
- Harden transaction failure semantics so SQLite host-effect timeout, corrupt/open delta repair failure, and in-memory restore failure cannot leave the UI treating a rating as successful.
- Add retry/idempotency behavior for ambiguous rating outcomes so repeat submissions do not double-apply scheduler state or duplicate review events.
- Add diagnostics and focused regression coverage that reproduce the attached slow/error trace shape.
- Keep existing backend-worker ownership and fail-closed storage policy; no renderer-side scheduler fallback, no kernel-side DB writer, and no compatibility dual path.

## Capabilities

### New Capabilities
- `card-rating-feedback-path`: Defines user-visible Review card rating latency, durability, error, and retry semantics across Review UI, `ReviewCommitUseCase`, backend worker `review.feedback`, SQLite persistence, truth flush, and derived maintenance.

### Modified Capabilities
- `sql-first-card-runtime`: Tightens SQL-first Review mutation persistence so rating success is only reported after minimum durable Review feedback evidence is proven, while secondary storage/projection work is reported separately.
- `review-journal-projection-reconciler`: Tightens reconciliation expectations for ambiguous or pending Review feedback outcomes so restart/retry uses durable review evidence and idempotency identity rather than stale projection state.

## Impact

- Affected runtime path: `src/ui/review/v2/*`, `src/application/adapters/UnifiedQueueStrategy.ts`, `src/application/usecases/review/ReviewCommitUseCase.ts`, `src/application/clients/SrsBackendClient.ts`, `src/application/clients/BrowserSrsBackendWorkerTransport.ts`, `worker/bootstrap/rpc/BackendReviewRpcAdapter.ts`, `worker/review/WorkerReviewFeedbackRuntime.ts`, `worker/review/WorkerReviewCardMutationPersistenceModule.ts`, `worker/db/SqliteDatabaseService.ts`, and `worker/truth/*`.
- Affected behavior: card rating button response, `review.feedback` commit/result states, SQLite transaction persist/restore handling, truth flush retry after feedback pressure, queue projection maintenance timing, and Review retry/idempotency handling.
- Affected tests: focused Review commit/use-case tests, backend Review RPC tests, SQLite transaction failure tests, truth flush retry tests, transport timing/pressure tests, and Review session visible-state tests.
- Affected docs: active `ARCHITECTURE.md` if hot-path ownership or sequencing changes, plus `docs/DDD_RESCAN_BACKLOG.md` for any deferred native storage or broader sync-pressure debt once implementation touches production code.
