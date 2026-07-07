## Why

Live Review logs show storage is now on the intended SQLite delta path, but `review.session.feedback` still takes ~570-690ms while host effects explain only ~60-72ms. The current timing surface still collapses the missing time into `session-feedback-total`, because narrow session steps below the slow threshold are filtered out even when the total is slow.

## What Changes

- Add a Review session feedback timing breakdown that can explain slow total time in one report.
- Preserve quiet normal-path logs: do not emit extra info logs for fast ratings.
- When `review.session.feedback` total is slow, include narrow substeps even if individual substeps are below the existing slow threshold.
- Report unattributed session gap so live logs can distinguish real commit/storage work from worker event-loop or await-resumption delay.
- Keep Review scheduling, queue selection, durable writes, and fail-closed behavior unchanged.

## Capabilities

### New Capabilities
- `review-session-feedback-gap-diagnostics`: Diagnostic coverage for slow Review session feedback totals, including sub-threshold step breakdown and unattributed gap evidence.

### Modified Capabilities
None.

## Impact

- Affected code: `worker/review/WorkerReviewSessionRuntime.ts`, Review feedback timing contracts, `BrowserSrsBackendWorkerTransport` summary tests if needed.
- Affected docs: `ARCHITECTURE.md`, `docs/DDD_RESCAN_BACKLOG.md`.
- No behavior change to scheduling, queue state, Review transaction undo, SQLite delta persistence, or Browser/Review authority.
