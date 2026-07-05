## Why

Latest live Review grading logs still show two remaining latency sources after the existing hot-path changes:

- `review.feedback` blocks for about 1.5-2.3s, with worker timing dominated by `kernel:handler/request-total` and host effects led by `sqlite.readJSON` around 600ms.
- Review `update-state` still spends about 0.9-1.0s while Browser queue projection warmup repairs non-current queues such as incremental-learning and filter-group during active Retrieval Review.

The previous changes established session-frontier advancement and deferred Browser warmup, but live logs show targeted `queue-sync`/repair work can still run during active Review pressure. The next optimization should be narrow: stop non-current Browser projection repair from competing with grading, and remove remaining avoidable SQLite JSON host reads from the worker feedback response.

## What Changes

- Tighten Browser projection warmup review-pressure handling so non-current queues remain deferred while Review is active, including retry/repair passes triggered by previous deferrals.
- Preserve immediate warmup for the Browser-visible/current Review queue only.
- Keep Browser readiness explicit: stale or refreshing queues stay observable and do not fall back to stale rows.
- Reduce `review.feedback` host-effect latency by avoiding full SQLite delta diagnostics reads in the per-answer storage envelope when the hot-path write already proves the minimum durable commit state.
- Keep durability fail-closed for missing journal evidence, failed delta/checkpoint writes, or real current-card conflicts.
- Add focused tests for both remaining bottlenecks and update diagnostics/backlog.

## Capabilities

### New Capabilities

- `review-feedback-pressure-latency`: Review feedback remains responsive while Browser projection warmup/repair and SQLite diagnostics are bounded off the answer hot path.

### Modified Capabilities

- `browser-projection-warmup-review-budget`: Active Review pressure defers non-current repair/retry work until Review pressure clears.
- `review-feedback-durable-write-path`: Per-answer storage envelope must not add avoidable SQLite JSON host reads after minimum durable feedback evidence is committed.

## Impact

- Browser warmup: `src/ui/browser/browserQueueProjectionWarmupRuntime.ts`, `src/ui/browser/__tests__/browserQueueProjectionWarmupRuntime.test.ts`.
- Review worker storage envelope: `worker/db/SqliteDatabaseService.ts`, `worker/review/ReviewFeedbackStorageEnvelope.ts`, focused worker storage tests.
- Docs: `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` if runtime ownership or debt state changes.
- Validation: focused warmup tests, focused worker review/storage tests, `pnpm run check:boundaries`, `pnpm build`, and `openspec validate reduce-review-feedback-pressure-latency --strict`.
