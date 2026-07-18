## Why

SiYuanMemo startup currently waits for storage work that is not always required before the plugin shell becomes usable: backend `db.load`, legacy maintenance checks, startup schedule/orphan-card maintenance, Review journal reconciliation, truth promotion, and storage-growth baseline work can all land on the critical path.

Recent backend Worker fixes restored correctness by allowing long startup work to finish, but they also made the remaining latency visible. The next step is to keep fail-closed storage safety while making startup readiness a smaller, faster interface.

## What Changes

- Add a startup performance profile surface that records and reports slow startup spans, with enough locality to identify whether latency came from backend Worker bootstrap, projection load, maintenance, truth work, or application composition.
- Convert startup storage maintenance from an unconditional full-store scan into a receipt/dirty-signal-driven fast path, so completed or unchanged work does not repeatedly scan every card.
- Split backend Worker `db.load` readiness from non-critical maintenance where safe: the startup path must still synchronously fail closed for recovery-required storage, but Review truth promotion, storage-growth baseline work, and projection/journal repair that can safely defer should move behind background work.
- Preserve existing storage authority: no fallback to legacy snapshots, no renderer/kernel DB ownership, no hidden degraded mode, and no skipped recovery gate.
- Add focused tests for fast-path startup maintenance, startup profiling, and deferred-safe backend load maintenance.

## Capabilities

### New Capabilities
- `plugin-startup-critical-path`: Plugin startup readiness, slow-startup diagnostics, receipt-driven startup maintenance, and deferred-safe backend Worker maintenance.

### Modified Capabilities
- `application-context-composition-interface`: Application composition should expose a faster startup-ready interface while keeping runtime access modules explicit and fail-closed.
- `kernel-companion-background-work-status`: Deferred startup maintenance should use background-work lifecycle/status rather than ad hoc timers or hidden async work.
- `worker-sqlite-runtime-families`: Worker storage readiness must distinguish fail-closed recovery gates from maintenance that can safely run after startup.

## Impact

- Code: `src/application/ApplicationContext.ts`, `src/application/services/StartupWorkerStorageMaintenance.ts`, `src/application/clients/SrsBackendClient.ts`, `src/application/backgroundWork/*`, `worker/db/SqliteDatabaseService.ts`, `worker/db/StorageBootstrapRuntime.ts`, and startup diagnostics utilities.
- Tests: focused ApplicationContext/startup-maintenance/backend Worker storage tests, plus existing Worker SQLite and background-work regression coverage.
- Docs: `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` if startup ownership or deferred maintenance lifecycle changes materially.
- Contracts: no JSON-RPC method names, truth schemas, SQLite projection schemas, or storage paths should change.
