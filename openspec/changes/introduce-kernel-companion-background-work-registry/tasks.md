## 1. Registry Module

- [x] 1.1 Add registry tests for submit/status/cancel/defer/shutdown behavior.
- [x] 1.2 Implement `KernelCompanionBackgroundWorkRegistry` with in-memory job records and idempotent shutdown.
- [x] 1.3 Add typed job kind/state/result diagnostics for `review-truth-backfill`.

## 2. Review Truth Backfill Migration

- [x] 2.1 Add regression: startup pending Review truth SQL rows submit a registry job.
- [x] 2.2 Add regression: before-unload quick flush does not execute registry backfill work.
- [x] 2.3 Route `SrsBackendClient.schedulePendingReviewTruthFlush()` pending backfill rows through registry submit.
- [x] 2.4 Keep direct quick flush and feedback-triggered journal flush behavior unchanged.

## 3. Shutdown Integration

- [x] 3.1 Add regression: registry shutdown cancels/defer-marks queued Review truth backfill and blocks new submissions.
- [x] 3.2 Wire `SrsBackendClient.dispose()` to registry shutdown.
- [x] 3.3 Ensure late backfill failures do not re-arm timers or create hidden fallback work.

## 4. Docs and Validation

- [x] 4.1 Update `CONTEXT.md` / `ARCHITECTURE.md` with registry-specific wording.
- [x] 4.2 Add debt ledger entry for completed scope and deferred Xiuyuan/ActionPump migration.
- [x] 4.3 Run focused registry/SrsBackendClient/ApplicationContext tests.
- [x] 4.4 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 4.5 Run `pnpm run check:boundaries`.
- [x] 4.6 Run `pnpm build`.
