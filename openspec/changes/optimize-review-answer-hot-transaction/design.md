## Context

The previous tracing change made the Review answer bottleneck concrete:

- `scheduler.compute` / `scheduler.commit` are near 0-3ms.
- host IO is tens of milliseconds.
- `sql.sync-metadata-touch` is around 117-126ms because it calls `loadStore()` and `calculateStoreContentHash(store)`.
- `sqlite.delta-pending-estimate` and `sqlite.delta-next-pending-estimate` are around 70-111ms because they serialize the whole pending snapshot.

Anki's answer path keeps the hot transaction narrow: answer card, add revlog, update card/deck stats, then mark collection modified with an mtime/usn stamp. It does not recalculate a whole-collection hash or remeasure all pending history on every answer.

## Goals / Non-Goals

**Goals:**
- Make ordinary Review answer commit O(1) with respect to full store size.
- Make ordinary SQLite delta append threshold checks O(1) with respect to pending snapshot size.
- Keep one durable Review answer transaction.
- Deepen the Review answer transaction Module so hot-path ordering and forbidden full-scan work are local and testable.

**Non-Goals:**
- Do not change FSRS/scheduler algorithms.
- Do not make Review answer success asynchronous.
- Do not split undo evidence, review ledger, card schedule, or sync stamp into a second durable transaction.
- Do not alter Browser/Queue projection authority.
- Do not redesign sync conflict merge or full checkpoint policy.

## Decisions

1. Add a Review mutation stamp path instead of reusing full `touchSyncMetadata()`.
   - Rationale: the hot path needs Anki-style modified evidence, not a full-store content hash.
   - Alternative rejected: keep `touchSyncMetadata()` and cache `loadStore()` results. That keeps the wrong Interface and risks stale full-store hash semantics inside rating.

2. Keep full content hash available outside the rating hot path.
   - Rationale: export/sync/checkpoint diagnostics may still need content hash, but Review answer only needs durable mutation evidence.
   - Alternative rejected: remove content hash entirely. That would be broader sync semantics change.

3. Add pending-byte accounting inside the SQLite delta Module.
   - Rationale: only `SqliteDeltaCheckpointLayer` owns entries, manifest, and threshold classification; callers should not estimate delta size.
   - Alternative rejected: infer size from host effects. That misses CPU-side bytes and threshold semantics.

4. Deepen Review answer transaction after the hot-path fixes.
   - Rationale: the Module should expose one answer Interface and own the sequence internally. Tests should assert that the Interface does not perform full store loads or full snapshot estimates.
   - Alternative rejected: introduce a broad transaction abstraction first. That would increase churn before proving the two concrete hot-path fixes.

## Risks / Trade-offs

- O(1) mutation stamps may produce a non-content hash marker for Review-only changes. Mitigation: preserve revision/modifiedAt/modifiedBy and document that full content hash belongs to sync/checkpoint surfaces, not rating clicks.
- Pending-byte accounting can drift if a snapshot is read from legacy data. Mitigation: normalize snapshot accounting when reading snapshots and when building entries.
- Envelope deepening can become naming churn. Mitigation: only extract/reshape enough to make the hot transaction order testable and prevent full-work regressions.
