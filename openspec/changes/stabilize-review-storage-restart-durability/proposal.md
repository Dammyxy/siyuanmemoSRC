## Why

After backend RPC modularization, three Review storage/restart durability assertions remain skipped below the RPC adapter seam. The user-visible risk is narrow but serious: a formal Review can be durable enough to return success in-session, yet restart reconciliation can still lose the correct journal/projection relationship and make queue readiness stale.

This change closes only those restart reconciliation gaps. It depends on the existing `stabilize-review-durability-segments` storage foundation and does not reopen RPC routing, method strings, SQL worker authority, writer relay ownership, or kernel sidecar ownership.

## What Changes

- Unskip and fix the three remaining Review storage/restart scenarios in `BackendReviewSyncRpcAdapter.test.ts`.
- Preserve `projection-applied` Review journal entries across explicit checkpoint failure so async truth flush compensation can still run later.
- Rebuild/reconcile restart state so a truth-flushed Incremental Learning review does not return to the ready count after backend storage replay.
- Advance stale `prepared` Review journal entries to `projection-applied` when durable SQL already contains the matching idempotent review event.
- Keep failure behavior explicit: no local queue fallback, no legacy snapshot fallback, no dual RPC path, and no silent success when restart replay or journal reconciliation cannot prove durability.
- Keep scope under Review storage/restart reconciliation; do not add new MessagePack truth family design, SQLite delta storage class design, or RPC family routing changes.

## Capabilities

### New Capabilities

- `review-storage-restart-durability`: Defines the remaining Review restart reconciliation guarantees after local Review feedback durability is already in place.

### Modified Capabilities

None.

## Impact

- Affected tests: `worker/bootstrap/__tests__/BackendReviewSyncRpcAdapter.test.ts` skipped Review storage/restart durability cases.
- Affected worker storage path: Review feedback journal store, startup replay/reconciliation, SQL checkpoint/delta replay, Review truth flush/backfill diagnostics, and queue projection readiness after replay.
- Affected docs if behavior changes: `ARCHITECTURE.md` runtime durability map and `docs/DDD_RESCAN_BACKLOG.md` debt ledger.
- Validation: targeted Review storage/restart Vitest, `pnpm run check:boundaries`, `git diff --check`, `openspec validate`, and `pnpm build` if production storage/runtime code changes.
