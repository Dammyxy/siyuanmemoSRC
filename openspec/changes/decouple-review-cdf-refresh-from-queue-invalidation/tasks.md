## 1. Feedback Loop

- [x] 1.1 Add a focused Review scoring regression proving CDF preparation in Retrieval Practice does not create or load `FilterGroupQueue` or `NeuralRoamQueue`.
- [x] 1.2 Add a focused CDF preparation regression proving metadata repair is reported/deferred instead of synchronously persisted before visible card switch.
- [x] 1.3 Add a focused duplicate-safety regression proving noncanonical current CDF duplicates still exit/skip before scoring.
- [x] 1.4 Add a queue invalidation regression proving metadata-only CDF updates do not broad-invalidate RetrievalPractice, IncrementalLearning, and FilterGroup.

## 2. Review CDF Preparation Hot Path

- [x] 2.1 Add read-only/deferred preparation options to the CDF refresh Interface used by Review.
- [x] 2.2 Route `UnifiedQueueStrategy.prepareSelectedReviewCard()` through the read-only/deferred Review CDF preparation mode.
- [x] 2.3 Preserve existing CDF preparation evidence cache behavior for fresh cards, stale signatures, and preparation failures.
- [x] 2.4 Preserve duplicate-card exit behavior without requiring CDF repair writes on the scoring hot path.

## 3. Queue Impact And Invalidation

- [x] 3.1 Extend card mutation options/types with explicit queue-impact metadata for metadata-only CDF repair.
- [x] 3.2 Update `UnifiedDataSourceManager` invalidation so known metadata-only CDF updates avoid broad dynamic queue invalidation.
- [x] 3.3 Keep unknown or scheduling/membership mutations fail-closed with existing broad invalidation.
- [x] 3.4 Add diagnostics for deferred CDF repair and narrow queue impact.

## 4. Docs And Debt Ledger

- [x] 4.1 Update `CONTEXT.md` with Review CDF preparation hot-path ownership.
- [x] 4.2 Update `ARCHITECTURE.md` with CDF read preparation vs repair/write ownership.
- [x] 4.3 Append `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred debts.

## 5. Validation

- [x] 5.1 Run focused Review/CDF preparation tests.
- [x] 5.2 Run focused queue invalidation tests.
- [x] 5.3 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 5.4 Run `pnpm run check:boundaries`.
- [x] 5.5 Run `pnpm build`.
- [x] 5.6 Run `openspec validate decouple-review-cdf-refresh-from-queue-invalidation --strict`.
