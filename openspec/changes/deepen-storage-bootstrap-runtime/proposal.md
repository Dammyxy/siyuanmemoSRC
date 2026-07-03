## Why

Worker SQLite startup now owns too many storage concerns in one wide module: truth discovery, legacy receipt reconciliation, projection rebuild, runtime reinitialization, and storage diagnostics all live inside `WorkerSqliteDatabaseService`. Recent SQLite delta and restart-durability fixes show the storage model is active and correct, but startup/rebuild behavior lacks locality because bugs must be understood through the whole worker DB module.

This change deepens the storage bootstrap runtime without redesigning storage: `siyuanmemo.db` remains a temp SQL projection, durable truth remains MessagePack truth plus SQLite delta segments, and failures remain fail-closed.

## What Changes

- Add an internal Storage Bootstrap Runtime module that owns startup truth/projection bootstrap decisions behind a focused interface.
- Move worker startup helpers for projection bytes, ignored legacy petal DB diagnostics, truth input discovery, truth-without-receipt reconciliation, required projection rebuild, and temp runtime reinitialization out of the broad worker DB module.
- Preserve all current storage semantics: no petal `siyuanmemo.db` authority, no kernel DB ownership, no legacy snapshot fallback, and no hidden compatibility path.
- Keep review feedback, queue projection, domain sync, and semantic runtime behavior unchanged.
- Add focused tests around the new bootstrap module or its worker integration so startup failure/rebuild behavior is testable without relying on unrelated worker DB responsibilities.

## Capabilities

### New Capabilities
- `storage-bootstrap-runtime`: Internal worker storage bootstrap ownership for truth discovery, temp projection rebuild, fail-closed startup diagnostics, and behavior-preserving delegation from `WorkerSqliteDatabaseService`.

### Modified Capabilities
- `sql-first-card-runtime`: Clarifies that SQL-first startup projection rebuild is owned by the focused storage bootstrap runtime while preserving existing SQL-first truth/projection requirements.

## Impact

- Code: `worker/db/SqliteDatabaseService.ts` and a new worker storage bootstrap module under `worker/db/` or `worker/storage/`.
- Tests: focused worker SQLite/storage bootstrap tests, plus existing worker SQLite regression coverage where needed.
- Docs: `ARCHITECTURE.md` only if startup ownership text changes materially; `docs/DDD_RESCAN_BACKLOG.md` because production storage architecture debt is reduced.
- Contracts: no JSON-RPC method strings, backend contracts, storage paths, truth schemas, or projection schemas change.
