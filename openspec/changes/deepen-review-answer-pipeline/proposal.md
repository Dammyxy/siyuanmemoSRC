## Why

Review answer handling has grown into a shallow orchestration spread across `UnifiedQueueStrategy`, session runtimes, feedback advancement, CDF preparation, transaction capture, and frontend timing logs. That makes the hot path hard to reason about, and small answer-flow changes can accidentally trigger unrelated queue refreshes or noisy diagnostics.

## What Changes

- Introduce a deep `review-answer-pipeline` Module that owns the answer-click sequence behind one Interface.
- Move runtime-backed Review answer orchestration out of `UnifiedQueueStrategy.onFeedback()` into the pipeline: transaction capture, runtime answer, conflict/unavailable handling, cursor/counter sync, next-card preparation, history recording, and result shaping.
- Keep `UnifiedQueueStrategy` as the queue strategy shell for queue selection, non-answer helpers, neural roam routing, and legacy/local paths while the pipeline owns the SRS v2 answer hot path.
- Preserve fail-closed behavior: worker/runtime unavailable or stale current-card conflicts must not fall back to renderer projection reads.
- Preserve CDF presentation preparation and narrow queue-impact evidence from the previous CDF hot-path change.
- Add tests around the pipeline Interface so answer behavior is verified through a smaller, higher-leverage seam.

## Capabilities

### New Capabilities
- `review-answer-pipeline`: Review answer clicks are orchestrated by one deep Module that returns a complete typed result for visible next item, counters, queue impact, commit state, diagnostics, and fail-closed errors.

### Modified Capabilities
- `sql-first-card-runtime`: Review mutation persistence results must remain consumable as one answer-pipeline result without requiring callers to manually stitch queue impact, commit status, and next-card state.

## Impact

- Affected Review path: `src/application/adapters/UnifiedQueueStrategy.ts` and `src/application/adapters/review-session/*`.
- Affected tests: focused Review answer runtime tests and `UnifiedQueueStrategy.performance.test.ts`.
- Affected docs: `CONTEXT.md`, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Validation: focused Vitest, hidden fallback check, boundary check, build, strict OpenSpec validation, and `git diff --check`.
