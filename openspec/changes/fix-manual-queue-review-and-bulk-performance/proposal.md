## Why

Manual cards added from the Browser into Retrieval Practice can reappear after SiYuan restarts because worker-owned review sessions commit ratings without clearing the persisted manual queue membership. The same Browser menu exposes duplicate "add" actions whose source flag is not used by the active queue implementation, making the choice confusing while not changing behavior.

Batch operations in Browser and queue flows are also visibly slow and janky because selected rows are often processed through per-card reads, writes, notifications, and projection refreshes instead of bounded bulk commands with one invalidation and one user-visible completion.

## What Changes

- Treat explicit Browser "add to Retrieval Practice" review as a real rescheduling review: rating a manually queued card MUST write the formal SRS schedule and remove the card from persisted manual queue membership.
- Ensure worker review-session feedback and local review-session feedback both apply the same manual membership cleanup semantics after successful review commits.
- Collapse duplicate Browser add-menu entries for Retrieval Practice and Incremental Learning into one clear action per queue; keep legacy action IDs routeable for compatibility but stop showing confusing duplicate menu choices.
- Improve batch operations for queue add/remove, priority, suspend, delete, postpone/advance/spread, and review-scope actions by routing through bulk services where available, coalescing cache invalidation/observer events, and avoiding per-row live queue reads.
- Add regression and performance-oriented tests for manual queue persistence after restart-sensitive review flows and representative large selection batch actions.

## Capabilities

### New Capabilities
- `manual-queue-review`: Browser-added manual review queue items have consistent formal rescheduling and persisted membership cleanup across local and worker review sessions.
- `bulk-operation-performance`: Browser and queue batch actions complete through bounded bulk paths with coalesced refresh and feedback semantics.

### Modified Capabilities
- None.

## Impact

- Browser datasource/menu actions: `src/ui/browser/datasource/MenuActions.ts`, `DeckDataSource.ts`, `QueryDataSource.ts`, and action feedback/i18n surfaces.
- Review/session path: `src/application/adapters/UnifiedQueueStrategy.ts`, review-session runtimes, worker review session feedback handling, and review commit context construction.
- Queue/domain path: `RetrievalPracticeQueue`, `IncrementalLearningQueue`, `ManualCardCollectionQueue`, and `UnifiedDataSourceManager` bulk queue APIs.
- Worker/backend path: `worker/review/*`, backend review session RPC tests, queue projection impact, and persisted manual membership cleanup hooks.
- Validation: targeted Vitest coverage, hidden fallback/boundary checks, and `pnpm build`.
