## 1. Characterization

- [x] 1.1 Add focused Xiuyuan sync tests for full sync create/update/delete behavior on the active application path.
- [x] 1.2 Add focused tests for canonical ownership ordering: local-owned, riff-managed, updatedAt, createdAt, id.
- [x] 1.3 Add failure-path coverage proving planning failure does not mutate local Xiuyuan storage.

## 2. Planning Module

- [x] 2.1 Extract a Xiuyuan Sync ChangeSet planner from `XiuyuanSyncService`.
- [x] 2.2 Move canonical ownership selection into a small domain policy helper with direct tests.
- [x] 2.3 Preserve Riff card type, render profile, cloze render mode, and creation-rule metadata in planned updates.
- [x] 2.4 Align application planning output with worker `WorkerXiuyuanSyncPlanner` plan/apply vocabulary where safe.

## 3. Commit Seam

- [x] 3.1 Route full sync mutations through `applySyncChangeSet()` or an equivalent single repository commit seam.
- [x] 3.2 Route incremental sync mutations through the same seam where behavior matches full sync semantics.
- [x] 3.3 Remove or document any remaining direct per-Xiuyuan save/delete paths that cannot move in this slice.
- [x] 3.4 Keep native Riff reads and block attr writes behind existing ports/adapters.

## 4. Verification And Documentation

- [x] 4.1 Run focused Xiuyuan sync planner/service tests and worker planner parity tests where touched.
- [x] 4.2 Run `openspec validate harden-xiuyuan-sync-changeset-commit --strict`.
- [x] 4.3 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, `git diff --check`, and `pnpm build`.
- [x] 4.4 Update `QUEUE_ARCHITECTURE.md`, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred Xiuyuan sync debt.
