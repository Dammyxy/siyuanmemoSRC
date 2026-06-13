## Why

`worker/db/SqliteDatabaseService.ts` still acts as a broad worker database Module that imports and owns Review truth/journal state, queue projection repositories, kernel transaction queues, Xiuyuan sync apply helpers, Browser reads, and storage diagnostics. This keeps worker DB family changes hard to test without exercising a 7k-line Implementation.

## What Changes

- Extract one or two non-AI worker SQLite runtime families behind narrow Interfaces while keeping `WorkerSqliteDatabaseService` as the compatibility facade.
- Prefer low-risk families with clear state ownership, such as kernel transaction queues and Xiuyuan sync apply.
- Move family-owned state, normalization helpers, and tests out of the broad database service.
- Preserve SQL schema, transaction ownership, Review truth durability, queue projection behavior, and public backend RPC method strings.
- Do not touch AI/Job/Hotspot runtime families, agent behavior, or AI workbench storage.

## Capabilities

### New Capabilities
- `worker-sqlite-runtime-families`: Worker SQLite family behavior is delegated from the broad database service to narrow runtime modules without changing public RPC contracts.

### Modified Capabilities

## Impact

- Affected code: `worker/db/SqliteDatabaseService.ts`, `worker/kernel-*` or a new worker kernel transaction runtime, `worker/xiuyuan/WorkerXiuyuanSyncPlanner.ts`, worker DB tests, backend RPC adapter tests where selected families are touched, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Runtime behavior: no intended RPC or persistence behavior change.
- Boundaries: SQL transaction ownership remains in the worker DB layer; extracted family Modules receive explicit dependencies.
