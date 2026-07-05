## Why

Live Review logs show `SQLite delta segment checksum mismatch: sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack` during both `queue.projection.replace` and `review.feedback`. Browser warmup deferral reduced one source of contention, but the remaining failure is lower-level: the SQLite delta open segment can become unreadable while the manifest still points at it, causing projection hydration to fail and hot Review commits to surface `INTERNAL_ERROR`.

## What Changes

- Repair the SQLite delta open-segment checksum path so a corrupt open segment can be cleared by a full checkpoint without replaying the corrupt segment again.
- Preserve SQL worker ownership of `siyuanmemo.db`; no native SQLite/WAL and no kernel-side DB writer.
- Keep hot Review commits fail-closed if durable checkpoint repair itself fails, but avoid the current self-defeating restore/replay of known-corrupt open segment data.
- Add regression coverage for corrupt open-segment repair during Review feedback / queue projection persistence.
- Update architecture and DDD debt ledger for the storage durability slice.

## Impact

- Affected storage path: `SqliteDatabaseService.runTransaction -> SqliteDeltaCheckpointLayer.persistCommittedTransaction -> persist/checkpoint -> clearAfterCheckpoint/restoreFromPersistedStore`.
- Affected tests: `src/infrastructure/persistence/sqlite/__tests__/SqliteDatabaseService.test.ts`.
- Non-goals: Browser warmup policy, native DB owner, kernel writer, full storage topology migration.
