## Why

During active Retrieval Practice Review, live logs show Browser-derived work creating and touching non-active queues such as `incremental-learning` and `filter-group`. The user only rated Retrieval cards, but Browser count/readiness refresh can still call `UnifiedDataSourceManager.getQueue(queueType)` for multiple queues, which lazily creates Queue Modules and leaks Browser projection/count work into the Review hot path.

Anki's comparable shape is deeper: answering a card goes through Scheduler/Collection authority, which updates the card, revlog, queue state, and returns the next visible state/counts through one small Interface. UI/browser-derived views do not create unrelated queue objects during the answer click.

SiYuanMemo should move toward the same shape: `SrsReviewKernel.answer` returns enough current-queue impact/count evidence for Review UI, while Browser queue counts/readiness become a derived read model that can update non-active queues after Review pressure clears.

## What Changes

- Introduce a Browser Queue Count Read Model concept so queue counts can be read without instantiating full Queue Modules through `manager.getQueue(queueType)`.
- Make `review.session.feedback` / Review advancement surface affected queue types and count deltas for the active Review queue.
- During active Review pressure, scope immediate Browser count/readiness refresh to the active Review queue only.
- Defer non-active Browser queue count/readiness/materialization work until Review is idle.
- Keep Browser fail-closed readiness semantics: unavailable/stale derived data stays explicit and does not fall back to silently stale rows.
- Preserve full Queue Module creation only for real queue ownership actions: opening/reviewing that queue, queue mutation commands, or explicit Browser view materialization.

## Capabilities

### New Capabilities

- `browser-queue-count-read-model`: Browser queue counts are provided by a lightweight derived read model instead of creating full Queue Modules for every count refresh.

### Modified Capabilities

- `srs-review-kernel`: Review answer results include active queue impact/count evidence needed by Review UI without requiring Browser broad refresh.
- `browser-projection-warmup-review-budget`: Active Review pressure blocks non-active queue count/readiness work as well as projection warmup/repair.

## Impact

- Browser count path: `src/application/services/BrowserApplicationService.ts`, `src/ui/browser/composables/useQueueBridge.ts`, `src/ui/browser/SRSBrowser.vue`.
- Review answer/impact path: `src/application/adapters/UnifiedQueueStrategy.ts`, `src/application/adapters/review-session/*`, `worker/review/*`, backend Review RPC contracts/adapters if result shape changes.
- Queue projection/count path: `src/application/services/queue-projection/*`, `src/application/services/UnifiedDataSourceManager.ts`.
- Tests: focused Review feedback, Browser queue counts, active Review pressure, and queue creation/no unrelated queue instantiation tests.

## Out Of Scope

- No scheduler algorithm rewrite.
- No native SQLite/WAL migration.
- No hidden fallback to stale Browser rows.
- No broad cleanup of unrelated Browser datasource action logs.
- No removal of existing Queue Modules; this change narrows when they are instantiated.
