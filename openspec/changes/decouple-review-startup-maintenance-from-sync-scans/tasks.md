## 1. Harness

- [x] 1.1 Validate the new OpenSpec change artifacts.
- [x] 1.2 Add focused startup Review maintenance regression proving scheduling no longer calls `diagnostics.status`.

## 2. Review Maintenance Interface

- [x] 2.1 Add `review.truth.maintenanceStatus` contract, client catalog entry, typed client method, and backend Review RPC handler.
- [x] 2.2 Switch `SrsBackendClient.schedulePendingReviewTruthFlush()` to read the new Review maintenance status.
- [x] 2.3 Add backend Review RPC coverage for maintenance status without broad diagnostics.

## 3. Passive Preflight Scan Removal

- [x] 3.1 Add regression proving Browser/read-only preflight does not call `readSyncConflictDatabaseSources`.
- [x] 3.2 Add regression proving Review-entry `domainSync.status` preflight does not call `readSyncConflictDatabaseSources`.
- [x] 3.3 Update `mergeExternalDatabaseIfChanged()` so `skipMainDbRead` read-only/review-entry preflights skip conflict-source scans while explicit workflows still scan.

## 4. Docs And Validation

- [x] 4.1 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md`.
- [x] 4.2 Run focused Vitest for changed client/backend slices.
- [x] 4.3 Run `node scripts/check-hidden-fallbacks.cjs`, `pnpm run check:boundaries`, `openspec validate decouple-review-startup-maintenance-from-sync-scans --strict`, `git diff --check`, and `pnpm build`.
