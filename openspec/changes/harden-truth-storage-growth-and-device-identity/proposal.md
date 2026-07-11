## Why

SiYuanMemo currently retains 192 sealed SQLite delta segments, 143 truth segments, and a 27.5 MB temporary database while renderer and Worker storage ownership are not fully converged. Device identity can also change after local temporary state is lost, causing a new truth directory to be created and making synchronization ownership ambiguous.

This change makes canonical truth independently recoverable, bounds file count and disk growth, and stabilizes device ownership before larger datasets and more devices make recovery unsafe or prohibitively expensive.

## What Changes

- **BREAKING** Make the Worker the only production writer for Card, Schedule, Queue, Review, SQLite delta, and MessagePack truth state; remove renderer SQL writes and whole-database save paths family by family.
- Introduce a hybrid canonical truth model: append-only Review facts and undo evidence, compactable Card/Schedule/Queue snapshots and changesets, and durable tombstones.
- Introduce two-stage durability receipts: `journaled` after a complete replayable delta transaction, then `truth-committed` after every required canonical truth output is written and verified.
- Treat one business command/Worker transaction as the atomic durability unit, identified by a stable `mutationId` and promoted idempotently in journal sequence order.
- Add a single-writer Truth Promotion Module that batches ordered mutations, owns truth manifests, advances coverage watermarks, and resumes incomplete promotion after restart.
- Store canonical current state in medium-grained, device-owned, immutable snapshot segments with generation-fenced manifest publication.
- Bound storage growth through promotion, compaction, segment budgets, finite checkpoint retention, and explicit `STORAGE_PRESSURE` failure when uncommitted data cannot be reclaimed safely.
- Replace temporary-file device authority with a stable plugin installation identity replicated in IndexedDB and localStorage; use SiYuan `System.ID` only as a host fingerprint.
- Add explicit identity epochs and keep orphaned prior device truth directories read-only and eligible for reconciliation instead of renaming or silently reclaiming them.
- Define deterministic startup recovery: rebuild disposable SQLite projections, use only verified checkpoints/generations, replay intact uncovered delta, and enter read-only `STORAGE_RECOVERY_REQUIRED` when canonical integrity cannot be proven.
- Reconcile synchronized data at the mutation and aggregate level across device-owned truth directories; never merge SQLite files or use file-level last-writer-wins as domain truth.
- Migrate existing truth identities, over-budget delta/truth segments, and renderer-owned mutation families without retaining long-term dual paths.

## Capabilities

### New Capabilities

- `worker-storage-commit-authority`: Worker-only production mutation ownership, mutation-family cutover, and removal of renderer write fallbacks.
- `truth-durability-promotion`: Atomic mutation receipts, ordered truth promotion, idempotency, coverage watermarks, and restart continuation.
- `bounded-truth-storage`: Immutable snapshot partitioning, checkpoint retention, compaction, storage budgets, and safe segment reclamation.
- `stable-truth-device-identity`: Stable plugin installation identity, redundant local persistence, host fingerprinting, identity epochs, and legacy identity migration.
- `truth-recovery-and-reconciliation`: Verified startup recovery, explicit recovery-required states, and domain-level multi-device truth reconciliation.

### Modified Capabilities

None. Existing SQL-first and worker runtime specifications remain valid; this change adds the canonical durability, bounded-storage, identity, and recovery contracts beneath them.

## Impact

- Worker storage composition, `WorkerSqliteDatabaseService`, SQLite delta checkpointing, MessagePack truth stores, startup bootstrap, background work registry, and shutdown coordination.
- Renderer composition and legacy `SqliteDatabaseService`, `UnifiedStorageManager.save()`, and whole-database persistence paths.
- Review, Card/Schedule, Queue membership, Card CRUD, import, migration, and repair mutation command results.
- Truth manifests, snapshot/changeset/tombstone formats, durability receipts, storage diagnostics, and recovery diagnostics.
- Device identity resolution in `truthDeviceIdentity.ts`, IndexedDB/localStorage adapters, truth directory routing, synchronization discovery, and reconciliation.
- Existing installations require identity migration and a one-time safe promotion/compaction baseline before hard storage budgets become enforcing.
- No native SQLite/WAL migration, full event sourcing conversion, or general-purpose CRDT is introduced by this change.
