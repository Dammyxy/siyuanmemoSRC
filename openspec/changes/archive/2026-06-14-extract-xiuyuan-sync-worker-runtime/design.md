## Context

`xiuyuan.sync.execute` currently routes through `BackendXiuyuanSyncRuntime -> WorkerXiuyuanSyncPlanner -> WorkerSqliteDatabaseService`. The planner already owns request validation, native Riff read/audit dependency handling, sync plan construction, and idempotency is held by the RPC runtime. The worker DB service still owns two Xiuyuan sync responsibilities that form a coherent family: loading local Xiuyuan/card facts from SQLite and applying planned create/update/delete rows inside `xiuyuan.sync.apply`.

This follows the same worker-family extraction direction as kernel transaction runtime extraction: keep the broad DB service as a stable facade, but move family-owned state and helpers into a narrow runtime with explicit dependencies.

## Goals / Non-Goals

**Goals:**
- Extract Xiuyuan sync local-facts read and apply transaction behavior into a dedicated worker runtime.
- Keep the public `WorkerSqliteDatabaseService` facade methods and backend RPC result shapes stable.
- Preserve SQL transaction authority, schema, tombstone behavior, checkpoint persistence, idempotency cache behavior, and native Riff read host-effect boundaries.
- Add focused runtime tests for local-facts read, apply create/update/delete, no-op checkpoint decisions, schedule merge, and plugin-owned skip protection.
- Update architecture/backlog docs with fixed and deferred worker SQLite family debt.

**Non-Goals:**
- No Xiuyuan/Riff sync policy rewrite.
- No new SQL schema, migration, or persistence format.
- No Review truth, queue projection, Browser read-model, AI/Job/Hotspot, AI workbench, or agent work.
- No caller migration away from `WorkerSqliteDatabaseService` facade in this slice.

## Decisions

1. Extract a `WorkerXiuyuanSyncRuntime` behind the existing DB facade.
   - Rationale: local-facts read, apply transaction, payload comparison, schedule merge, tombstone cleanup, and checkpoint writes are all Xiuyuan sync family behavior.
   - Alternative rejected: keep read helpers in DB and move only apply; that would leave half the family in the broad service and weaken the deletion test.

2. Inject SQL/runtime dependencies from `WorkerSqliteDatabaseService`.
   - Rationale: SQL transaction ownership remains centralized; the extracted runtime should use provided `runTransaction`, query, run, and repository dependencies instead of creating another DB path.
   - Alternative rejected: instantiate a separate `RuntimeSqliteDatabaseService` or repository inside the Xiuyuan runtime; that risks hidden dual ownership.

3. Keep `BackendXiuyuanSyncRuntime` and `WorkerXiuyuanSyncPlanner` behavior stable.
   - Rationale: planner policy and RPC idempotency already have focused tests. This change is an implementation locality refactor, not a sync policy change.
   - Alternative rejected: merge planner and apply runtime into one larger module; that would blur read/audit planning and SQL mutation ownership.

4. Move tests down to the runtime where behavior moves.
   - Rationale: broad backend tests should prove facade/RPC wiring, while runtime tests should own create/update/delete, no-op, schedule merge, and local-facts behavior.
   - Alternative rejected: leave all tests in `BackendKernel.xiuyuan-sync.test.ts`; that keeps the same broad test surface after extraction.

## Risks / Trade-offs

- Risk: extracted runtime becomes a pass-through wrapper. Mitigation: move helper logic and focused tests with it, not only public method calls.
- Risk: apply transaction persistence changes accidentally. Mitigation: characterize changed block/card ids, tombstones, no-op rows, checkpoints, and schedule merge before/while extracting.
- Risk: helper moves pull unrelated DB helpers into Xiuyuan runtime. Mitigation: keep dependencies explicit and only duplicate/move tiny local normalization helpers if they are Xiuyuan-specific.
- Risk: broad tests lose coverage. Mitigation: shrink only tests whose behavior is covered by runtime tests and retain RPC/facade smoke.
