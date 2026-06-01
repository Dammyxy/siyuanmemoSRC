## 1. Storage Policy And Contracts

- [x] 1.1 Add storage path constants for petal truth directories, migration receipt path, temp projection DB path, and forbidden petal DB path.
- [x] 1.2 Add typed storage error codes for `TRUTH_DEVICE_ID_UNAVAILABLE`, `LEGACY_MIGRATION_FAILED`, `LEGACY_DIVERGENCE_DETECTED`, `TRUTH_VALIDATION_FAILED`, `PROJECTION_REBUILD_FAILED`, and `SOURCE_READ_UNAVAILABLE`.
- [x] 1.3 Add diagnostics contracts for legacy petal DB ignored, orphan truth segment, quarantined review log, repaired scheduling memory, skipped non-formal logs, and projection rebuild status.
- [x] 1.4 Verify `ts-fsrs` is upgraded to the version that provides the FSRS-6 seed defaults used by migration repair.
- [x] 1.5 Extend storage audit checks so `storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db` cannot be written by production runtime code.

## 2. Truth Device And Segment Infrastructure

- [x] 2.1 Generalize local device identity from review-truth-only storage to a truth-wide persistent local key.
- [x] 2.2 Fail truth writes with `TRUTH_DEVICE_ID_UNAVAILABLE` when persistent local device identity cannot be loaded or created.
- [x] 2.3 Implement truth segment write order as segment, checksum, then manifest commit.
- [x] 2.4 Make truth readers load only manifest-listed segments and report orphan segments without applying them.
- [x] 2.5 Validate manifest-listed checksums and fail closed with `TRUTH_VALIDATION_FAILED` on mismatch.
- [ ] 2.6 Represent truth schema upgrades as new family generations instead of in-place manifest mutation.

## 3. Legacy MessagePack Migration

- [ ] 3.1 Add legacy source detection and SHA-256 hashing for `unified-cards.msgpack`.
- [ ] 3.2 Add receipt read/write/reconcile logic for `truth/migrations/legacy-unified-cards-to-truth.v1.json`.
- [ ] 3.3 Implement no-truth first-start migration from `unified-cards.msgpack` into `card-memory-facts` truth.
- [ ] 3.4 Map active cards to `card-memory.snapshot-imported`, tombstones to `card-memory.tombstone-imported`, and source bindings to `source-binding.snapshot-imported`.
- [ ] 3.5 Preserve unreviewed empty memory as `stability=0` and `difficulty=0`.
- [ ] 3.6 Repair reviewed empty memory with `stability=1.2931` and `difficulty=5.11217071`, with diagnostics.
- [ ] 3.7 Add fallback import diagnostics for older split `cards.msgpack` or `xiuyuan.msgpack` only when `unified-cards.msgpack` is absent.
- [ ] 3.8 Fail closed with `LEGACY_MIGRATION_FAILED` when required card-memory truth cannot be committed.

## 4. Legacy Review Log Migration

- [ ] 4.1 Implement formal `reviewLogs` and `reviewLogsV2` import from `review-logs/YYYY-MM.json` into `review-events` truth.
- [ ] 4.2 Prefer legacy `commitIdempotencyKey` or `attemptId` as review-event idempotency identity.
- [ ] 4.3 Derive stable fallback idempotency keys as `legacy-review-log:<year-month>:<cardId>:<reviewedAt>:<rating>:<attemptId-or-index>`.
- [ ] 4.4 Skip `drillLogsV2` and `rescheduleLogs` with skipped-count diagnostics.
- [ ] 4.5 Quarantine formal review records missing card id or reviewed timestamp without writing review-event truth.
- [ ] 4.6 Include review-event counts, quarantine counts, skipped counts, segment refs, and diagnostics in the migration receipt.

## 5. Startup Priority And Divergence

- [ ] 5.1 Implement startup source priority as truth, then temp projection DB, then legacy MessagePack only before truth exists.
- [ ] 5.2 Rebuild projection from truth when truth exists and the temp DB is missing, corrupt, stale, or schema-incompatible.
- [ ] 5.3 Prevent legacy MessagePack re-import when truth already exists.
- [ ] 5.4 Detect legacy source hash changes after completed receipt and fail closed with `LEGACY_DIVERGENCE_DETECTED`.
- [ ] 5.5 Reconcile truth-without-receipt by trusting truth, rebuilding projection, and writing a reconciled receipt.
- [ ] 5.6 Ignore any petal `siyuanmemo.db` with a diagnostic and no read, migration, deletion, or write.

## 6. Temp Projection Lifecycle

- [ ] 6.1 Move projection DB persistence out of plugin petal storage and into workspace temp when host APIs allow persistent temp files.
- [ ] 6.2 Support in-memory sql.js projection rebuild when persistent temp storage is unavailable in P0.
- [ ] 6.3 Drop or ignore temp DB schema mismatches instead of running long SQL migrations.
- [ ] 6.4 Rebuild card projection indexes from truth before Review and Browser become usable.
- [ ] 6.5 Rebuild review-event indexes from truth before Review and Browser become usable.
- [ ] 6.6 Keep optional queue, arena, semantic, and other projections background-only unless their surfaces explicitly report refreshing or unavailable.

## 7. Runtime Authority And User-Visible Failures

- [ ] 7.1 Ensure only the active writer runtime appends truth and updates or invalidates projection storage.
- [ ] 7.2 Ensure follower windows relay storage mutations to the writer and never write truth or projection locally.
- [ ] 7.3 Return explicit unavailable status when no writer can accept a follower storage mutation.
- [ ] 7.4 Surface storage unavailable toast/dialog messages for migration failure, divergence, projection rebuild failure, validation failure, and source read failure.
- [ ] 7.5 Prevent Review, Browser, and storage mutations from opening in half-usable state after storage initialization fails.

## 8. Tests

- [ ] 8.1 Add migration tests for old `unified-cards.msgpack` first startup creating truth, receipt, and projection.
- [ ] 8.2 Add restart tests proving deleted temp DB rebuilds from truth without reading legacy MessagePack.
- [ ] 8.3 Add tests proving truth plus unchanged legacy source ignores legacy import.
- [ ] 8.4 Add divergence tests proving changed legacy source hash fails with `LEGACY_DIVERGENCE_DETECTED`.
- [ ] 8.5 Add scheduling tests for unreviewed empty memory preservation and reviewed empty memory repair.
- [ ] 8.6 Add review-log tests for formal-only migration, stable idempotency keys, skipped drill/reschedule logs, and quarantined malformed records.
- [x] 8.7 Add truth validation tests for bad segment checksum, orphan segment diagnostics, and unsupported generation failure.
- [ ] 8.8 Add multi-window tests proving follower storage mutation relay and no local truth/projection write.
- [x] 8.9 Add storage audit tests proving petal `siyuanmemo.db` is not written and legacy petal DB is ignored.
- [ ] 8.10 Add startup readiness tests proving Review and Browser wait for card plus review-event projection readiness.

## 9. Documentation And Validation

- [ ] 9.1 Update `ARCHITECTURE.md` with truth ownership, temp projection lifecycle, startup gates, and writer-only truth writes.
- [x] 9.2 Update `docs/DDD_RESCAN_BACKLOG.md` with debt retired and deferred work for compaction, optional truth families, and browser-only writer policy.
- [x] 9.3 Run `openspec validate cutover-msgpack-truth-temp-projection-store --strict`.
- [ ] 9.4 Run focused migration, truth, projection, startup readiness, and multi-window tests.
- [x] 9.5 Run `pnpm run check:boundaries` or `node scripts/check-hidden-fallbacks.cjs`.
- [x] 9.6 Run `pnpm build`.
