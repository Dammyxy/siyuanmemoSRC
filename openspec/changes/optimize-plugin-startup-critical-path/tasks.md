## 1. Startup Profile Surface

- [x] 1.1 Add a startup profile reporter that summarizes slow startup spans from existing runtime performance diagnostics.
- [x] 1.2 Wire ApplicationContext startup to emit sanitized slow-start diagnostics only when startup exceeds the configured threshold.
- [x] 1.3 Add focused tests proving slow startup emits top spans and fast startup stays quiet.

## 2. Startup Storage Maintenance Fast Path

- [x] 2.1 Add completed-receipt and dirty-signal inputs to `StartupWorkerStorageMaintenance` without changing existing maintenance behavior when evidence is missing.
- [x] 2.2 Skip schedule normalization full scans when a completed receipt proves the current store identity is unchanged.
- [x] 2.3 Skip orphan-card repair full scans when a completed receipt proves the current store identity is unchanged.
- [x] 2.4 Add focused tests for skipped maintenance, invalid receipt fallback, and receipt update after successful full maintenance.

## 3. Backend Worker Startup Readiness Split

- [x] 3.1 Identify which `WorkerSqliteDatabaseService.init()` startup work is readiness-critical versus deferred-safe, with tests covering existing fail-closed gates.
- [x] 3.2 Move the first safe maintenance slice behind background-work lifecycle/status while keeping storage recovery and hard-pressure gates synchronous.
- [x] 3.3 Add focused tests proving `db.load` returns after readable projection readiness and deferred maintenance reports status/errors through background work.

## 4. Documentation And Validation

- [x] 4.1 Update `ARCHITECTURE.md` if startup readiness versus deferred maintenance ownership changes materially.
- [x] 4.2 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred startup critical-path debt.
- [x] 4.3 Run `openspec validate optimize-plugin-startup-critical-path --strict`.
- [x] 4.4 Run focused startup/maintenance/Worker tests.
- [x] 4.5 Run `pnpm run check:boundaries`, `pnpm build`, and `git diff --check`.
