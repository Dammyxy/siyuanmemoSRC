## Why

`XiuyuanSyncService` still mixes Riff fact reads, canonical Xiuyuan selection, metadata mutation, card creation planning, and repository commits in one broad sync path. This keeps the Xiuyuan sync Interface shallow and leaves the existing backlog item, "build `SyncChangeSet` first, then commit once", unresolved.

## What Changes

- Introduce a Xiuyuan Sync ChangeSet Commit capability that plans all Xiuyuan sync updates before mutating local storage.
- Move canonical Xiuyuan ownership selection behind one tested rule: `local-owned > riff-managed > updatedAt > createdAt > id`.
- Route full and incremental sync through the same plan-then-commit path where possible.
- Keep native Riff fact reads behind the existing Xiuyuan sync port/adapter.
- Preserve existing Riff card creation semantics and render-hint metadata for valid sync inputs.
- Do not change Review scheduling, queue membership, SQL worker ownership, writer relay, kernel sidecar behavior, AI workbench, or agent behavior.

## Capabilities

### New Capabilities
- `xiuyuan-sync-changeset-commit`: Xiuyuan sync builds a complete change set and commits it through one storage mutation seam.

### Modified Capabilities

## Impact

- Affected code: `src/application/services/XiuyuanSyncService.ts`, `worker/xiuyuan/WorkerXiuyuanSyncPlanner.ts`, `src/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter.ts`, Xiuyuan sync tests, `QUEUE_ARCHITECTURE.md`, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Runtime behavior: no intended happy-path sync behavior change; sync failure modes become more explicit before storage mutation.
- Boundaries: Xiuyuan sync remains application-owned unless an existing backend sync command is already the active owner for the selected path.
