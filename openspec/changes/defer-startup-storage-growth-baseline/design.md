## Context

`db.load` is the first Worker readiness RPC during plugin startup. The live failure shows that this RPC can time out at 60s on a store with a loadable SQLite projection, a 35MB temp database, and about 55MB of `review-events` MessagePack truth. Two startup behaviors are on the critical path: normal bootstrap discovers and replays `review-events` truth records even when the SQLite projection is already loadable, and `WorkerSqliteDatabaseService.initialize()` runs an exact storage-growth baseline inventory before returning.

## Goals / Non-Goals

**Goals:**
- Keep normal `db.load` bounded by the readable SQLite projection and safety gates needed to decide startup disposition.
- Avoid replaying `review-events` records when the existing SQLite projection can be loaded.
- Avoid exact storage inventory host scans during normal startup while keeping storage-pressure admission initialized.
- Preserve full truth replay for projection rebuild/recovery paths where the projection is missing or unreadable.
- Run exact storage-growth baseline and migration marking after startup through existing maintenance/recovery paths.

**Non-Goals:**
- No backend RPC shape, persistent schema, MessagePack truth format, or storage path changes.
- No replacement of truth compaction, promotion, or legacy delta recovery semantics.
- No deployment/copy of built artifacts into the live plugin directory.

## Decisions

- **Skip review-event replay only when projection bytes are present.** `StorageBootstrapRuntime.bootstrap()` already probes `siyuanmemo.db`; if bytes exist, startup reads card/queue truth needed for identity and receipt reconciliation but does not discover or replay `review-events` targets. If projection bytes are missing, startup keeps the full replay path so projection rebuild can still reconstruct review-event indexes.
- **Seed pressure admission from startup evidence.** After startup delta evidence and projection bytes are available, `WorkerSqliteDatabaseService` builds a non-exact `StorageInventoryRecord` and seeds `WorkerStoragePressureAdmissionModule`. This keeps formal mutation admission deterministic without a synchronous exact inventory.
- **Keep exact baseline post-ready.** The existing `runOneTimeStorageGrowthBaseline()` remains the exact inventory/maintenance authority, but it is invoked from startup maintenance receipt completion and storage-pressure recovery completion rather than from `initialize()`.
- **Preserve hard-pressure startup behavior from proven evidence.** If seeded startup evidence classifies as hard pressure, readiness remains `read-only-storage-pressure` and the existing storage-pressure recovery descriptor is emitted.

## Risks / Trade-offs

- **Non-exact startup pressure can undercount truth bytes** -> Exact post-ready maintenance still refreshes pressure evidence, and review feedback continues to observe delta growth in memory.
- **Projection-present startup skips corrupt review-event truth** -> This is intentional for availability; projection rebuild and explicit reconciliation paths still use full replay and validation.
- **Receipt completion now includes exact baseline work** -> This work runs post-ready under the existing storage-maintenance flow, avoiding the 60s startup readiness timeout.
