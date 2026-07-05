## Context

`deepen-sqlite-delta-append-hot-path` made `SqliteDeltaCheckpointLayer` own verified open-segment evidence so consecutive appends can avoid repeated persisted `sqlite.readBinary` reads. The live logs still show repeated `sqlite.readBinary` cost after the first batch of cards. The key runtime shape is segment rollover:

`review.feedback` -> `SqliteDatabaseService.runTransaction()` -> `persistCommittedTransaction()` -> `readAppendHotPathSnapshot()` -> `readSnapshotFromManifest()` -> sealed segment `readBinary`

The open segment rolls over at 16 entries. After rollover, the hot snapshot contains the just-written sealed segment, but the verified evidence cache only covered the open segment. Later appends therefore cold-read `sqlite-delta-log.v2.sealed-1.msgpack` even though this runtime just wrote and checksummed it. Architecturally this keeps the delta module too shallow: it owns segment writes but forgets the verified evidence needed for its own next append.

## Goals / Non-Goals

**Goals:**

- Keep same-runtime verified segment evidence alive across ordinary append reconstruction, including the open segment and durable-checkpoint sealed segments this runtime just wrote.
- Preserve checkpointability correctness for dirty/schema/threshold logic, including the append-preserving persist preflight seam.
- Keep explicit durable evidence paths cold: diagnostics, replay, repair, discard, startup, and forced recovery must still clear and read persisted evidence.
- Add regression coverage at the `SqliteDatabaseService` interface so tests exercise the real append path before and after open-segment rollover.

**Non-Goals:**

- No host bridge cache.
- No native SQLite/WAL migration.
- No kernel-side database writer.
- No change to Review scheduling, queue membership, or domain sync safety rules.
- No weakening of corrupt segment fail-closed behavior.

## Decisions

### Decision 1: Split append preflight from explicit durable reads

`SqliteDeltaCheckpointLayer` exposes an append-preserving checkpointability check for `persist()` preflight. The existing explicit read paths continue to clear hot evidence before reading durable segment bytes.

Alternative considered: remove the preflight from `persist()` entirely. Rejected because `persist()` still needs to know whether pending delta evidence requires a main DB checkpoint even when dirty flags are otherwise clean.

### Decision 2: Generalize verified evidence from open-only to segment-by-path

The new behavior belongs in `SqliteDeltaCheckpointLayer`, not in `SqliteDatabaseService` or worker transport. The layer now stores verified segment evidence by manifest path and exact manifest identity. That lets the append hot path reuse the segment envelope it just wrote after open rollover, while the same layer still owns cache clearing for diagnostics, replay, discard, repair, checkpoint, and failure paths.

Alternative considered: keep only open-segment evidence. Rejected because it matches only the first few Review feedback writes; once the open segment seals, the append path cold-reads sealed bytes again.

### Decision 3: Keep volatile-projection sealed reads fail-closed

Sealed evidence reuse is limited to durable-checkpoint storage. Volatile-projection recovery still cold-reads sealed bytes, so an externally corrupted sealed segment remains detectable.

Alternative considered: reuse all same-runtime sealed evidence regardless of storage class. Rejected because the existing volatile sealed checksum mismatch regression correctly requires a cold persisted read.

### Decision 4: Regression through the public persistence interface

The regression should call Review-style transactions through `SqliteDatabaseService`, not private delta methods. It proves ordinary appends avoid open-segment reads and that appends after segment rollover avoid sealed-segment reads until explicit diagnostics intentionally cold-read durable evidence.

Alternative considered: a unit test on `hasCheckpointablePendingDeltas()`. Rejected because the bug is specifically the interaction between transaction commit, persist preflight, and append construction.

## Risks / Trade-offs

- Hot evidence could hide external mutation during append reconstruction -> Mitigation: only append hot-path reads can reuse verified evidence; explicit diagnostics/replay/repair still clear and cold-read durable evidence.
- Checkpointability could become stale -> Mitigation: preflight reconstructs from the current hot snapshot/manifest identity and still falls back to cold read when evidence mismatches.
- Sealed corruption could be masked in volatile recovery -> Mitigation: sealed evidence reuse is disabled outside durable-checkpoint storage, preserving the volatile sealed checksum mismatch fail-closed regression.
