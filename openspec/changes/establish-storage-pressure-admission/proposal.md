## Why

Every formal mutation currently performs a complete storage inventory before opening its SQLite transaction. A single Review rating therefore reads the persisted projection, scans truth manifests, and inspects delta and promotion evidence even when the last exact inventory was normal; the observed rating spent about 4.1 seconds in this path despite the repair merge already being skipped.

## What Changes

- Introduce a Worker-owned storage-pressure admission Module that owns the exact baseline, cached estimates, admission decisions, refresh coalescing, and blocking evidence.
- Build an exact inventory during startup, then admit ordinary formal writes from cached evidence without storage host reads while pressure remains normal.
- Feed successful SQLite delta append evidence back into the admission Module so pending bytes, entries, active files, and conservative projection growth are reclassified in memory.
- Refresh exact inventory in the background at soft pressure and require synchronous verification/maintenance only after cached evidence reaches high or hard pressure.
- Refresh the cache after promotion, compaction, recovery, explicit diagnostics, and other storage-maintenance transitions.
- Preserve hard-pressure fail-closed behavior and the existing legacy-delta recovery authority; this change does not alter adoption, compaction, or orphan-deletion semantics.
- Add a Review feedback regression proving a verified `journaled` durability receipt is produced without reading `siyuanmemo.db` or scanning truth inventory on the normal hot path.

## Capabilities

### New Capabilities

- `worker-storage-pressure-admission`: Cached, evidence-driven admission of Worker formal mutations with bounded refresh and fail-closed pressure transitions.

### Modified Capabilities

- `worker-sqlite-runtime-families`: Storage-pressure admission state and policy move behind a narrow Worker runtime Module while SQLite transaction ownership remains centralized.

## Impact

- Worker storage facade: `worker/db/SqliteDatabaseService.ts` and startup/maintenance lifecycle wiring.
- New Worker Module and focused tests under `worker/db/`.
- SQLite delta persistence result/observation plumbing under `src/infrastructure/persistence/sqlite/`.
- Review feedback and storage-pressure regression tests.
- No backend RPC shape, persistent format, truth authority, or deployment behavior changes.
