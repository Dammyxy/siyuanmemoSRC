## 1. Regression Coverage

- [x] 1.1 Add a `SqliteDatabaseService` regression proving consecutive Review-style appends avoid repeated open-segment `readBinary`.
- [x] 1.2 Add a `SqliteDatabaseService` regression proving Review-style appends avoid sealed-segment `readBinary` after open rollover.
- [x] 1.3 Preserve explicit diagnostics coverage proving diagnostics cold-read durable segment evidence after hot appends.
- [x] 1.4 Preserve corrupt open repair, failed repair, sealed checksum mismatch, and volatile corrupt-open fail-closed coverage.

## 2. SQLite Delta Persistence Seam

- [x] 2.1 Add a narrow delta-layer checkpointability preflight method that preserves append hot evidence.
- [x] 2.2 Route `SqliteDatabaseService.persist()` through that preflight method instead of the cold explicit checkpointability read.
- [x] 2.3 Generalize verified evidence from open-segment-only to segment-by-path evidence for durable-checkpoint append reconstruction.
- [x] 2.4 Keep explicit `hasPendingDeltas()`, `hasCheckpointablePendingDeltas()`, diagnostics, replay, repair, discard, checkpoint, and append error paths invalidating hot evidence.
- [x] 2.5 Keep volatile-projection sealed-segment corruption fail-closed by cold-reading sealed bytes outside durable-checkpoint storage.
- [x] 2.6 Keep worker transport and host persistence adapters unchanged.

## 3. Architecture And Debt Ledger

- [x] 3.1 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed/deferred debt for this persistence seam.
- [x] 3.2 Update `ARCHITECTURE.md` only if runtime ownership wording changes. No runtime ownership wording changed.

## 4. Validation

- [x] 4.1 Run the focused hot-path regressions before and after the fix.
- [x] 4.2 Run full `src/infrastructure/persistence/sqlite/__tests__/SqliteDatabaseService.test.ts`.
- [x] 4.3 Run `openspec validate preserve-sqlite-delta-hot-evidence-through-persist-preflight --strict`.
- [x] 4.4 Run `pnpm run check:boundaries`.
- [x] 4.5 Run `pnpm build`.
