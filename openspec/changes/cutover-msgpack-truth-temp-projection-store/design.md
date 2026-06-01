## Context

The published SiYuanMemo release stores card memory in `unified-cards.msgpack` under plugin petal storage. The active branch previously introduced a SQL DB in the same petal directory, then moved toward MessagePack truth plus a SQL projection. The unresolved design issue is ownership: truth should sync with user data, but the SQL DB is only an index/projection and should behave like SiYuan's temp indexes.

The active runtime remains the frontend/backend Worker architecture coordinated by the kernel companion writer lease. The kernel companion must not write `siyuanmemo.db`. The backend Worker owns SQL projection creation, reads, and rebuilds, while truth writes are restricted to the writer authority.

The old published storage is the migration source. The petal DB created by this development branch is not a supported user storage format: only the developer had it and it has already been deleted. If such a DB is found in petal storage, the new runtime reports a diagnostic and ignores it.

## Goals / Non-Goals

**Goals:**

- Convert published `unified-cards.msgpack` into sync-safe MessagePack truth families.
- Store migration receipt and reconciliation state in truth/petal storage, not in the temp DB.
- Keep `siyuanmemo.db` as a rebuildable projection under workspace temp when a persistent temp file API is available.
- Rebuild the projection from truth when the DB is missing, corrupt, stale, or schema-incompatible.
- Gate Review and Browser startup until cards and review-event indexes are projection-ready.
- Detect legacy source divergence after migration and fail closed instead of auto-merging.
- Use one persistent local device identity for all truth families.
- Keep multi-window writes behind the current writer/follower authority.
- Preserve valid new/unreviewed empty memory and repair reviewed empty memory with explicit diagnostics.

**Non-Goals:**

- Do not import or migrate `storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db`.
- Do not use a native SQLite/WAL owner in P0.
- Do not compact or delete truth segments automatically.
- Do not migrate queue, arena, drill, reschedule, semantic, or AI state into truth in this change.
- Do not synthesize historical card-created, card-updated, or card-reviewed events from a snapshot import.
- Do not make the kernel companion a truth or SQL writer.
- Do not keep hidden fallback paths from SQL projection to legacy MessagePack for active runtime reads.

## Decisions

1. Truth is the only durable synchronized authority.

   MessagePack truth lives under `storage/petal/siyuan-plugin-siyuanmemo/truth/**`, alongside a migration receipt at `truth/migrations/legacy-unified-cards-to-truth.v1.json`. The SQL DB is not truth. This matches the SiYuan shape where durable user data and rebuildable indexes have different lifecycles.

   Alternative considered: keep `siyuanmemo.db` under petal storage and treat it as the new primary store. Rejected because SQL projection files are not safe sync truth, deletion forces migration replay, and full DB writes conflict with incremental truth semantics.

2. Projection DB belongs to workspace temp.

   The preferred projection path is the workspace temp area, for example `<workspace>/temp/siyuan-plugin-siyuanmemo/siyuanmemo.db`. If the host cannot provide a persistent temp file API in P0, the runtime may keep the sql.js DB in memory and rebuild on every startup. The invariant is stronger than the exact temp path: the runtime must not write `storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db`.

   Alternative considered: continue writing the projection under plugin petal storage until temp persistence is solved. Rejected because it preserves the main sync hazard this change is meant to remove.

3. Startup uses strict source priority.

   Startup priority is `truth > temp projection DB > legacy unified-cards.msgpack`. If truth exists, legacy MessagePack is no longer an import source. Missing or broken projection DB triggers a rebuild from truth. Legacy MessagePack is only read before truth exists, or after truth exists to verify the receipt's source hash for divergence detection.

   Alternative considered: fall back to legacy MessagePack when projection rebuild fails. Rejected because it hides truth/projection defects and can resurrect stale state.

4. Legacy migration is receipt-gated and idempotent.

   The legacy receipt records migration id, source file, source hash, source byte length, migrated timestamp, local device id, truth schema version, generated truth families, generation ids, counts, segment references, and diagnostics. It is written only after truth segments and manifests commit. It gates future migration attempts but is not a replay source.

   If truth exists but the receipt is missing, the runtime trusts truth, rebuilds the projection, and writes a `reconciled` receipt. It must not re-import legacy MessagePack. If truth exists and the legacy source hash differs from the receipt, startup fails closed with `LEGACY_DIVERGENCE_DETECTED`.

   Alternative considered: store the migration marker in SQL. Rejected because deleting the temp DB would lose migration state and could re-eat legacy snapshots.

5. Truth segment manifests are the commit point.

   Writers append a segment, persist its checksum, then update the family manifest. Readers only load manifest-listed segments. Orphan segments are ignored and reported. Schema upgrades create new generations such as `card-memory-v1` and `review-events-v1`; they do not rewrite older manifests in place.

   Alternative considered: treat every segment file in the folder as live. Rejected because a crash between segment write and manifest update would make partial writes visible.

6. Published legacy data maps to snapshot facts, not fake history.

   `unified-cards.msgpack` imports to `card-memory-facts` snapshot records:
   existing cards become `card-memory.snapshot-imported`, tombstones become `card-memory.tombstone-imported`, and source bindings become `source-binding.snapshot-imported`. Snapshot import does not create historical card lifecycle or review events.

   Formal review logs from `review-logs/YYYY-MM.json` import to `review-events`. The importer accepts review logs and reviewLogsV2, skips drillLogsV2 and rescheduleLogs, and quarantines records missing required card id or reviewed timestamp. Idempotency keys prefer legacy `commitIdempotencyKey` or `attemptId`; otherwise they use `legacy-review-log:<year-month>:<cardId>:<reviewedAt>:<rating>:<attemptId-or-index>`.

   Alternative considered: import all legacy logs into review truth. Rejected because drill and reschedule logs are not formal review outcomes and would pollute analytics and scheduling evidence.

7. Empty scheduling memory is repaired by state.

   Empty memory with an unreviewed card state remains valid as `stability=0` and `difficulty=0`. Reviewed cards with empty memory are invalid for ts-fsrs and are repaired using the FSRS-6 hard seed defaults from ts-fsrs 5.4.1: `stability=1.2931` and `difficulty=5.11217071`, with diagnostics attached to migration or projection repair.

   Alternative considered: reject every empty memory DTO. Rejected because newly created unreviewed cards legitimately start empty.

8. Device identity is local-only and mandatory for truth writes.

   A single persistent local device id covers all truth families. The existing review-only key must be generalized from `siyuanmemo.reviewTruth.deviceId.v1` to a truth-wide key such as `siyuanmemo.truth.deviceId.v1`. The device id must not be stored in petal truth. If persistent local identity is unavailable, truth writes fail closed with `TRUTH_DEVICE_ID_UNAVAILABLE`.

   Alternative considered: generate an ephemeral device id per startup. Rejected because it breaks writer identity and migration receipts.

9. Multi-window authority stays writer-only.

   Only the current writer authority may append truth or update the projection DB. Follower windows relay write commands to the writer. If no writer is available, the runtime reports explicit unavailable status instead of writing locally. This avoids same-device manifest sequence conflicts and preserves the backend migration ownership model.

   Alternative considered: allow every window to write local truth segments with device-prefixed names. Rejected for P0 because same-device concurrent manifests would need a stronger merge protocol.

10. Projection readiness gates active surfaces.

    Review and Browser must not open on a half-rebuilt projection. At minimum, card projections and review-event indexes must be ready before these active surfaces report usable state. Queue, arena, semantic, and other projections may rebuild later only if their surfaces remain explicitly unavailable or refreshing until ready.

    Alternative considered: open Review/Browser against partial DB and backfill in the background. Rejected because it can show stale queues, missing cards, or inconsistent scheduling state.

## Risks / Trade-offs

- [Risk] P0 host APIs may not expose a stable workspace temp file path to the plugin worker. -> Mitigation: allow in-memory sql.js projection with rebuild on startup while preserving the no-petal-DB invariant.
- [Risk] Users with diverged legacy MessagePack after truth migration cannot auto-merge. -> Mitigation: fail closed with a clear `LEGACY_DIVERGENCE_DETECTED` diagnostic and require explicit repair or all-device upgrade.
- [Risk] Truth segment count grows without compaction. -> Mitigation: report compaction candidates but defer automatic compaction/deletion to a later generation-aware change.
- [Risk] Migration may quarantine malformed legacy review records. -> Mitigation: write diagnostics and counts into the receipt; do not block valid card memory import unless truth integrity is affected.
- [Risk] Projection rebuild can make startup slower after DB deletion. -> Mitigation: gate only required card and review-event indexes first, then background rebuild lower-priority projections.

## Migration Plan

1. Add storage policy constants for truth directories, migration receipt path, temp projection path, truth generation ids, and explicit storage error codes.
2. Generalize persistent local device identity from review-truth-only to truth-wide identity.
3. Implement legacy source detection, source hashing, receipt loading, receipt reconciliation, and divergence detection.
4. Import `unified-cards.msgpack` into card-memory truth snapshot facts and source-binding facts.
5. Import only formal review logs into review-events truth with stable idempotency keys and quarantine diagnostics.
6. Harden truth segment commit/read rules around manifest-listed segments and checksums.
7. Move projection DB persistence out of petal storage, rebuild missing or stale projections from truth, and ignore any petal DB with diagnostics.
8. Gate Review and Browser on card and review-event projection readiness.
9. Add fail-closed UI/runtime diagnostics for storage unavailable states.
10. Validate all acceptance scenarios, then update architecture and backlog docs for the new storage ownership model.

Rollback path: if migration has not written truth, users remain on the published legacy snapshot. Once truth exists, rollback must either use a previous plugin that still reads legacy MessagePack without touching truth or an explicit repair/export path; the new runtime must not delete truth or rewrite legacy files automatically.

## Open Questions

None for P0. Queue/arena/semantic truth migration, compaction, and browser-only writer policy are deferred changes.
