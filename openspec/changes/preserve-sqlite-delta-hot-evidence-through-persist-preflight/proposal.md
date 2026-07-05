## Why

Latest live Review grading logs still show 1.2-1.5s `review.feedback` worker time dominated by `sqlite.readBinary` after open-segment evidence reuse landed. Code tracing and focused regression showed the next hidden seam: after the SQLite delta open segment rolls over into `sealed-1`, the append hot path still reconstructed the whole snapshot by cold-reading the sealed segment on later Review feedback writes.

## What Changes

- Preserve same-runtime SQLite delta hot evidence for both current open segments and durable-checkpoint sealed segments written by the same runtime.
- Keep checkpointability, manifest identity, snapshot reconstruction, and evidence invalidation owned by `SqliteDeltaCheckpointLayer`.
- Add regressions proving ordinary Review-style appends avoid repeated persisted `readBinary` for open and newly sealed delta segments.
- Preserve fail-closed behavior for explicit diagnostics, replay, repair, discard, checkpoint, corrupt open segment repair, volatile sealed checksum mismatch, and sealed recovery paths.
- Keep host-effect adapters unchanged; no worker transport or renderer bridge binary cache.

## Capabilities

### New Capabilities

- `sqlite-delta-segment-hot-evidence`: SQLite delta append hot path preserves verified same-runtime segment evidence across open-segment rollover during ordinary hot Review feedback writes.

### Modified Capabilities

## Impact

- `src/infrastructure/persistence/sqlite/SqliteDatabaseService.ts`
- `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`
- `src/infrastructure/persistence/sqlite/__tests__/SqliteDatabaseService.test.ts`
- `docs/DDD_RESCAN_BACKLOG.md`
- No new external dependencies
