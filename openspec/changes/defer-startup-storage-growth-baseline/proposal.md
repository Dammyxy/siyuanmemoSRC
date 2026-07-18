## Why

Large live stores can make `db.load` exceed the backend Worker startup readiness timeout because startup currently replays large `review-events` truth families and performs the one-time storage-growth baseline exact inventory before responding. The observed failure times out after 60s while the store contains a large SQLite projection and about 55MB of `review-events` truth, so replay and exact storage inventory work must leave the normal startup response path.

## What Changes

- Defer the one-time storage-growth baseline exact inventory out of synchronous `db.load`/`db.reload` initialization.
- Skip `review-events` record replay during normal startup when an existing SQLite projection is loadable; keep full replay for projection rebuild/recovery paths.
- Seed storage-pressure admission from startup evidence already collected for delta/projection/truth instead of running an exact inventory during startup.
- Run the existing storage-growth exact baseline/maintenance logic through post-ready maintenance or storage-pressure recovery so exact inventory, bounded cleanup, and migration marking still happen.
- Keep mutation admission on cached pressure evidence, and preserve hard-pressure read-only startup when startup evidence already proves hard pressure.
- Add regression coverage proving loadable-projection startup does not replay corrupt/heavy `review-events` segments and Review feedback still rates from cached normal pressure without exact inventory reads.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `worker-sqlite-runtime-families`: Worker startup separates readable database load from heavy review-event replay and exact storage-growth baseline establishment while preserving storage-pressure admission.

## Impact

- Worker startup and storage-pressure admission: `worker/db/SqliteDatabaseService.ts`.
- Startup truth bootstrap: `worker/db/StorageBootstrapRuntime.ts`.
- Worker SQLite startup tests around storage pressure, deferred descriptors, and startup source ordering.
- Storage bootstrap tests for loadable projection startup with large/corrupt review-event truth.
- No backend RPC method, persistent format, truth format, storage path, or deployment behavior changes.
