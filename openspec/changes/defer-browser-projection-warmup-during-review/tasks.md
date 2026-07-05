## 1. Feedback Loop And Trace

- [x] 1.1 Add or update a focused Browser warmup runtime test that simulates active Review and proves broad `browser-open` warmup does not call `ensureQueueReadModelReady` for every sidebar queue immediately
- [x] 1.2 Add or update a focused Browser warmup runtime test that repeated live identity events for the same non-active queue coalesce into one deferred warmup during active Review
- [x] 1.3 Add or update a focused Browser warmup/runtime diagnostic test proving deferral logs include queue id, reason, and delay
- [x] 1.4 Trace and document the active path from Review feedback logs to Browser warmup: `review.feedback` slow summary -> Browser warmup runtime -> `BrowserApplicationService.ensureQueueReadModelReady` -> `UnifiedDataSourceManager.ensureQueueProjectionReady`

## 2. Browser Warmup Runtime Deepening

- [x] 2.1 Add a small Review pressure input to `createBrowserQueueProjectionWarmupRuntime` without letting Browser mutate Review state
- [x] 2.2 Move Review-aware warmup budgeting behind `browserQueueProjectionWarmupRuntime` so callers still use `schedule`, `handleLiveIdentityEvent`, `abort`, and `getStatus`
- [x] 2.3 Implement broad warmup filtering/delay while Review is active: visible/current queue may run, non-critical sidebar queues defer
- [x] 2.4 Implement per-queue targeted timer coalescing so repeated live identity events and retries do not stack during Review
- [x] 2.5 Keep NeuralRoam outside projection warmup and preserve existing non-Review browser-open warmup behavior

## 3. Browser Readiness And Failure Semantics

- [x] 3.1 Preserve fail-closed Browser Read Model behavior: no stale queue snapshot fallback when projection readiness/hydration is unavailable
- [x] 3.2 Keep visible Browser queue readiness explicit when Review is active (`refreshing`, `unavailable`, `ready`, retry)
- [x] 3.3 Ensure repairable non-active queue states such as `projection_stale` are deferred/coalesced during active Review
- [x] 3.4 Ensure queue count refresh triggered by warmup ready is limited to affected queue types and does not fan out to all queues during active Review

## 4. Review Coordination

- [x] 4.1 Identify the smallest existing Review active-state signal or add a read-only adapter/ref for Browser warmup
- [x] 4.2 Ensure Review answer/commit tests still show `currentItem` advancement independent of Browser warmup completion
- [x] 4.3 Ensure active Review pressure ends/clears so deferred Browser warmup can later run without requiring a full reload

## 5. Docs And Validation

- [x] 5.1 Update `ARCHITECTURE.md` if the Browser warmup / Review pressure ownership map changes
- [x] 5.2 Append `docs/DDD_RESCAN_BACKLOG.md` task delta after production implementation
- [x] 5.3 Run focused `browserQueueProjectionWarmupRuntime` tests
- [x] 5.4 Run focused Browser Queue View Lifecycle / BrowserApplicationService queue readiness tests
- [x] 5.5 Run focused Review session tests that cover async commit and projection-stale advancement
- [x] 5.6 Run `pnpm run check:boundaries`
- [x] 5.7 Run `pnpm build`
