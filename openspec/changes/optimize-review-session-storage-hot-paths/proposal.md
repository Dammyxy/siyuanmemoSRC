## Why

Review feedback and next-card switching currently show multi-second latency in real plugin logs. The slow path spans Review session advancement, worker `review.feedback` preflight/merge, queue projection replacement, and `UnifiedStorageManager` Xiuyuan normalization, so isolated micro-fixes risk moving cost rather than removing it.

This change captures the three current performance suspects plus the strong read-path debt where `getCardDTOsByXiuyuanId()` scans all DTOs, repairs bindings, updates indexes, and marks storage dirty during what callers treat as a read.

## What Changes

- Make Review session advancement consume the already-computed next card and counter snapshot from `SrsV2SessionQueueRuntime.answerAndAdvance()` where available, instead of forcing an immediate second `queue.next()` pass.
- Keep Review feedback durability fail-closed, but narrow worker preflight/main DB reads so `queue.projection.replace` and own-review writes do not repeatedly invalidate the hot-path fast-skip without a real external conflict source.
- Move Xiuyuan binding/payload normalization out of ordinary read paths and into explicit canonicalization/repair seams, so read methods do not mutate storage or rebuild indexes.
- Add or maintain indexes for Xiuyuan-to-card lookup so queue loading, Review rendering, and Browser hydration do not require full DTO scans for common Xiuyuan-card reads.
- Add focused diagnostics and tests around Review feedback latency surfaces, queue load readiness, and storage read purity.

## Capabilities

### New Capabilities
- `review-session-storage-hot-paths`: Covers latency-sensitive Review advancement, queue loading, worker storage preflight, and UnifiedStorage read-purity behavior.

### Modified Capabilities

## Impact

- Affected code:
  - `src/ui/review/v2/reviewSessionController.ts`
  - `src/application/adapters/UnifiedQueueStrategy.ts`
  - `src/application/adapters/review-session/SrsV2SessionQueueRuntime.ts`
  - `worker/review/WorkerReviewFeedbackRuntime.ts`
  - `worker/review/WorkerReviewCardMutationPersistenceModule.ts`
  - `worker/db/SqliteDatabaseService.ts`
  - `src/core/storage/UnifiedStorageManager.ts`
  - queue projection runtime/readiness modules as needed
- Affected systems:
  - Review Session Cursor
  - Review Feedback Advancement
  - worker-owned Review durability and queue projection impact
  - UnifiedStorage canonical store and Xiuyuan/card indexes
- Validation will require focused Review/Queue/Storage tests plus build and boundary/fallback checks.
