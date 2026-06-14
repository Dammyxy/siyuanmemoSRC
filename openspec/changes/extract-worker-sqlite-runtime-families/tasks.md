## 1. Family Selection And Characterization

- [x] 1.1 Inventory remaining `WorkerSqliteDatabaseService` family state by Review, queue projection, kernel transaction, Xiuyuan sync, Browser, storage diagnostics, and AI/Job/Hotspot.
- [x] 1.2 Select one low-risk non-AI family, preferably kernel transaction queue or Xiuyuan sync apply, and document why.
- [x] 1.3 Add focused characterization tests for selected facade methods and diagnostics.

## 2. Runtime Extraction

- [x] 2.1 Create a family runtime Module with explicit dependencies supplied by `WorkerSqliteDatabaseService`.
- [x] 2.2 Move selected family state, normalization helpers, diagnostics, and core methods into the runtime.
- [x] 2.3 Keep `WorkerSqliteDatabaseService` public methods as compatibility delegators.
- [x] 2.4 Remove pass-through or duplicate helpers that fail the deletion test after extraction.

## 3. Test Split

- [x] 3.1 Add focused runtime tests for the extracted family.
- [x] 3.2 Shrink broad worker DB or backend adapter tests to compatibility smoke where coverage moved to runtime tests.
- [x] 3.3 Confirm AI/Job/Hotspot and agent paths were not touched.

## 4. Verification And Documentation

- [x] 4.1 Run selected family runtime tests plus affected backend adapter tests.
- [x] 4.2 Run `openspec validate extract-worker-sqlite-runtime-families --strict`.
- [x] 4.3 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, `git diff --check`, and `pnpm build`.
- [x] 4.4 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred worker SQLite family debt.
