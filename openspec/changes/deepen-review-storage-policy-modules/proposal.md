## Why

Recent storage work deepened worker startup bootstrap, but two adjacent storage surfaces still have poor locality. Review feedback durability state is assembled inside the broad worker DB module, and storage policy declarations still live inside the large backend RPC contract file. Both make checksum/checkpoint/journal and policy changes harder to reason about than they need to be.

This change deepens those two seams without changing runtime behavior, storage paths, JSON-RPC method strings, or public contract exports.

## What Changes

- Add a focused Review Feedback Storage Envelope module for Review feedback storage-state assembly.
- Move journal projection status, SQLite delta diagnostics, SQL projection impact interpretation, and storage envelope shaping out of `WorkerSqliteDatabaseService`.
- Keep Review feedback mutation, journal writes, truth candidate creation, SQL projection writes, and persistence authority in the existing worker-owned runtimes.
- Move MessagePack truth family policy and SQL projection policy declarations from `packages/contracts/src/backend-rpc.ts` into a smaller storage policy catalog module.
- Preserve export compatibility from `backend-rpc.ts` so current imports and generated backend/client contracts keep working.
- Record the deferred storage debts from the prior bootstrap work: Review feedback journal envelope, storage repair UI/commands, old root-level SQLite delta cleanup, and broader worker DB facade splitting.

## Capabilities

### New Capabilities

- `review-feedback-storage-envelope`: Internal worker Review feedback storage envelope ownership for journal/delta/projection storage-state assembly.
- `storage-policy-catalog`: Internal contracts storage policy catalog for MessagePack truth families and SQL projection policy declarations.

### Modified Capabilities

- `sql-first-card-runtime`: Clarifies that storage policy declarations are catalog-owned while existing backend RPC exports and SQL-first runtime semantics remain compatible.

## Impact

- Code: `worker/db/SqliteDatabaseService.ts`, new worker Review storage module, `packages/contracts/src/backend-rpc.ts`, and a new contracts storage policy catalog module.
- Tests: focused Review feedback storage-envelope tests and existing backend contract tests for policy catalog export compatibility.
- Docs: `ARCHITECTURE.md` only if ownership text changes materially; `docs/DDD_RESCAN_BACKLOG.md` because production/runtime storage architecture debt is reduced.
- Contracts: no JSON-RPC method strings, request/response shapes, truth schemas, storage paths, or runtime storage semantics change.
