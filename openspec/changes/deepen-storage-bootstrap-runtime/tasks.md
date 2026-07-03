## 1. Bootstrap Module Shape

- [x] 1.1 Add a focused Storage Bootstrap Runtime module with typed dependencies, result shape, and fail-closed error propagation.
- [x] 1.2 Move projection-byte startup probing and ignored legacy petal DB diagnostics behind the bootstrap module interface.
- [x] 1.3 Move truth input discovery, truth-without-receipt reconciliation, and required projection rebuild orchestration behind the bootstrap module interface.
- [x] 1.4 Move temp SQL runtime reinitialization after invalid persisted projection load behind the bootstrap module interface.

## 2. Worker Integration

- [x] 2.1 Replace the broad worker startup helper sequence in `WorkerSqliteDatabaseService.init()` with one bootstrap runtime delegation.
- [x] 2.2 Preserve current worker SQL authority by keeping SQL mutation, projection rebuild, and runtime persist calls supplied by worker-owned dependencies.
- [x] 2.3 Preserve existing storage diagnostics and status payloads without changing JSON-RPC methods or backend contracts.

## 3. Tests

- [x] 3.1 Add focused bootstrap runtime tests for truth-backed projection rebuild decisions.
- [x] 3.2 Add focused bootstrap runtime tests for fail-closed behavior when projection is unusable and required truth input is missing.
- [x] 3.3 Keep or extend worker SQLite startup tests proving active startup behavior still ignores petal `siyuanmemo.db` and rebuilds temp projection from truth.

## 4. Documentation And Validation

- [x] 4.1 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed/deferred storage bootstrap architecture debt.
- [x] 4.2 Update `ARCHITECTURE.md` only if the storage startup ownership description materially changes.
- [x] 4.3 Run `openspec validate deepen-storage-bootstrap-runtime --strict`.
- [x] 4.4 Run focused worker/storage tests for the extracted bootstrap path.
- [x] 4.5 Run `node scripts/check-hidden-fallbacks.cjs`, `pnpm run check:boundaries`, `pnpm build`, and `git diff --check`.
