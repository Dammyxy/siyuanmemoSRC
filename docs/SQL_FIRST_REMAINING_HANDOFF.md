# SQL-First Remaining Work Handoff

Date: 2026-05-21
Worktree: `H:\project-F\flashcard\.worktrees\siyuan-plugin-siyuanmemo\kernel-companion-p0`
Change just completed: `openspec/changes/deepen-sql-first-card-runtime`

## Current State

`deepen-sql-first-card-runtime` is complete: `openspec instructions apply --change "deepen-sql-first-card-runtime" --json` reports `34/34`, state `all_done`.

The current uncommitted slice includes the final Review mutation module work:

- `worker/review/WorkerReviewCardMutationPersistenceModule.ts`
- `worker/review/WorkerReviewFeedbackRuntime.ts`
- `worker/__tests__/BackendKernel.test.ts`
- `scripts/check-backend-runtime-paths.cjs`
- `ARCHITECTURE.md`
- `docs/DDD_RESCAN_BACKLOG.md`
- `openspec/changes/deepen-sql-first-card-runtime/tasks.md`

Important context is already captured in:

- `ARCHITECTURE.md`
- `docs/DDD_RESCAN_BACKLOG.md`, especially Round 424 and Round 423
- `openspec/changes/deepen-sql-first-card-runtime/{proposal.md,design.md,tasks.md}`
- `openspec/changes/deepen-sql-first-card-runtime/specs/sql-first-card-runtime/spec.md`

## What Is Already SQL-First

The main active runtime has moved from "can use SQL" to "SQL-first with explicit fail-closed boundaries":

- Browser deck page / matched IDs / rows-by-IDs / count / stats use `BrowserCardUniverseReadModule -> SrsBackendClient -> worker Browser RPC`.
- Queue projection reads go through `QueueProjectionReadModule`; projection-backed queues fail closed on missing snapshot rows/cards.
- NeuralRoam card facts use SQL card universe for concept identity, card type, priority, active-source state, and card lookup.
- Xiuyuan `findById()` and `findByBlockId()` use `SqlXiuyuanReadRepository` when SQL is active; block lookup uses `cards.block_id + cards.xiuyuan_id` indexed join.
- Ordinary `review.feedback` now writes through `WorkerReviewCardMutationPersistenceModule` inside `runTransaction('review.feedback')`; card state, `review_events`, domain sync ledger, sync metadata, and queue projection impact commit or roll back together.
- Hidden fallback and boundary checks pass.

## Remaining Work To Fully Eat SQL Benefits

### 1. Archive The Completed OpenSpec Change

The change is implementation-complete but not archived. Run archive workflow after reviewing uncommitted changes.

Recommended skill: `openspec-archive-change` plus `siyuanmemo-plugin-dev`.

Suggested validation before archive:

```powershell
openspec instructions apply --change "deepen-sql-first-card-runtime" --json
pnpm run check:boundaries
pnpm build
```

### 2. Real-Database SQL Profile And Budget Regression

The code structure now uses SQL-first paths, but there is not yet a fresh real-library performance profile for the full main runtime.

Target questions:

- Browser open first page: page / matched IDs / rows-by-IDs / stats latency on a real `siyuanmemo.db`.
- Queue projection snapshot / rowsByIds / counter latency for all active queue types.
- `review.feedback` transaction cost with projection hot-patch and with refresh-required impact.
- Xiuyuan `findById` / `findByBlockId` latency and query plan on a large card/Xiuyuan set.
- Whether existing indexes are enough or need focused additions.

Start from existing diagnostics and tests:

- `src/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository.ts`
- `src/infrastructure/persistence/sqlite/SqlQueueProjectionRepository.ts`
- `src/infrastructure/persistence/sqlite/SqlXiuyuanReadRepository.ts`
- `worker/review/WorkerReviewCardMutationPersistenceModule.ts`
- `worker/review/WorkerReviewFeedbackRuntime.ts`
- `docs/DDD_RESCAN_BACKLOG.md` entries around Browser SQL profile and Round 424

Recommended skills: `siyuanmemo-plugin-dev`, `diagnose`.

### 3. Xiuyuan `findAll()` Decision

`findAll()` intentionally remains a sync/management full-enumeration path. That is acceptable for the completed change, but it is still not a SQL benefit surface.

Before implementing anything, identify active callers:

```powershell
rg -n "findAll\\(|GetAllXiuyuans|allXiuyuans|getAllXiuyuans" src worker
```

Possible outcomes:

- Keep full enumeration if only management/sync diagnostics use it.
- Add a paged/indexed SQL read if UI or sync hot paths need large-scale enumeration.
- Split `findAll()` into explicit management full scan versus user-facing paged query to avoid hiding a full-store load behind a neutral method name.

Recommended skills: `siyuanmemo-plugin-dev`, `openspec-propose` if the semantics need a new change.

### 4. Broaden Mutation Ownership Beyond Ordinary `review.feedback`

`review.feedback` is now SQL-first and transaction-safe. Other mutation families still need the same level of ownership review.

Candidate areas:

- Browser batch operations: delete, suspend/resume, priority, reset, reschedule.
- Source-existence sweep/update and projection invalidation.
- Sync conflict merge and domain sync repair operations.
- Xiuyuan create/delete/apply sync change set write paths.
- Any batch scheduler or card mutation path that still does multi-step persistence without a small mutation module.

The goal is not "move everything into SQL blindly"; the goal is one clear owner per mutation that returns explicit impact/diagnostics and has rollback tests for partial success.

Recommended skills: `siyuanmemo-plugin-dev`, `openspec-propose`, `tdd`.

### 5. Legacy And Compatibility Surface Audit

Normal active paths should not silently fall back, but compatibility/migration/test fixtures still contain old read paths. Audit them only after archiving this change.

Focus:

- Confirm old snapshot/msgpack paths are only migration, explicit compatibility, or tests.
- Confirm no UI direct SQL path was reintroduced.
- Confirm no follower-local writer bypass was reintroduced.
- Keep `scripts/check-hidden-fallbacks.cjs` and `scripts/check-backend-runtime-paths.cjs` aligned with any new modules.

Recommended validation:

```powershell
node scripts/check-hidden-fallbacks.cjs
pnpm run check:boundaries
```

Recommended skills: `siyuanmemo-plugin-dev`, `diagnose`.

## Last Known Validation

Passed in the latest session:

```powershell
pnpm vitest run src\application\usecases\review\__tests__\ReviewCommitUseCase.test.ts src\application\usecases\review\__tests__\ReviewAttemptKernel.test.ts worker\__tests__\BackendKernel.test.ts --testNamePattern "review feedback|projection feedback|queue impact|generation mismatch|rolls back review feedback"
pnpm vitest run src\core\xiuyuan\infrastructure\__tests__\XiuyuanRepository.sql-read.test.ts src\infrastructure\persistence\sqlite\__tests__\SqlXiuyuanReadRepository.test.ts
node scripts/check-hidden-fallbacks.cjs
pnpm run check:boundaries
pnpm build
```

Known non-blocking build warnings remain unchanged:

- i18n hardcoded UI strings: 331
- i18n content abnormalities: 14
- `package.zip` unlink `EPERM`
- Sass legacy JS API deprecation warnings

## Suggested Next Session Prompt

Use `siyuanmemo-plugin-dev`.

First archive or commit the completed `deepen-sql-first-card-runtime` change if desired. Then start a new OpenSpec change for real-database SQL runtime profiling and remaining SQL benefit extraction. Focus first on measuring Browser deck reads, queue projection reads, `review.feedback` transaction cost, and Xiuyuan SQL lookups against a real `siyuanmemo.db`; only add indexes or new read APIs where the profile proves a bottleneck.
