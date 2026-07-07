## 1. Contract And Tests

- [x] 1.1 Add `review-answer-pipeline` OpenSpec requirements and SQL-first mutation delta.
- [x] 1.2 Add focused `ReviewAnswerPipeline` tests for runtime-backed rating success.
- [x] 1.3 Add focused `ReviewAnswerPipeline` tests for runtime unavailable/conflict fail-closed behavior.

## 2. Pipeline Module

- [x] 2.1 Create `ReviewAnswerPipeline` with a small answer Interface and typed result.
- [x] 2.2 Move runtime-backed rate/skip sequencing from `UnifiedQueueStrategy.onFeedback()` into the pipeline.
- [x] 2.3 Preserve timing step names and CDF next-card preparation behavior through injected hooks.
- [x] 2.4 Export the pipeline from the review-session Module barrel.

## 3. Strategy Integration

- [x] 3.1 Instantiate the pipeline in `UnifiedQueueStrategy`.
- [x] 3.2 Replace the SRS v2 runtime-backed branch in `onFeedback()` with pipeline delegation.
- [x] 3.3 Keep local/legacy, NeuralRoam, and custom action paths behavior-preserving.

## 4. Docs And Debt Ledger

- [x] 4.1 Update `CONTEXT.md` with the Review Answer Pipeline term and ownership.
- [x] 4.2 Update `ARCHITECTURE.md` with the new Review answer hot-path ownership.
- [x] 4.3 Append `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred debts.

## 5. Validation

- [x] 5.1 Run focused Review answer and UnifiedQueueStrategy tests.
- [x] 5.2 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 5.3 Run `pnpm run check:boundaries`.
- [x] 5.4 Run `pnpm build`.
- [x] 5.5 Run `openspec validate deepen-review-answer-pipeline --strict`.
- [x] 5.6 Run `git diff --check`.
