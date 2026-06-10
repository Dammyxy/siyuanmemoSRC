## 1. Preflight And Harness

- [x] 1.1 Run `git status --short --branch` in the active worktree and confirm no unrelated Browser or backend RPC debt is mixed into this change.
- [x] 1.2 Read this change's `proposal.md`, `design.md`, and `specs/review-storage-restart-durability/spec.md`, plus the existing `stabilize-review-durability-segments` design/tasks/spec context needed for restart ordering.
- [x] 1.3 Locate the three skipped scenarios in `worker/bootstrap/__tests__/BackendReviewSyncRpcAdapter.test.ts` and confirm no JSON-RPC method string, SQL worker authority, writer relay, or kernel sidecar ownership change is needed.

## 2. Checkpoint Failure Journal Preservation

- [x] 2.1 Unskip `keeps projection-applied review feedback journal entries after explicit checkpoint for async truth flush` and run the focused Vitest name to capture the current failure.
- [x] 2.2 Fix the checkpoint/journal cleanup path so failed explicit checkpoint diagnostics do not clear or downgrade `projection-applied` Review feedback journal entries.
- [x] 2.3 Re-run the focused Vitest name and keep the assertion proving `projection-applied` entries remain pending for async truth flush compensation.

## 3. Truth-Flushed Restart Ready Count

- [x] 3.1 Unskip `keeps a reviewed incremental-learning card out of ready count after truth-flushed restart replay` and run the focused Vitest name to capture the current failure.
- [x] 3.2 Fix restart replay/reconciliation ordering so durable SQL checkpoint/delta replay and Review journal reconciliation complete before Incremental Learning ready-count reads.
- [x] 3.3 Re-run the focused Vitest name and keep the assertion proving the reviewed Incremental Learning card does not return to the ready count after restart replay.

## 4. Prepared Journal Idempotency Reconciliation

- [x] 4.1 Unskip `advances stale prepared review journal status when durable SQL already has the idempotent review event` and run the focused Vitest name to capture the current failure.
- [x] 4.2 Fix startup reconciliation so a stale `prepared` Review journal entry advances to `projection-applied` when durable SQL contains the matching idempotent review event.
- [x] 4.3 Re-run the focused Vitest name and keep the assertion proving the durable SQL review event remains single.

## 5. Fail-Closed Readiness And Regression Coverage

- [x] 5.1 Add or extend focused coverage so replay or journal reconciliation failure returns explicit preparing/unavailable state instead of computing projection-backed Review counts from stale local queue materialization.
- [x] 5.2 Run the focused backend Review adapter suite around restart storage, journal reconciliation, and queue readiness to catch cross-slice regressions.
- [x] 5.3 Confirm no fallback, compatibility, dual-path, legacy snapshot, or local queue fallback was added to hide storage/replay errors.

## 6. Validation And Docs

- [x] 6.1 Run targeted Vitest commands for every changed Review storage/restart slice.
- [x] 6.2 Run `pnpm run check:boundaries`.
- [x] 6.3 Run `git diff --check`.
- [x] 6.4 Run `pnpm build` if production runtime or worker code changed.
- [x] 6.5 Update `ARCHITECTURE.md` only if runtime responsibility map changes.
- [x] 6.6 Update `docs/DDD_RESCAN_BACKLOG.md` only if production debt is cleared, deferred, or newly identified.
- [x] 6.7 Run `openspec validate stabilize-review-storage-restart-durability --strict` before handing off or implementation.
