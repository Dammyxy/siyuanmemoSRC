## 1. Regression Harness

- [x] 1.1 Add a failing worker/backend regression test that commits formal `review.feedback`, replays backend storage as after SiYuan restart, and proves the reviewed Incremental Learning card does not return to the ready count.
- [x] 1.2 Add a failing test for the current `persist: false` path proving SQL memory commit without SQL delta/checkpoint durability cannot report formal Review success.
- [x] 1.3 Add transport tests proving pending `review.feedback` allows required `sqlite.writeJSON` and `sqlite.writeBinary` durability host effects and propagates their failures.
- [x] 1.4 Add journal reconciliation tests for `prepared` without SQL durable commit and SQL durable commit without `projection-applied` journal status.

## 2. P0 Formal Review Durability Gate

- [x] 2.1 Change `WorkerReviewCardMutationPersistenceModule` formal `review.feedback` transactions to persist SQL delta/checkpoint data instead of running with `{ persist: false }`.
- [x] 2.2 Gate `BackendReviewFeedbackResult.committed` success on journal prepared status, SQL transaction success, SQL delta/checkpoint persistence, queue impact result, Review truth v2 payload validation, and durable `projection-applied` journal status.
- [x] 2.3 Remove or narrow `BrowserSrsBackendWorkerTransport` review-feedback persistence suppression so required SQLite durability host effects are executed during `review.feedback`.
- [x] 2.4 Update `ReviewFeedbackTimingScope` classification to measure required durability host effects without treating their omission as a successful fast path.
- [x] 2.5 Ensure `ReviewCommitUseCase`, `SrsBackendClient`, and Review Transaction Safety Envelope fail closed when the backend returns missing or failed durability status.

## 3. P1 Review Truth V2 And Async Flush

- [x] 3.1 Define Review truth v2 record contracts with complete before-card state, after-card state, review-event identity, source identity, queue identity, scheduler identity, idempotency key, and projection generation metadata.
- [x] 3.2 Store the validated Review truth v2 payload candidate in the journal before formal Review success can be reported.
- [x] 3.3 Update truth replay/backfill tests to prove Review truth v2 can rebuild card scheduling state and `review_events` rows without old in-memory session state.
- [x] 3.4 Implement async truth flush scheduling for threshold 8, review view exit, queue completion, plugin unload with 1 second wait, startup compensation, and long idle around 5 minutes.
- [x] 3.5 Preserve local success when async truth flush fails after SQL durability, and leave `projection-applied` entries available for later compensation with diagnostics.

## 4. P2 SQLite Delta V2 Segments

- [x] 4.1 Add SQLite delta v2 MessagePack segment types, manifest metadata, checksums, replay ordering, and diagnostics.
- [x] 4.2 Implement bounded open segment writes so each formal Review transaction delta is durable before success while later ratings can merge into the same bounded open file.
- [x] 4.3 Implement segment sealing at the configured entry or byte threshold and make sealed segments immutable.
- [x] 4.4 Replace `sqlite-delta-log.v1.json` writes and replay in the active runtime with SQLite delta v2 segment writes and replay, without v1 migration.
- [x] 4.5 Update checkpoint logic so durable checkpoints supersede only covered delta v2 entries after checkpoint manifest persistence.
- [x] 4.6 Add `durable-checkpoint` vs `volatile-projection` storage class handling so temp `siyuanmemo.db` checkpoints cannot clear durable petal SQLite delta, including recovery from old volatile checkpoint manifests with `coveredSegmentPaths`.

## 5. Startup Recovery And Queue Readiness

- [x] 5.1 Replay SQL checkpoint plus SQLite delta v2 segments before projection-backed Review queues report ready.
- [x] 5.2 Reconcile Review journal entries after SQL replay and before Review queue count/session reads.
- [x] 5.3 Schedule startup truth flush compensation for `projection-applied` entries that are not `truth-flushed`.
- [x] 5.4 Ensure projection-backed Review surfaces explicit preparing/unavailable state instead of local queue fallback when replay or reconciliation fails.

## 6. Validation And Documentation

- [x] 6.1 Run targeted Vitest suites for backend review feedback durability, worker DB replay, transport host effects, Review truth v2 flush/replay, SQLite delta v2 replay, volatile projection delta recovery, and Review queue readiness.
- [x] 6.2 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 6.3 Run `pnpm run check:boundaries`.
- [x] 6.4 Run `pnpm build`.
- [x] 6.5 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` for the final durability gate, async truth flush policy, and any intentionally deferred debt.
- [ ] 6.6 Perform manual SiYuan smoke: review one Incremental Learning card, confirm count decrements, restart SiYuan, and confirm the count and first card do not revert.
