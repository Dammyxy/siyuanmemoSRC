## Why

Review restart projection reconciliation is currently embedded in the large SQL worker database service. The behavior is correct after the restart durability slice, but the logic mixes journal normalization, durable `review_events` evidence checks, queue projection rebuild decisions, and projection replacement inside one broad infrastructure module.

This change extracts that behavior into a focused Review module with a small interface so restart ordering remains explicit and future Review storage work can test the reconciliation contract without editing the SQL worker authority surface.

## What Changes

- Add a Review journal projection reconciler module that owns restart projection reconciliation for `projection-applied`, `truth-flushed`, and stale `prepared` Review feedback journal entries.
- Move the durable `review_events` evidence check and queue projection rebuild decision out of `worker/db/SqliteDatabaseService.ts`.
- Keep SQL worker startup ordering unchanged: durable SQL replay, Review journal replay/reconciliation, then projection-backed queue readiness.
- Keep existing behavior unchanged: no JSON-RPC method string changes, no SQL worker authority changes, no writer relay or kernel sidecar ownership changes, and no fallback/compat/dual path.
- Add focused reconciler tests that cover no-op behavior, projection replacement, durable-event mismatch, stale prepared reconciliation, and fail-closed error propagation.

## Capabilities

### New Capabilities

- `review-journal-projection-reconciler`: Defines the internal Review restart reconciliation module contract and its behavior-preserving startup integration.

### Modified Capabilities

None.

## Impact

- Affected production code: `worker/db/SqliteDatabaseService.ts`, new `worker/review/ReviewJournalProjectionReconciler.ts`, and any narrow helper types needed for the extracted module.
- Affected tests: new focused tests under `worker/review/__tests__/`, plus the existing backend Review restart adapter suite as regression coverage.
- Affected docs: update `docs/DDD_RESCAN_BACKLOG.md` only if production debt is cleared or deferred; update `ARCHITECTURE.md` only if runtime responsibility mapping changes.
- Validation: focused Vitest for the new reconciler, targeted backend Review restart tests, `pnpm run check:boundaries`, `git diff --check`, `pnpm build`, and `openspec validate extract-review-journal-projection-reconciler --strict`.
