## Why

Live Review grading logs still show later answers slowing down around `sqlite.readJSON`, even after moving full SQLite diagnostics off the feedback envelope. The remaining hot path is SQLite delta append reading the manifest/snapshot before each committed transaction.

## What Changes

- Cache the SQLite delta hot-path snapshot/manifest inside the delta checkpoint layer after a successful read or write.
- Reuse the cache for consecutive append operations in the same runtime when no repair/replay/checkpoint operation has invalidated it.
- Preserve durable fail-closed behavior for replay, repair, checkpoint, diagnostics, and startup reads.
- Add regression coverage proving consecutive committed transactions avoid repeated manifest `readJSON` calls while invalidation paths still read durable state.

## Capabilities

### New Capabilities
- `sqlite-delta-hot-path-snapshot-cache`: SQLite delta appends reuse safe in-memory snapshot state for consecutive Review feedback writes.

### Modified Capabilities

## Impact

- `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`
- `src/infrastructure/persistence/sqlite/__tests__/SqliteDatabaseService.test.ts`
- Worker/backend Review feedback tests if storage diagnostics shape changes
- `docs/DDD_RESCAN_BACKLOG.md`
