## 1. Feedback Loop

- [x] 1.1 Add a regression test that reproduces corrupt open-segment checksum mismatch during hot `review.feedback` checkpoint repair
- [x] 1.2 Add/keep a regression test proving failed checkpoint repair returns `SQLITE_DELTA_REPAIR_REQUIRED` and skips corrupt restore replay
- [x] 1.3 Add a guard test proving sealed segment checksum mismatch is not silently repaired

## 2. Delta Checkpoint Repair

- [x] 2.1 Deepen `SqliteDeltaCheckpointLayer.clearAfterCheckpoint()` so corrupt open segment repair can clear by manifest metadata without reading corrupt segment payload
- [x] 2.2 Keep repair scoped to open segment checksum mismatch only
- [x] 2.3 Ensure checkpoint metadata records covered segment paths and diagnostic error context
- [x] 2.4 Ensure manifest no longer references corrupt open segment after successful full checkpoint

## 3. Transaction Restore Semantics

- [x] 3.1 Preserve `SqliteDatabaseService` fail-closed behavior when checkpoint repair fails
- [x] 3.2 Ensure failed repair does not call restore replay against known-corrupt open segment

## 4. Docs And Validation

- [x] 4.1 Update `ARCHITECTURE.md` for SQLite delta open segment repair ownership if needed
- [x] 4.2 Append `docs/DDD_RESCAN_BACKLOG.md` delta for the storage durability repair
- [x] 4.3 Run focused `SqliteDatabaseService` tests
- [x] 4.4 Run `pnpm run check:boundaries`
- [x] 4.5 Run `pnpm build`
- [x] 4.6 Run `openspec validate repair-sqlite-delta-open-segment-checksum --strict`
