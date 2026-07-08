## Why

All review entry surfaces currently open worker-backed Retrieval Practice through local preparation plus worker-side "latest ready projection" lookup. When Browser has refreshed projection state but topbar has not, two entrypoints can start the same queue from different projection freshness, producing divergent remaining counts and review progress.

## What Changes

- Add a Review Admission Module as the single seam for projection-backed review entry.
- Make Retrieval Practice and Incremental Learning review entry require an admission ticket with projection policy hash and generation before opening the session.
- Pass the ticket through review dialog creation, queue strategy, frontend session runtime, backend RPC, and worker session start.
- Make worker session start use the admitted projection identity instead of selecting the current ready generation by queue type.
- Fail closed when admission cannot produce a readable projection.

## Capabilities

### New Capabilities
- `review-admission`: Review entrypoints admit projection-backed review sessions through one freshness gate and explicit projection ticket.

### Modified Capabilities

## Impact

- Affected code: `DialogManager`, `createUnifiedReviewDialog`, `UnifiedQueueStrategy`, `WorkerReviewSessionQueueRuntime`, backend review RPC contracts, `WorkerReviewSessionRuntime`, queue projection readiness/materialization, targeted review tests, and architecture/backlog docs.
- Runtime impact: Browser toolbar and topbar review routes share one admission path; worker Review session no longer silently starts from stale or mismatched queue projection identity.
