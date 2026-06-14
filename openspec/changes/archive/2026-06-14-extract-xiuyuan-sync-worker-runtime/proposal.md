## Why

`WorkerSqliteDatabaseService` still owns the Xiuyuan sync local-facts read path, apply transaction, row upsert/delete helpers, payload comparison, schedule merge, and checkpoint persistence. Kernel transaction queue extraction proved the worker DB family split pattern; Xiuyuan sync apply is the next low-risk non-AI family with clear DB-owned behavior and existing focused coverage.

## What Changes

- Extract Xiuyuan sync local-facts read and apply behavior from `WorkerSqliteDatabaseService` into a dedicated worker runtime Module.
- Keep `WorkerSqliteDatabaseService` as the public compatibility facade for `readXiuyuanSyncLocalFacts()` and `applyXiuyuanSyncPlan()`.
- Supply explicit SQL runtime, repository, and clock dependencies from the worker DB layer; do not create a second SQLite ownership path.
- Move Xiuyuan sync payload normalization, row comparison, schedule merge, tombstone/checkpoint writes, and related helpers into the runtime where safe.
- Add focused runtime tests, then shrink broad worker/backend tests only where runtime coverage replaces duplicated behavior.
- Preserve `xiuyuan.sync.execute` RPC method string, result shapes, idempotency behavior, SQL schema, and native Riff read proxy contract.
- Do not touch AI/Job/Hotspot, AI workbench, agent paths, Review truth policy, queue projection policy, or Browser read-model behavior.

## Capabilities

### New Capabilities

### Modified Capabilities
- `worker-sqlite-runtime-families`: Xiuyuan sync worker read/apply behavior is delegated from `WorkerSqliteDatabaseService` to a narrow runtime Module with explicit dependencies.

## Impact

- Affected code: `worker/db/SqliteDatabaseService.ts`, new or existing `worker/xiuyuan/*` runtime module, Xiuyuan sync worker/backend tests, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Runtime behavior: no intended RPC, persistence, or sync policy behavior change.
- Boundaries: SQL transaction ownership remains in the worker DB layer through injected dependencies; native Riff read/audit stays behind the existing backend host-effect dependency.
