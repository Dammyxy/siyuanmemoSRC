## Why

SiYuanMemo's published storage is still a single MessagePack snapshot, while the current branch has moved toward a SQL-backed runtime and now needs a durable, sync-safe truth source plus a rebuildable index. Keeping `siyuanmemo.db` under `storage/petal/siyuan-plugin-siyuanmemo` makes an index database look like user truth, creates sync risk, and can rerun migration into invalid DTO states after the DB is deleted.

## What Changes

- Migrate published legacy `unified-cards.msgpack` once into MessagePack truth families under plugin petal storage.
- Move `siyuanmemo.db` out of plugin petal storage and treat it as a temp projection/index that can be dropped and rebuilt from truth.
- Store the legacy migration receipt in truth/petal storage, not inside the temp projection DB.
- Prefer truth over temp DB and legacy MessagePack; never reread legacy MessagePack when truth already exists except for divergence detection.
- Fail closed with explicit storage-unavailable errors when truth migration, validation, device identity, or projection rebuild fails.
- Migrate only formal review logs into `review-events`; keep drill/reschedule/queue/arena data as legacy or later-scope inputs.
- Preserve new/unreviewed scheduling state as empty memory, and repair reviewed empty memory with the configured ts-fsrs seed defaults plus diagnostics.
- Ignore any legacy `storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db`; do not import, delete, migrate, or write it.

## Capabilities

### New Capabilities

- `msgpack-truth-temp-projection-store`: Covers legacy MessagePack migration, truth receipt semantics, temp projection DB ownership, rebuild rules, divergence detection, device identity, writer authority, and storage failure behavior.

### Modified Capabilities

- `sql-first-card-runtime`: Tightens SQL-first runtime requirements so SQL card reads come from a rebuildable projection over truth, not from petal-stored DB authority or hidden legacy snapshot fallback.

## Impact

- Storage layout: `data/storage/petal/siyuan-plugin-siyuanmemo/truth/**` remains sync truth; workspace temp owns `siyuanmemo.db` projection when persistence is available.
- Migration/runtime: `ApplicationContext`, backend Worker startup, truth stores, SQL projection services, review-log import, and storage diagnostics.
- Contracts: backend storage readiness and error codes for `TRUTH_DEVICE_ID_UNAVAILABLE`, `LEGACY_MIGRATION_FAILED`, `LEGACY_DIVERGENCE_DETECTED`, `TRUTH_VALIDATION_FAILED`, `PROJECTION_REBUILD_FAILED`, and `SOURCE_READ_UNAVAILABLE`.
- Dependencies: upgrade `ts-fsrs` to a version that exposes FSRS-6 defaults used for reviewed empty-memory repair.
- Tests: legacy unified MessagePack import, receipt/reconcile/divergence, projection rebuild after DB deletion, invalid truth fail-closed paths, multi-window writer/follower authority, and no petal DB writes.
