## Why

Live Review grading still spends about 0.9-1.0s per answer in SQLite host effects after the manifest hot-path cache change. The current SQLite delta append module is too shallow: it exposes segment reconstruction cost to every append instead of owning verified append evidence behind a small interface.

## What Changes

- Deepen the SQLite delta append module so consecutive append operations can reuse verified open-segment evidence owned by `SqliteDeltaCheckpointLayer`.
- Avoid repeated worker-to-renderer-to-SiYuan `sqlite.readBinary` reads for the current open segment when the same runtime just verified or wrote that segment.
- Preserve fail-closed behavior for corrupt open segments, corrupt sealed segments, missing segment recovery, repair, replay, checkpoint, diagnostics, and startup reads.
- Add regression coverage that counts open-segment binary reads on consecutive `review.feedback` appends, not only manifest `readJSON` calls.
- Keep worker transport and host bridge as adapters only; do not add a host-effect cache that duplicates checksum/segment invariants outside the SQLite delta module.

## Capabilities

### New Capabilities

- `sqlite-delta-append-hot-path`: SQLite delta append owns verified segment evidence and keeps ordinary Review feedback appends off repeated persisted segment reads.

### Modified Capabilities

## Impact

- `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`
- `src/infrastructure/persistence/sqlite/__tests__/SqliteDatabaseService.test.ts`
- Worker Review feedback storage tests if timing or durability diagnostics need updated assertions
- `docs/DDD_RESCAN_BACKLOG.md`
- No new external dependencies
