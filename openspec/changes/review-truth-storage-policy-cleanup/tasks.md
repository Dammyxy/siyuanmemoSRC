## 1. Preflight And Context

- [x] 1.1 Run `git status --short --branch` in the active worktree and confirm only this Review truth storage-policy change is present.
- [x] 1.2 Read this change's `proposal.md`, `design.md`, `tasks.md`, and `specs/review-truth-storage-policy-cleanup/spec.md`.
- [x] 1.3 Run `openspec status --change "review-truth-storage-policy-cleanup" --json` and `openspec validate review-truth-storage-policy-cleanup --strict`.
- [x] 1.4 Trace the active Review truth flush/backfill path through `SrsBackendClient`, `BackendReviewRpcAdapter`, `ReviewFeedbackTruthFlushRuntime`, `ReviewSqlTruthBackfillRuntime`, and `SqliteDatabaseService`.

## 2. Focused Review Truth Runtime Tests

- [x] 2.1 Add or tighten a `ReviewFeedbackTruthFlushRuntime` test proving journal entries become `truth-flushed` only after truth append/manifest success.
- [x] 2.2 Add or tighten a flush duplicate-idempotency test proving no duplicate truth record is appended and duplicate diagnostics are persisted.
- [x] 2.3 Add or tighten a flush dependency-failure test proving journal state is not advanced and no fallback path is used.
- [x] 2.4 Add or tighten a `ReviewSqlTruthBackfillRuntime` test proving valid SQL rows write `review-events` truth and patch SQL projection refs.
- [x] 2.5 Add or tighten a backfill invalid-row test proving repair-required result blocks append and SQL ref patching for the batch.
- [x] 2.6 Add or tighten a backfill duplicate-idempotency test proving duplicate truth evidence does not append records or mutate scheduling/card/queue state.

## 3. Targeted RPC Adapter And Diagnostics Tests

- [x] 3.1 Add or tighten `BackendReviewRpcAdapter` coverage for `review.truth.flush` unavailable preconditions and stable method ownership.
- [x] 3.2 Add or tighten `BackendReviewRpcAdapter` coverage for `review.truth.backfill` unavailable/device/generation preconditions.
- [x] 3.3 Add or tighten diagnostics coverage proving pending SQL count/check time, latest backfill result, sync-visible state, and latest error remain explicit.
- [x] 3.4 Confirm backend RPC method strings, request/result shapes, registry family ownership, writer relay ownership, and kernel sidecar ownership are unchanged.

## 4. Minimal Policy Cleanup

- [x] 4.1 Fix only test-proven drift in `ReviewFeedbackTruthFlushRuntime` without changing the Review button success boundary.
- [x] 4.2 Fix only test-proven drift in `ReviewSqlTruthBackfillRuntime` without changing SQL worker authority or adding alternate storage paths.
- [x] 4.3 Fix only test-proven drift in `BackendReviewRpcAdapter` or `SqliteDatabaseService` diagnostics/ref patching while keeping existing RPC contracts.
- [x] 4.4 Confirm no fallback, compat, dual-path, legacy JSON read, stale SQL projection read, local queue repair, or scheduler/card mutation was added.

## 5. Validation And Docs

- [x] 5.1 Run `pnpm exec vitest run worker/truth/__tests__/ReviewFeedbackTruthFlushRuntime.test.ts worker/truth/__tests__/ReviewSqlTruthBackfillRuntime.test.ts --reporter=dot`.
- [x] 5.2 Run targeted backend Review truth/backfill RPC coverage in `worker/bootstrap/__tests__/BackendReviewSyncAutoCardRpcAdapter.test.ts` and/or `worker/bootstrap/__tests__/BackendReviewSyncRpcAdapter.test.ts`.
- [x] 5.3 Run targeted backend client scheduling coverage in `src/application/clients/__tests__/SrsBackendClient.test.ts` if startup/background scheduling behavior is touched.
- [x] 5.4 Run `pnpm run check:boundaries`, `git diff --check`, and `pnpm build`.
- [x] 5.5 Update `docs/DDD_RESCAN_BACKLOG.md` only if production debt is cleared or deferred, and update `ARCHITECTURE.md` only if runtime responsibility mapping changes.
- [x] 5.6 Run `openspec validate review-truth-storage-policy-cleanup --strict` before handoff.
