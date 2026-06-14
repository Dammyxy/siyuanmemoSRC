## 1. Characterization

- [x] 1.1 Inventory current Xiuyuan sync read/apply helpers inside `WorkerSqliteDatabaseService`.
- [x] 1.2 Add or move focused runtime-level characterization coverage for local facts, create/update/delete apply, skipped local-owned blocks, no-op checkpoints, idle incremental persistence, and schedule merge.
- [x] 1.3 Confirm current backend RPC tests cover only facade/idempotency smoke once runtime coverage owns behavior.

## 2. Runtime Extraction

- [x] 2.1 Create `WorkerXiuyuanSyncRuntime` with explicit SQL runtime, repository, and clock dependencies supplied by `WorkerSqliteDatabaseService`.
- [x] 2.2 Move `readXiuyuanSyncLocalFacts()` implementation and Xiuyuan sync local-facts normalization helpers into the runtime.
- [x] 2.3 Move `applyXiuyuanSyncPlan()` implementation, upsert/delete/checkpoint logic, schedule merge, and Xiuyuan-specific comparison helpers into the runtime.
- [x] 2.4 Keep `WorkerSqliteDatabaseService` public methods as compatibility delegators and remove duplicate helpers that no longer belong there.

## 3. Test Split

- [x] 3.1 Run the new Xiuyuan sync runtime tests red/green around the extracted runtime surface.
- [x] 3.2 Shrink broad backend Xiuyuan sync tests to RPC/facade smoke where behavior moved to runtime tests.
- [x] 3.3 Confirm AI/Job/Hotspot, AI workbench, agent paths, Review truth policy, queue projection policy, and Browser read-model paths were not touched.

## 4. Verification And Documentation

- [x] 4.1 Run focused Xiuyuan sync runtime tests plus affected backend worker/RPC tests.
- [x] 4.2 Run `openspec validate extract-xiuyuan-sync-worker-runtime --strict`.
- [x] 4.3 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, `git diff --check`, and `pnpm build`.
- [x] 4.4 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred Xiuyuan worker runtime debt.
