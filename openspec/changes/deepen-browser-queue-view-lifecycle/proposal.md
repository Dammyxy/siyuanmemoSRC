## Why

The Browser Read Model is now the intended Browser-facing read contract, but `SRSBrowser.vue` still knows too much about queue projection readiness, datasource attachment, projection identity, stale result rejection, and queue-count refresh timing. This keeps the Browser Queue View Lifecycle shallow: callers must understand nearly the same state machine as the implementation.

## What Changes

- Add an application-owned Browser Queue View Lifecycle module that prepares selected queues, consumes Queue Projection Readiness, creates or rejects queue datasources, and reports first-row lifecycle state to the Browser UI.
- Move projection identity, read-model snapshot metadata, stale async rejection, and queue datasource attach decisions behind the lifecycle module interface.
- Keep `BrowserReadModel` as the read owner and keep queue projection materialization/repair outside UI code.
- Preserve existing Browser UX for deck, query, block-id, FilterGroup, and NeuralRoam queue views unless the active owner returns explicit preparing, repair-required, or unavailable state.
- Do not change SQL worker ownership, queue membership rules, review feedback, scheduler behavior, writer relay, kernel sidecar coordination, or AI workbench behavior.

## Capabilities

### New Capabilities

- `browser-queue-view-lifecycle`: Browser queue selection and first-row rendering are coordinated through an application-owned lifecycle module that consumes Browser Read Model and Queue Projection Readiness.

### Modified Capabilities

- None.

## Impact

- Affected code: `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/browserLoadDataRuntime.ts`, `src/ui/browser/BrowserGridDatasourceLifecycle.ts`, `src/ui/browser/browserQueueProjectionWarmupRuntime.ts`, `src/application/services/BrowserApplicationService.ts`, `src/application/queries/browser/*`, and focused Browser tests.
- Runtime behavior: no intended happy-path UX change; unavailable/preparing states become more explicit where the owner cannot provide a readable projection.
- Boundaries: UI remains a consumer of application Browser Read Model state; SQL and queue projection ownership stay in application/backend paths.
