## Context

The attached production log has two visible symptoms:

- Review feedback latency, with `dominant=kernel:handler` / `worker-entry:handle-to-response` timing around 0.6s to 7.8s.
- Review feedback correctness failure, repeatedly surfacing `SQLite delta segment checksum mismatch: sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack`.

The correctness failure is lower-level than card rating. `SqliteDeltaCheckpointLayer.readSegmentEnvelope()` validates every manifest segment with FNV checksum and byte-size-adjacent metadata before replay. Current local storage proves the active manifest is not replayable:

- Manifest path exists at `sqlite-delta/v2/sqlite-delta-log.v2.manifest.json`.
- Manifest references sealed segments `sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack` through `sealed-27` and open segment sequence 28.
- No referenced nested segment files exist under `sqlite-delta/v2`.
- Legacy root-level `sqlite-delta-log.v2.sealed-1.msgpack` through `sealed-16` exist, but all have different byte sizes and checksums from the manifest.
- Manifest has `checkpoint: null`, so the referenced sealed segments are not known to be covered by a durable checkpoint.

The previous `repair-sqlite-delta-open-segment-checksum` change intentionally covers only mutable open-segment checksum repair. It explicitly keeps sealed segment mismatches fail-hard. This new change handles the adjacent sealed-segment recovery contract without weakening that safety rule.

## Goals

- Explain and encode root cause: Review rating fails because SQLite delta durable replay evidence is missing/corrupt, not because rating computation is wrong.
- Recover sealed segment path drift only when a candidate file exactly matches manifest checksum and byte size.
- Preserve fail-closed behavior for mismatched or missing sealed segments with no checkpoint coverage.
- Add diagnostics that tell users/operators whether repair is possible and which segment blocks replay.
- Keep Review feedback result mapping explicit: storage durability failure remains `repair-required`/`backend-unavailable`, not success.

## Non-Goals

- No blind deletion of sealed segment references.
- No checksum bypass.
- No replay from mismatched legacy root segments.
- No synthetic rebuild of durable review history from partial projections.
- No native SQLite/WAL migration.
- No kernel-side DB writer.
- No broad Browser/projection performance redesign.

## Proposed Design

1. Add a sealed segment recovery probe inside the SQLite delta layer.
   - When `readSegmentEnvelope()` cannot read a manifest path, derive a legacy sibling candidate path from the segment basename.
   - Read the candidate only as a recovery candidate, never as trusted replay input.
   - Accept it only when `bytes.length === segment.byteSize` and `checksumBytes(bytes) === segment.checksum`.
   - If accepted, write/copy the candidate bytes to the manifest path or return the validated bytes and schedule manifest-location repair.
   - If rejected, throw an explicit `SQLite delta segment unrecoverable` error that includes manifest path, candidate path, expected checksum/size, and actual checksum/size.

2. Keep checksum mismatch for an existing manifest-path sealed segment fail-hard.
   - A present file with wrong checksum means corruption, not path drift.
   - Do not clear it unless future checkpoint metadata proves it is covered.

3. Add an operator-safe repair helper or script if code-level auto-repair cannot prove all invariants.
   - It must create a timestamped backup before touching storage.
   - It must refuse to proceed if any candidate fails checksum/size.
   - It must print a segment-by-segment report.
   - It must not mutate live storage while the plugin is running.

4. Improve diagnostics for Review feedback.
   - Preserve durability gate failure.
   - Surface the storage reason as sealed segment missing/mismatch/unrecoverable instead of generic rating failure where possible.

## Current Incident Decision

The current local data cannot be safely “removed” by deleting manifest references or copying root legacy files:

- `sqlite-delta/v2` referenced segment files are all missing.
- Existing legacy root segment files all mismatch manifest checksums and sizes.
- No checkpoint metadata marks those segments as covered.

Therefore the current incident requires either a matching backup/segment source, a valid durable SQLite checkpoint, or an explicit reset/rebuild workflow that accepts loss/reconstruction boundaries. Code should not hide this state.

## Risks

- Auto-repair could mask real corruption if candidate validation is too loose. Mitigation: exact checksum and byte-size match only.
- Storage repair may race with plugin writes. Mitigation: repair helper requires plugin stopped and backs up before mutation.
- Better diagnostics may still leave current local storage blocked. That is intentional when durable evidence is missing.
