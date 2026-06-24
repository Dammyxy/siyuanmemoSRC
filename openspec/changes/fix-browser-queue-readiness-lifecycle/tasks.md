## 1. Browser First-Screen Fix

- [x] 1.1 Add RED Browser Queue View Lifecycle test proving `refreshing` readiness still creates a queue datasource and reports non-ready diagnostics.
- [x] 1.2 Add RED Browser load-data test proving active queue `refreshing` readiness rebuilds the grid datasource, schedules background warmup, and does not call local queue fallback.
- [x] 1.3 Update `BrowserQueueViewLifecycle.prepareQueueView()` so valid queue identity and datasource creation are not gated by `ensureQueueReadModelReady()`.
- [x] 1.4 Update load-data lifecycle handling so non-ready diagnostics do not clear the active queue datasource or rows solely because readiness is refreshing.

## 2. Browser Lifecycle Ownership Cleanup

- [x] 2.1 Make readiness diagnostics and projection identity capture explicit lifecycle outputs without duplicating datasource attach decisions in `browserLoadDataRuntime`.
- [x] 2.2 Keep queue count refresh passive for non-ready lifecycle states and scoped only when a ready projection identity is known.
- [x] 2.3 Keep `browserQueueProjectionWarmupRuntime` as bounded background warmup and ensure active-queue warmup/live identity events do not cancel datasource attachment.
- [x] 2.4 Remove or update stale tests that assert Browser queue datasource creation is blocked by `refreshing` readiness.

## 3. Queue Projection Read/Repair Split

- [x] 3.1 Add RED QueueProjection Runtime tests proving passive `ensureReady()` does not call `queue.getCards()` or `queueProjectionReplace` on stale/refreshing projections.
- [x] 3.2 Add RED QueueProjection Runtime tests proving passive `readSnapshot()` and row hydration do not materialize projections when backend snapshot/rows are non-ready.
- [x] 3.3 Refactor QueueProjection Runtime to separate read-only readiness/read methods from explicit `materialize()` repair paths.
- [x] 3.4 Preserve explicit repair/materialization behavior for supported queue types through focused tests.

## 4. Documentation And Validation

- [x] 4.1 Update `ARCHITECTURE.md` with Browser queue datasource attach, background warmup, and QueueProjection read/repair ownership.
- [x] 4.2 Append `docs/DDD_RESCAN_BACKLOG.md` task delta with fixed/deferred Browser/QueueProjection debt.
- [x] 4.3 Run focused Browser lifecycle/load-data/warmup and QueueProjection Runtime tests.
- [x] 4.4 Run `openspec validate fix-browser-queue-readiness-lifecycle --strict`, `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, `git diff --check`, and `pnpm build`.

## 5. Browser Warmup Repair Closure

- [x] 5.1 Add RED Browser warmup test proving `projection_stale` readiness requests application-owned repair and rechecks through live identity.
- [x] 5.2 Add `BrowserApplicationService.repairQueueReadModel()` and route it through `UnifiedDataSourceManager.materializeQueueProjection(...)`.
- [x] 5.3 Pass submitted readiness identity into explicit materialization so FilterGroup and Browser-scoped policy payloads stay canonical.
- [x] 5.4 Make warmup schedule targeted retries from `retryAfterMs` for non-ready states instead of logging once and stopping.
- [x] 5.5 Update OpenSpec docs, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`; rerun focused tests, boundary checks, hidden fallback check, diff check, and build.
