## Why

Live Review logs now show storage is no longer writing `siyuanmemo.db`, but `review.session.feedback` still spends ~550-680ms inside `session-feedback-total` while host effects explain only ~50-80ms. The remaining latency is hidden behind a shallow timing surface, so we cannot tell whether the cost is commit, undo-journal append, session advancement, result shaping, or timing attribution.

## What Changes

- Add Review session feedback timing spans around the post-commit hot-path steps that currently sit inside `session-feedback-total`.
- Add SQLite delta write metadata for open/sealed segment and manifest writes so host summaries stop reporting `purpose=unknown substep=unknown` for expected delta writes.
- Keep these diagnostics as structured timing evidence and slow-summary inputs; do not add noisy normal-path logs.

## Capabilities

### New Capabilities
- `review-session-feedback-latency-diagnostics`: Diagnostic coverage for Review session feedback latency attribution.

### Modified Capabilities
- `sql-first-card-runtime`: SQLite delta host-effect metadata now identifies append/write substeps for Review hot-path storage evidence.

## Impact

- Affected code: `worker/review/WorkerReviewSessionRuntime.ts`, `worker/bootstrap/ReviewFeedbackTimingScope.ts` tests if needed, SQLite delta persistence host-effect metadata, focused Review timing tests.
- Affected docs: `ARCHITECTURE.md`, `docs/DDD_RESCAN_BACKLOG.md`.
- No behavior change to scheduling, queue selection, durable commit, or fail-closed storage semantics.
