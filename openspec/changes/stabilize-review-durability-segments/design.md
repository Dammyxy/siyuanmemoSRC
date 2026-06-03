## Context

Formal Review feedback currently crosses the backend worker path, updates the worker SQL memory DB, and can return success before that mutation is locally durable across a SiYuan restart. The observed symptom is an Incremental Learning review count that decrements during the session, then returns to the pre-review count after restarting SiYuan.

The active root cause is in the formal `review.feedback` write path:

- `WorkerReviewCardMutationPersistenceModule` runs the SQL transaction with `{ persist: false }`, so the reviewed card and review-event index can remain memory-only.
- `BrowserSrsBackendWorkerTransport` and `ReviewFeedbackTimingScope` suppress `sqlite.writeJSON` and `sqlite.writeBinary` host effects during pending `review.feedback`, which blocks the delta/checkpoint writes that must become the local restart durability gate.
- Review truth flushing exists, but current `review.feedback.v1` records do not contain complete after-card scheduling state, so truth alone is not sufficient to rebuild the reviewed card state and queue projection.

The storage constraint remains unchanged: browser plugin code cannot append to native SQLite, sql.js exports are whole-file snapshots, and SiYuan plugin storage writes are full-file writes. Therefore the durable design stays split:

- IndexedDB/non-SiYuan review journal: local crash journal and idempotency ledger.
- Worker sql.js memory DB: active transaction owner and read projection.
- SQLite delta/checkpoint files: local restart durability for SQL projection state.
- Temp `siyuanmemo.db`: volatile SQL projection index. It is useful for fast local reload but is not durable petal truth and must not be treated as the checkpoint that clears durable petal SQLite deltas.
- MessagePack truth segments: sync-visible truth, written asynchronously after local durability succeeds.

## Goals / Non-Goals

**Goals:**

- Make formal `review.feedback` success mean the reviewed card, review event, sync metadata, and queue projection impact are recoverable after restart.
- Require local journal plus SQL delta/checkpoint durability before Review UI advances as successful.
- Stop suppressing required SQLite delta/checkpoint host effects for pending `review.feedback`.
- Store complete Review truth v2 records that can rebuild after-card scheduling state and review-event indexes.
- Flush Review truth asynchronously in bounded batches after local durability, with deterministic lifecycle flush triggers.
- Replace the single growing SQLite delta JSON log with bounded MessagePack delta segments.
- Keep failure modes explicit and fail closed instead of falling back to local queues or legacy snapshots.

**Non-Goals:**

- No native SQLite/WAL owner is introduced in this change.
- No v1 truth or v1 SQLite delta migration is provided.
- No kernel companion writes to `siyuanmemo.db`, truth, or SQLite delta files.
- No per-rating sync-visible truth flush is required before Review UI success.
- No hidden fallback to `unified-cards.msgpack`, local `queue.getCards()`, or stale SQL snapshots is added.
- No automatic compaction/deletion of truth history is added beyond bounded delta segment sealing/checkpoint rules.

## Decisions

1. Formal Review success is gated by local restart durability.

   A formal `review.feedback` request writes or reuses an idempotent journal entry, validates the complete Review truth v2 payload, runs the SQL mutation, persists the SQL delta or checkpoint, marks the journal entry `projection-applied`, and only then returns committed success to the UI. Review UI advancement is therefore gated by the local state needed to survive restart.

   Alternative considered: keep the hot path memory-only and rely on later truth flush or DB export. Rejected because a successful review can reappear after restart, which is the user-visible defect.

2. SQL delta/checkpoint host effects are required, not optional noise.

   The transport must not reject `sqlite.writeJSON` or `sqlite.writeBinary` merely because a `review.feedback` request is active. Review timing diagnostics can still classify and measure host effects, but local durability writes are part of the command contract. Non-critical background work can be deferred, but required SQL delta/checkpoint writes must either complete before success or fail the request.

   Alternative considered: keep suppressing SQLite writes to protect hot-path latency. Rejected because it trades latency for acknowledged data loss. Performance must be controlled by small delta records and bounded segments, not by dropping durability.

3. The journal is a recovery ledger, not sync truth.

   The journal records the idempotency key, request identity, complete after-card payload candidate, local apply status, SQL projection generation/delta identity, and truth flush status. `prepared` means the intent is locally recorded. `projection-applied` means SQL replay after restart can recover the Review result. `truth-flushed` means sync-visible truth has been written.

   If a crash occurs after `prepared` but before durable SQL apply, startup reconciliation must either reapply idempotently or mark the entry failed with an explicit diagnostic. If a crash occurs after SQL durability but before `projection-applied`, startup reconciliation must detect the committed SQL review event by idempotency key and advance the journal status.

   Alternative considered: treat truth segment append as the journal. Rejected because truth flush is async and sync-visible, while the local crash journal needs tighter idempotent recovery semantics.

4. Review truth v2 stores complete after-card state.

   `review.feedback.v2` records include request identity, queue identity, scheduler policy identity, source identity, before-card scheduling state, after-card scheduling state, review-event fact identity, idempotency key, projection generation, and hashes/checksums needed to validate replay. The after-card state must be sufficient to rebuild SQL card rows, `review_events`, and projection invalidation/patch inputs without consulting old in-memory session state.

   Alternative considered: keep v1 truth records with hashes only. Rejected because hashes prove a transition happened but do not rebuild the reviewed card state that queues need after restart.

5. Review truth flush is asynchronous and batch-driven.

   Normal rating success does not wait for sync-visible truth segment append. After local durability succeeds, the truth flush runtime writes `projection-applied` journal entries in batches. Pending truth flush work is read from the durable journal; it must not live only in an in-memory queue. The default Review truth flush threshold is 8 records, and the default batch limit can remain higher, such as 64 records, so accumulated backlog can drain without making ordinary review write truth on every rating. Flush triggers are: threshold reached, review view exit, queue complete, plugin unload/SiYuan exit with at most 1 second of wait, startup compensation, and long idle around 5 minutes.

   Alternative considered: flush by a short 1 second idle timer after every rating. Rejected because it adds timer churn and still rewrites whole MessagePack segment files too often under active review.

6. SQLite delta v2 uses bounded MessagePack segments.

   SQL delta/checkpoint persistence moves from one growing `sqlite-delta-log.v1.json` file to a `sqlite-delta/v2` MessagePack segment family. Each committed SQL transaction creates a delta entry that must be durable before command success. Entries are written into one bounded open segment. Later ratings can be merged into that same open segment by rewriting only that bounded file. When the open segment reaches the entry or byte threshold, it is sealed and never rewritten; a new open segment starts.

   Suggested defaults are 16 entries or 64 KiB per open segment, whichever comes first. The checkpoint path can still write a full DB snapshot, then clear covered delta entries only after the checkpoint and manifest are durable in the same storage durability domain.

   `SqliteDeltaCheckpointLayer` therefore distinguishes `durable-checkpoint` from `volatile-projection`. `durable-checkpoint` may use a threshold checkpoint and clear covered delta segments after the durable manifest is written. `volatile-projection` must keep writing bounded delta segments when thresholds are reached and must not clear durable delta during temp DB persist/checkpoint. If a previous volatile projection checkpoint wrote a manifest with `checkpoint.coveredSegmentPaths`, startup replays those segment files in volatile mode instead of trusting that stale clear marker.

   Alternative considered: one file per review rating. Rejected because it explodes file count. Alternative considered: one ever-growing MessagePack file. Rejected because MessagePack has no safe append semantics under current plugin storage APIs.

7. Restart replay has one authority order.

   Startup rebuilds the worker SQL projection from the latest checkpoint plus SQLite delta v2 segments, then reconciles review journal entries, then schedules truth flush compensation. Projection-backed Review queues must read from this recovered projection. If replay, journal reconciliation, truth-v2 validation, or projection readiness fails, Review opens with explicit unavailable/preparing state and must not rebuild counts from local queue fallback.

   Alternative considered: if SQL replay fails, read legacy MessagePack or local queue state to keep Review usable. Rejected because it can resurrect stale reviewed cards and hide the defect.

## Risks / Trade-offs

- [Risk] `review.feedback` latency increases because durable file writes are now on the success path. -> Mitigation: keep the success gate to journal plus SQL delta/checkpoint only; keep sync truth flush async; use small bounded delta segments.
- [Risk] Crashes can occur between journal and SQL durability steps. -> Mitigation: journal statuses and idempotency keys define startup reconciliation for `prepared` and `projection-applied` entries.
- [Risk] MessagePack delta open segment rewrites still rewrite a file per rating. -> Mitigation: the rewritten file is bounded by entry/byte thresholds instead of growing indefinitely; sealed segments are immutable.
- [Risk] Truth flush can remain pending if SiYuan exits quickly. -> Mitigation: local durability has already succeeded; pending truth work is recoverable from the durable journal; unload waits up to 1 second, and startup compensation flushes remaining `projection-applied` entries.
- [Risk] No v1 migration means old development data is ignored by the new v2 delta/truth readers. -> Mitigation: this change is explicitly scoped to the new runtime path; v1 migration is out of scope by user decision.

## Migration Plan

1. Add failing regression coverage for formal Review feedback that succeeds, restarts/replays the worker SQL projection, and keeps the reviewed card out of the ready Incremental Learning queue.
2. Change formal `review.feedback` SQL transactions to persist and require SQL delta/checkpoint durability before success.
3. Remove or narrow review-feedback host-effect suppression so required SQLite durability writes are allowed and failures propagate.
4. Add Review truth v2 record building/validation and store the complete payload candidate in the journal before SQL success.
5. Add async Review truth flush scheduling with threshold, lifecycle, unload, startup compensation, and long-idle triggers.
6. Implement SQLite delta v2 MessagePack segment persistence and replay, with no v1 migration.
7. Wire startup replay/reconciliation to recover checkpoint + deltas + review journal before Review queues report ready.
8. Validate targeted tests, hidden fallback checks, boundary checks, build, and manual SiYuan restart smoke.

Rollback path: disabling the new runtime must not silently claim successful formal reviews without the old durability contract. Since no v1 migration is promised, rollback of development data requires explicit user repair/export rather than automatic mixed-version replay.

## Open Questions

None for this change. Native SQLite support, truth compaction, and historical v1 migration remain separate decisions.
