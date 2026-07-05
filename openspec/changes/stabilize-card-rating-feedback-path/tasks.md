## 1. Reproduce And Guard The Rating Failure

- [x] 1.1 Add focused backend Review feedback tests for host-effect timeout during minimum durable rating proof
- [x] 1.2 Add SQLite transaction tests for persist failure plus in-memory restore failure during `review.feedback`
- [x] 1.3 Add idempotent retry tests for matching and mismatched card rating idempotency keys
- [x] 1.4 Add client/use-case tests proving unproven backend rating outcomes do not advance visible Review state

## 2. Backend Review Feedback Outcome Semantics

- [x] 2.1 Audit `ReviewCommitUseCase -> SrsBackendClient -> BrowserSrsBackendWorkerTransport -> BackendReviewRpcAdapter -> WorkerReviewFeedbackRuntime` result mapping
- [x] 2.2 Introduce explicit rating outcome classification for committed, duplicate committed, retryable pending, unavailable, conflict, and repair-required
- [x] 2.3 Ensure backend `review.feedback` only reports committed success after scheduler/card state, review event evidence, and idempotency identity are durable
- [x] 2.4 Ensure host-effect timeout or transaction recovery failure returns fail-closed rating outcome instead of ambiguous success

## 3. Hot Path Latency And Secondary Work

- [x] 3.1 Identify synchronous secondary work currently blocking rating success: truth flush, queue projection maintenance, Browser projection warmup, Xiuyuan sync, native-Riff sync, and checkpoint maintenance
- [x] 3.2 Move non-essential secondary work behind deferred or separately reported result state after minimum durable commit succeeds
- [x] 3.3 Keep durability-required storage work inside the synchronous gate and prove it with tests
- [x] 3.4 Preserve diagnostics that name dominant slow phase across UI, client, transport, backend, SQLite, truth, and derived maintenance

## 4. Retry, Reconciliation, And Visible Review State

- [x] 4.1 Make retry handling use idempotency key plus card identity, rating, reviewed timestamp, and queue type
- [x] 4.2 Return duplicate committed success for matching durable evidence without scheduler/event duplication
- [x] 4.3 Fail closed on mismatched retry evidence with explicit conflict diagnostics
- [x] 4.4 Ensure pending truth flush cannot overwrite or invalidate proven committed rating evidence

## 5. Validation And Documentation

- [x] 5.1 Run focused Review backend, SQLite transaction, client/use-case, and reconciliation tests added for this change
- [x] 5.2 Run `pnpm run check:boundaries` or `node scripts/check-hidden-fallbacks.cjs` for fallback regressions
- [x] 5.3 Run `pnpm build`
- [x] 5.4 Update `ARCHITECTURE.md` if hot-path ownership or sequencing changes
- [x] 5.5 Append `docs/DDD_RESCAN_BACKLOG.md` task delta for production code debt fixed or deferred
