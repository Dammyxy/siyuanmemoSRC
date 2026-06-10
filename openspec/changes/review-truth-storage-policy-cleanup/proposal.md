## Why

Review truth flush and SQL truth backfill are now functional, but their storage-policy contract is spread across runtime code, backend RPC diagnostics, contract constants, architecture prose, and older backlog deltas. This makes the next Review storage cleanup risky: future edits can accidentally blur journal state, SQL projection refs, MessagePack truth ownership, and diagnostics without a focused acceptance target.

## What Changes

- Add a narrow Review truth storage policy cleanup contract for `review.truth.flush` and `review.truth.backfill`.
- Tighten the runtime tests around storage policy invariants: successful truth persistence marks journal/SQL projection refs, duplicate truth evidence stays idempotent, invalid SQL rows become repair-required, and dependency failures surface without hidden alternate paths.
- Keep existing JSON-RPC method strings, request/result shapes, SQL worker authority, writer relay, kernel sidecar ownership, and Review button success boundary unchanged.
- Keep MessagePack truth segment ownership explicit: `review-events` truth is the long-term Review fact owner, while SQL `review_events` remains local projection/commit evidence and backfill source.
- Update architecture/backlog only if implementation changes runtime responsibility mapping or clears/defer production debt.

## Capabilities

### New Capabilities
- `review-truth-storage-policy-cleanup`: Defines the internal Review truth flush/backfill storage-policy contract, failure semantics, diagnostics, and implementation boundary for the cleanup slice.

### Modified Capabilities

None.

## Impact

- Affected production code: likely `worker/truth/ReviewFeedbackTruthFlushRuntime.ts`, `worker/truth/ReviewSqlTruthBackfillRuntime.ts`, `worker/bootstrap/rpc/BackendReviewRpcAdapter.ts`, `worker/db/SqliteDatabaseService.ts`, and storage policy constants in `packages/contracts/src/backend-rpc.ts` if tests reveal contract drift.
- Affected tests: focused worker truth runtime tests, targeted backend Review truth/backfill adapter tests, backend client scheduling tests only if diagnostics or sequencing are touched.
- Affected docs: `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` only when production ownership or debt state changes.
- Validation: focused Vitest for Review truth flush/backfill, targeted backend Review truth/backfill RPC coverage, `pnpm run check:boundaries`, `git diff --check`, `pnpm build`, and strict OpenSpec validation.
