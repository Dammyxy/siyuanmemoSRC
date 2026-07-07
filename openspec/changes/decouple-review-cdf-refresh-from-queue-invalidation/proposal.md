## Why

Review scoring still sometimes creates and loads unrelated queue Modules after a rating. The current trigger is Review CDF preparation: opening/preparing the next card may write CDF metadata, which invalidates all dynamic queues and causes `FilterGroupQueue` / other queue creation logs even when the user is only reviewing Retrieval Practice.

## What Changes

- Split Review CDF preparation into a read-only hot path and an explicit repair/write path.
- Make Review card switching tolerate CDF preparation being pending, stale, or skipped, instead of waiting on CDF repair writes.
- Add queue-impact metadata for card mutations so metadata-only CDF refresh does not blindly invalidate `RetrievalPractice`, `IncrementalLearning`, and `FilterGroup`.
- Keep Review duplicate-card safety behavior, but require any destructive or write repair to happen through explicit repair evidence rather than hidden queue invalidation.
- Add diagnostics proving Review scoring no longer creates unrelated queue Modules when preparing CDF cards.
- Preserve Browser count/read-model behavior from `separate-browser-queue-count-read-model`; this change targets the remaining Review/CDF path.

## Capabilities

### New Capabilities
- `review-cdf-preparation-hot-path`: Review CDF preparation is read-only or explicitly deferred during scoring and must not synchronously create unrelated queue Modules.

### Modified Capabilities
- `sql-first-card-runtime`: Card mutation persistence must support precise queue impact so non-scheduling metadata refresh can avoid broad dynamic queue invalidation.
- `review-journal-projection-reconciler`: Projection and queue reconciliation must consume explicit impact/deferred repair evidence rather than requiring queue Module recreation during Review scoring.

## Impact

- Affected Review path: `src/application/adapters/UnifiedQueueStrategy.ts`, `src/application/adapters/review-session/ReviewCdfPreparationEvidenceStore.ts`, and related performance tests.
- Affected CDF path: `src/application/services/CdfLiveRelationRefreshService.ts`, `src/application/services/ReviewApplicationService.ts`, and `src/application/services/BrowserApplicationService.ts`.
- Affected queue invalidation path: `src/application/services/UnifiedDataSourceManager.ts`, queue projection runtime, card mutation options/types.
- Affected docs: `CONTEXT.md`, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Validation: focused Review/CDF hot-path tests, queue-invalidation tests, hidden-fallback check, boundary check, build, and strict OpenSpec validation.
