## Context

> Historical supersession (2026-07-17): Decisions 7 and the identity portion of this migration plan describe the former browser-authority implementation. Use [Runtime ADR-006](../../../docs/ADR-006-truth-device-identity-authority.md) and `establish-installation-truth-device-identity-authority` for the current identity contract. Other decisions in this completed change are not superseded by that identity cutover.

SiYuanMemo already uses Worker-owned SQLite transactions, SQLite delta segments, MessagePack Review truth, and temporary SQLite projections, but ownership is incomplete. Renderer composition still exposes write-capable SQL and whole-database save paths; canonical truth coverage is concentrated in Review; truth compaction is planned but not executed; and temporary device identity can disappear or diverge.

Observed local state already contains 192 sealed delta segments, 143 truth segments, a manifest with 131 segments, and a 27.5 MB temporary database. These numbers prove that durability, compaction, file-count limits, identity, and recovery must become one coherent storage contract.

Constraints:

- SiYuan file APIs remain the persistence bridge.
- Temporary SQLite remains a rebuildable projection rather than canonical truth.
- Existing Review durability and writer-relay behavior must remain fail-closed.
- Device-owned truth directories remain independently writable and syncable.
- Production code must not retain renderer fallback writes or long-term dual paths.

## Goals / Non-Goals

**Goals:**

- Make Worker storage commands the only production mutation authority.
- Make every accepted mutation replayable after `journaled` acknowledgement and independently provable after `truth-committed` acknowledgement.
- Bound delta, truth segment, snapshot generation, and temporary database growth.
- Preserve stable device ownership across restart, temporary cleanup, and host fingerprint changes.
- Recover deterministically from projection loss and fail closed when canonical integrity cannot be proven.
- Reconcile synchronized truth at mutation and aggregate level instead of merging SQLite files.

**Non-Goals:**

- Migrating to native SQLite or WAL.
- Converting every domain to permanent event sourcing.
- Introducing a general-purpose CRDT.
- Letting kernel companion own scheduling, truth, or database writes.
- Keeping compatibility write paths after a mutation family is cut over.

## Decisions

### 1. Worker-owned Storage Commit Module

All formal mutations enter one Worker-owned storage command boundary. Renderer and kernel companion may transport commands or host file effects, but cannot create independent SQL, delta, truth, or manifest writers.

Migration proceeds by mutation family: Review, Card/Schedule, Queue membership, Card CRUD, then import and repair. Each family removes its old renderer write path in the same slice that enables Worker authority.

Alternative rejected: one large cutover. It increases recovery risk and makes failures difficult to isolate. Alternative rejected: long-lived dual write. It makes acknowledgement and reconciliation ambiguous.

### 2. Hybrid canonical truth and atomic mutation envelopes

Review facts and undo evidence remain append-only events. Card/Schedule and Queue state use compactable snapshots, changesets, and tombstones. Temporary SQLite is rebuilt from canonical truth plus uncovered delta.

One business command and its Worker transaction form one durability unit. A stable mutation envelope carries `mutationId`, family, device identity and epoch, journal sequence, causal base revision, operations, and required truth outputs. Partial truth output never advances the unit to `truth-committed`.

### 3. Two-stage durability receipts

`journaled` means the SQL transaction and complete replayable delta mutation are durably written and verified. Interactive Review may return success at this stage.

`truth-committed` means every required canonical event, changeset, snapshot update, tombstone, and metadata output has been written and verified. Only this stage advances coverage and permits delta reclamation.

Receipts expose stage, mutation identity, journal sequence, truth generation, coverage state, and diagnostic reason. Callers cannot treat SQL commit or temporary database existence as canonical truth proof.

### 4. Ordered Truth Promotion Module

A single Worker-owned promotion writer consumes journaled mutations in journal-sequence order. It may batch consecutive units into one segment and one manifest publication, but cannot reorder them. Retry reuses the same mutation ID and remains idempotent.

Shutdown stops new promotion intake and either finishes or leaves a replayable batch. Restart resumes uncovered mutations before normal maintenance. Parallel promotion by entity or family is deferred until measurements prove the serial queue is a bottleneck.

### 5. Immutable segmented snapshots and fenced publication

Card and Schedule form one Card Aggregate. Current-state truth is partitioned into medium-grained immutable segments bounded by both aggregate count and encoded byte size. Queue snapshots remain separated by queue family or type.

Compaction writes a complete new generation, verifies every segment, then atomically switches a generation-fenced manifest. Current and previous verified generations are retained; old files are never modified in place.

### 6. Storage budget and finite recovery history

The latest verified checkpoint plus post-checkpoint delta is sufficient to reconstruct current state. Delta is a finite crash journal, not permanent audit history. Review truth retains required business history; compactable families retain current state and tombstones.

Budgets have normal, soft, high, and hard states. Soft pressure schedules maintenance. High pressure performs bounded synchronous promotion or compaction before accepting more growth. Hard pressure that cannot be reclaimed safely returns `STORAGE_PRESSURE`; it never deletes uncovered mutations.

Initial policy targets remain configurable: delta sealed segments target 16, soft 32, hard 64; truth closed segments per family and device target 16, soft 48, hard 96; snapshot segments roughly 256 to 512 aggregates and 2 to 4 MB. Real-data profiling may tune policy without changing the file-format contract.

### 7. Stable plugin installation identity

`pluginInstallationId` is the truth directory authority. IndexedDB and localStorage hold matching identity records; a missing copy is repaired from the valid copy, while conflicting valid copies produce explicit identity recovery rather than arbitrary selection. The temporary JSON file is only a mirror.

The record contains device ID, host fingerprint, identity epoch, creation time, and last-seen time. SiYuan `System.ID` is only the host fingerprint because mobile and non-standard containers may not keep it stable across launches.

If all authoritative copies are lost, a new device ID and epoch are created. Prior device directories remain read-only reconciliation inputs and are never renamed, overwritten, or silently claimed.

### 8. Startup recovery state machine

Disposable SQLite corruption triggers deletion and deterministic rebuild. If the current checkpoint or generation is invalid but the previous verified generation and intact delta are available, recovery uses that evidence and replays forward.

If uncovered delta or canonical truth cannot be verified, startup enters `STORAGE_RECOVERY_REQUIRED`. Last verified state remains readable and diagnostics or backup export remain available, but Review, edits, sync upload, and other writes are disabled. Damaged records are never skipped to continue normal writes.

### 9. Domain-level multi-device reconciliation

File synchronization transports immutable device-owned truth; it does not decide business truth. Reconciliation deduplicates identical mutation IDs, merges independent aggregates, unions append-only Review facts, applies tombstones using causal revisions, and automatically combines only changesets proven commutative.

Concurrent non-commutative mutations against the same aggregate become explicit aggregate conflicts. The affected aggregate is write-frozen until deterministic resolution. Reconciliation publishes a new verified checkpoint and rebuilds temporary SQLite. SQLite conflict copies and file-level last-writer-wins are never authoritative.

## Risks / Trade-offs

- [Migration spans several mutation families] -> Cut over one family at a time and delete its old write path in the same change slice.
- [Journaled success precedes canonical truth] -> Preserve complete replayable delta, expose stage diagnostics, retry promotion, and block reclamation until coverage is proven.
- [Compaction interruption leaves extra files] -> Use immutable generations, checksums, fenced manifests, and orphan quarantine before deletion.
- [Identity copies disagree] -> Fail closed with explicit recovery instead of selecting a convenient copy.
- [Storage pressure can block new writes] -> Run maintenance before hard pressure and expose actionable diagnostics; never trade data integrity for availability.
- [Concurrent same-card changes cannot always merge] -> Preserve both facts, mark aggregate conflict, and prohibit silent last-writer-wins.

## Migration Plan

1. Add versioned identity records and migrate valid legacy localStorage or temporary identity into matching IndexedDB and localStorage copies.
2. Introduce mutation envelopes and two-stage receipts without changing existing Review behavior; prove restart replay and idempotency.
3. Add the ordered Truth Promotion Module and coverage watermarks, then migrate Review truth flush to it.
4. Add Card/Schedule and Queue snapshot, changeset, and tombstone truth families.
5. Cut over Card/Schedule, Queue membership, Card CRUD, import, and repair commands family by family; remove each renderer write path immediately.
6. Implement compaction, generation fencing, checkpoint retention, storage budgets, and one-time migration compaction for existing installations.
7. Enable startup recovery states and domain-level reconciliation, then retire SQLite conflict-copy authority.
8. Delete renderer SQL runtime and whole-database save behavior after all production mutation families use Worker authority.

Rollback before manifest cutover keeps the old verified generation active. After a new format generation is published, rollback requires a build that understands that format or an explicit recovery export; production must not downgrade by rewriting canonical truth with an older writer.

## Open Questions

No product-level decisions remain. Implementation must profile real aggregate sizes and promotion throughput before fixing default segment byte and batch-size policies.
