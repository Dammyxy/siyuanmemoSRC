## Context

`SqliteDeltaCheckpointLayer.persistCommittedTransaction()` calls `readSnapshot()` before appending each committed transaction. `readSnapshot()` reads the delta manifest through `fileService.readJSON()`, then reads segment envelopes. Live Review logs show this manifest read can become a visible latency component after several ratings.

The layer already owns all append/checkpoint/repair mutations. That makes it the right boundary for a runtime-local cache, as long as the cache is updated only after successful durable writes and cleared before operations that need persisted evidence.

## Goals / Non-Goals

**Goals:**
- Reduce repeated manifest/snapshot `readJSON` work on consecutive delta appends.
- Keep durability semantics unchanged: every append still writes the manifest/segment evidence before success.
- Invalidate cache on checkpoint, repair, reset, recovery, and any path that must re-read disk evidence.
- Keep diagnostics/replay full-fidelity unless they intentionally opt into hot-path evidence.

**Non-Goals:**
- Replace msgpack delta storage with native SQLite/WAL.
- Change transaction ordering, checksums, or sealed/open segment semantics.
- Hide corrupt manifests or missing segments.
- Add cross-runtime shared cache.

## Decisions

- Store a private in-memory snapshot cache in `SqliteDeltaCheckpointLayer`.
- Populate the cache after `readSnapshot()` succeeds and after append writes the next manifest/open segment successfully.
- Use the cache only from the append hot path. Cold diagnostic/replay/repair callers continue to read from disk unless explicitly safe.
- Clear the cache around checkpoint clearing, repair, manifest recovery, reset, and destructive recovery operations.

## Risks / Trade-offs

- A stale cache would risk missing externally written delta entries. Mitigation: scope cache to one layer/runtime and invalidate around all non-append mutation/recovery paths; existing writer ownership means ordinary Review appends are serialized in this runtime.
- Memory use grows with cached snapshot entries. Mitigation: cache mirrors the already-read snapshot and is cleared on checkpoint/repair.
