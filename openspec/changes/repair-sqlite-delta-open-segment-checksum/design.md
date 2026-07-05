## Context

Current delta v2 persistence uses a manifest plus segment files:

- manifest: `sqlite-delta/v2/sqlite-delta-log.v2.manifest.json`
- open segment: `sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack`
- sealed segments: `sqlite-delta/v2/sqlite-delta-log.v2.sealed-<n>.msgpack`

`readSnapshot()` validates manifest checksums against segment bytes. When the open segment checksum mismatches, `persistCommittedTransaction()` can return checkpoint mode with reason `corrupt-open-segment-checkpoint-repair`. `SqliteDatabaseService.runTransaction()` then exports the full DB and calls `persist()`. But `persist()` calls `clearAfterCheckpoint()`, and `clearAfterCheckpoint()` starts by calling `readSnapshot()` again. If the open segment is still corrupt, repair either fails or records failure, then `runTransaction()` may call `restoreFromPersistedStore()`, which replays pending deltas and can hit the same corrupt segment again.

This makes the repair Module too shallow: callers ask for checkpoint repair, but the implementation still requires the corrupt segment to be readable to clear it.

## Goals

- Make corrupt open-segment checkpoint repair a single-owned storage operation inside the delta checkpoint Module.
- Clear manifest references and segment files using manifest metadata when the segment payload is unreadable.
- Prevent restore replay from reading known-corrupt open segment after a failed repair checkpoint.
- Keep durable hot-path semantics explicit: if full checkpoint write fails, report `SQLITE_DELTA_REPAIR_REQUIRED` rather than pretending the Review commit persisted.

## Non-Goals

- No native SQLite/WAL.
- No kernel-side DB writer.
- No second SQLite owner.
- No stale Browser snapshot fallback.
- No broad DB topology migration.

## Proposed Design

1. Add a delta-layer method or option that clears pending segments by manifest only when the reason is `corrupt-open-segment-checkpoint-repair`.
2. In `clearAfterCheckpoint()`, when `readSnapshot()` fails with open-segment checksum mismatch and storage class allows clearing after checkpoint, write an empty manifest with checkpoint metadata and delete covered segment paths from the manifest.
3. In `SqliteDatabaseService.runTransaction()`, keep the existing `skipRestoreOnPersistFailure` behavior for `corrupt-open-segment-checkpoint-repair`; do not replay known-corrupt pending deltas during failed repair.
4. Add regression tests that simulate:
   - manifest points to open segment with old checksum;
   - open segment bytes mutate/corrupt;
   - next hot `review.feedback` transaction selects checkpoint repair;
   - checkpoint succeeds without replaying corrupt open segment;
   - manifest no longer points to corrupt open segment;
   - reload succeeds.

## Open Questions

- Whether sealed-segment checksum mismatch should remain fail-hard. Initial decision: yes. Only open segment is repairable by checkpoint because it is the mutable tail.
