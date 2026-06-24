## Why

Browser queue open is still gated by synchronous Queue Projection Readiness even though Browser first rows and queue datasource attachment should not wait on background warmup. In live logs, `incremental-learning` stays `refreshing` while other queues become `ready`, causing Browser open and progressive-learning queue loading to feel stuck.

## What Changes

- Change Browser Queue View Lifecycle so selecting a projection-backed queue creates the queue datasource immediately when the Browser queue identity is valid, even if Queue Projection Readiness is `refreshing`.
- Keep readiness diagnostics, live identity, count refresh, and projection warmup as background lifecycle signals instead of first-screen gates.
- Preserve explicit unavailable/error reporting for missing Browser read-model service, invalid queue identity, or terminal projection owner failure.
- Consolidate Browser queue lifecycle ownership so load-data, warmup, live identity, datasource attach, and count-refresh decisions do not duplicate readiness control.
- Split Queue Projection Runtime read/readiness paths from repair/materialization paths: passive reads report readiness and diagnostics; explicit repair/materialization paths own `queue.getCards()` and projection replacement.
- Promote Browser warmup from one-shot diagnostics to bounded repair orchestration: repairable stale/missing derived projections request `BrowserApplicationService.repairQueueReadModel()`, while non-ready states with `retryAfterMs` get targeted rechecks.
- Do not add local queue fallback, UI SQL fallback, or compatibility dual paths to hide projection unavailability.

## Capabilities

### New Capabilities
- `browser-queue-readiness-lifecycle`: Browser queue datasource attachment, readiness diagnostics, warmup, and first-row behavior when projection-backed queues are still refreshing.
- `queue-projection-read-repair-split`: Queue Projection Runtime read/readiness paths stay read-only, while explicit repair/materialization paths own projection rebuilds.

### Modified Capabilities
- None.

## Impact

- Affected Browser modules: `src/application/queries/browser/BrowserQueueViewLifecycle.ts`, `src/ui/browser/browserLoadDataRuntime.ts`, `src/ui/browser/browserQueueProjectionWarmupRuntime.ts`, Browser queue lifecycle tests, and load-data runtime tests.
- Affected Queue modules: `src/application/services/queue-projection/QueueProjectionRuntime.ts`, `QueueProjectionReadinessService`, `QueueProjectionReadModule`, `UnifiedDataSourceManager`, and queue projection runtime tests.
- Runtime behavior: Browser queue grids can attach immediately; row reads/counts may still report refreshing/unavailable until projection read data is available. Projection repair becomes an explicit Browser/application command path rather than an implicit side effect of readiness.
- Documentation impact: update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` after production changes.
