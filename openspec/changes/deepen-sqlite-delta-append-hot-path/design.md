## Context

The active Review feedback path commits scheduling and review history through worker-owned `review.feedback`, then persists SQLite delta evidence through `SqliteDeltaCheckpointLayer`. In the browser worker runtime, SQLite storage reads are not local memory reads. Each `sqlite.readBinary` host effect crosses the worker transport, renderer bridge, `FileService.readBinary()`, and SiYuan `/api/file/getFile`.

The existing `cache-sqlite-delta-hot-path-snapshot` change made the append path reuse the manifest/snapshot cache enough to avoid repeated manifest `readJSON` calls. It did not deepen the segment append interface. `readAppendHotPathSnapshot()` still reconstructs snapshot entries by reading segment envelopes from persisted bytes, and `appendDeltaEntryToSegments()` then reads the same open segment again before writing the new candidate open segment.

From an architecture view, this is a shallow module problem. Callers see a small method, but the module interface does not hide the important invariant: "this runtime already has verified evidence for the open segment it just read or wrote." Because that invariant is not owned locally, every ordinary append pays host storage read cost.

## Goals / Non-Goals

**Goals:**

- Make SQLite delta append a deeper module with locality around verified open-segment evidence.
- Reduce repeated `sqlite.readBinary` reads for ordinary consecutive `review.feedback` appends.
- Keep checksum validation, segment entry-count validation, and repair behavior inside `SqliteDeltaCheckpointLayer`.
- Keep cold evidence reads for replay, diagnostics, checkpoint repair, sealed-segment validation, startup, and cross-runtime recovery.
- Add tests at the SQLite delta module interface so the performance invariant is locked down without depending on browser timing logs.

**Non-Goals:**

- No native SQLite/WAL migration.
- No kernel-side database writer.
- No worker transport or host bridge binary cache.
- No stale fallback when durable delta evidence is unavailable.
- No change to Review queue membership, scheduler rules, or projection routing.

## Decisions

### Decision 1: Cache verified open-segment evidence in the delta module

`SqliteDeltaCheckpointLayer` will own a private verified open-segment cache keyed by the manifest entry identity: path, sequence, checksum, byte size, entry count, and sealed flag. The cached value stores the normalized envelope and enough manifest metadata to prove it still matches the manifest being appended.

Alternative considered: cache `sqlite.readBinary` results in `BrowserSrsBackendWorkerTransport` or `createWorkerPersistenceBridge`. Rejected because the host bridge does not own msgpack envelope normalization, checksum semantics, repair rules, or volatile checkpoint behavior. A host cache would be a shallow speed patch and would split correctness rules across adapters.

### Decision 2: Let append reuse the same verified envelope twice

The append path should avoid reading the same open segment once during snapshot reconstruction and again during append construction. The implementation can pass a verified open envelope through the append hot-path snapshot, or have `appendDeltaEntryToSegments()` resolve the open segment through a cache-aware helper. The interface stays inside `SqliteDeltaCheckpointLayer`.

Alternative considered: skip snapshot reconstruction entirely for hot `review.feedback`. Rejected for this change because threshold decisions, pending counts, and repair behavior already depend on snapshot shape. That larger redesign can wait until the verified-envelope cache proves the cost profile.

### Decision 3: Invalidate on evidence-changing paths

The cache must clear before or after any path that changes durable evidence outside ordinary append sequencing: replay, diagnostics that recover manifest state, checkpoint, repair, discard, missing segment recovery, append failure, delete/clear, and checksum mismatch.

Alternative considered: time-based or generation-based invalidation only. Rejected because corruption and repair paths require explicit evidence boundaries, not time heuristics.

### Decision 4: Keep fail-closed tests stronger than speed tests

Performance tests should count binary reads for consecutive appends, but corruption tests remain higher priority. A cached verified open segment may be reused only when it was verified or written by the same layer instance and still matches the current manifest. Cold reloads and explicit diagnostics must still read persisted bytes and detect corruption.

Alternative considered: trust last write without checksum identity. Rejected because it weakens the existing segment manifest contract.

## Risks / Trade-offs

- Stale in-memory evidence could hide external writes -> Mitigation: cache is scoped to one layer/runtime, keyed to exact manifest entry identity, and invalidated on all non-append evidence paths.
- Corrupt open segment repair might stop triggering in tests -> Mitigation: preserve cold-read scenarios and add explicit invalidation before repair/diagnostic paths.
- Sealed segment corruption could be masked by broader snapshot caching -> Mitigation: cache only the current open segment for ordinary append; sealed segments still cold-read when snapshot reconstruction requires them.
- The module grows internally -> Mitigation: this is intentional depth; callers get a smaller performance/correctness interface while implementation owns the complexity locally.

## Open Questions

- Should the cache also store encoded bytes for the open segment, or only the decoded envelope plus manifest identity? Recommendation: store envelope first; bytes are needed only for checksum identity and already represented in the manifest.
- Should a later change split append planning from full snapshot reconstruction? Recommendation: defer until live logs prove open-envelope reuse is not enough.
