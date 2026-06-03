## Why

Formal Review feedback can currently report success after the worker SQL transaction updates only in-memory state. Restarting SiYuan can reload stale projection state, causing reviewed Incremental Learning cards to reappear and queue counts to reset.

The storage plan must make local review success durable before UI advancement while keeping sync-visible truth and SQL delta files bounded, rebuildable, and safe under the standard SiYuan plugin file APIs.

## What Changes

- Require formal `review.feedback` success to wait for durable local intent journal and durable SQL delta/checkpoint persistence.
- Remove the review hot-path behavior that suppresses required SQLite delta/checkpoint host effects during `review.feedback`.
- Keep `siyuanmemo.db` as a rebuildable projection/checkpoint, not the sole success signal for a review; the temp `siyuanmemo.db` projection is a volatile index and is not allowed to clear durable petal SQLite delta segments.
- Add Review truth v2 records that include complete after-card scheduling state sufficient to rebuild review/card projection state.
- Make Review truth segment flush asynchronous and batched after local durability succeeds, with flush on pending threshold, review exit, queue completion, plugin unload, startup compensation, and long idle.
- Replace the single growing SQLite delta JSON log with SQLite delta v2 MessagePack segment files with a bounded open segment and sealed immutable segments.
- Separate checkpoint storage class: only a same-durability-domain `durable-checkpoint` can supersede covered SQLite delta; `volatile-projection` checkpoints keep durable delta pending and replayable.
- Do not provide v1 migration. Existing v1 truth/delta files are outside this change's compatibility scope.
- Fail closed for formal review feedback when journal, SQL delta/checkpoint, truth-v2 validation, or replay cannot satisfy the active durability contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sql-first-card-runtime`: Tightens SQL-first Review mutation durability, Review truth segment semantics, and SQLite delta persistence requirements for formal review feedback.

## Impact

- Affected review path: `ReviewCommitUseCase`, `SrsBackendClient`, `BrowserSrsBackendWorkerTransport`, `WorkerReviewFeedbackRuntime`, `WorkerReviewCardMutationPersistenceModule`, `ReviewFeedbackDurabilityModule`, and backend review feedback tests.
- Affected SQL persistence: `SqliteDatabaseService`, `SqliteDeltaCheckpoint`, worker DB service replay/checkpoint diagnostics, and delta persistence tests.
- Affected truth persistence: `MessagePackTruthSegmentStore`, `ReviewFeedbackTruthFlushRuntime`, truth backfill/replay code, device identity usage, and truth segment tests.
- Affected lifecycle triggers: review view exit, queue completion, plugin unload, backend startup compensation, and long-idle flush scheduling.
- Verification requires targeted review feedback durability tests, delta replay/restart tests, truth v2 replay/rebuild tests, hidden fallback checks, boundary checks, build, and a manual SiYuan smoke where reviewing one Incremental Learning card survives restart.
