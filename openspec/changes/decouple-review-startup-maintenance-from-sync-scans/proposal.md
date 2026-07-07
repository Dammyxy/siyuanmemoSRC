## Why

Review scoring is now fast, but restart maintenance can still be blocked by broad backend diagnostics and passive preflight scans. The observed logs show startup Review truth scheduling timing out on `sqlite.readBinary`, while Review entry, Browser rows, and queue counts time out on `sqlite.readSyncConflictDatabaseSources`.

## What Changes

- Add a narrow Review startup maintenance status path for pending Review truth flush/backfill decisions.
- Stop using broad `diagnostics.status` for `SrsBackendClient.schedulePendingReviewTruthFlush('startup')`.
- Keep Browser/read-only and Review-entry preflights off host sync-conflict source scans.
- Keep explicit sync conflict merge, summarize, cleanup, and forced Review retry paths fail-closed and able to scan conflict sources.
- Add regressions proving passive startup/read paths do not trigger host conflict-source scans or SQLite delta diagnostics.

## Capabilities

### New Capabilities
- `review-startup-maintenance`: Review startup maintenance decides truth flush/backfill work from a narrow Review-owned status Interface without scanning unrelated storage or sync-conflict sources.

### Modified Capabilities

## Impact

- Affected code: `SrsBackendClient`, backend Review RPC contracts/client/adapter, backend preflight merge path in `WorkerSqliteDatabaseService`.
- Affected tests: `SrsBackendClient.test.ts`, backend Review RPC adapter tests, backend Browser/Review sync adapter preflight regressions.
- Affected docs: `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` if production code changes.
