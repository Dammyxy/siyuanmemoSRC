## Why

`add-neural-roam-routes` was marked complete, but review found three route completion gaps: Browser route logs still read engine-local history, backend advance can compare against a stale cached active route, and native dialog close can bypass dirty temporary-route prompts.

This change closes those acceptance gaps before archiving NeuralRoam routes.

## What Changes

- Make the Browser NeuralRoam route log read the active route-level history, including both Orbit and Hyperspace visits, instead of the current engine history only.
- Keep route-level history independent from engine history clearing in Browser log reads.
- Sync the backend cached NeuralRoam queue to the SQL active route before route mismatch checks.
- Route native Review dialog close through the same temporary-route close lifecycle as the in-view close button.
- Add focused regression tests for the three review findings.

## Capabilities

### New Capabilities
- `neural-roam-route-completion`: Completes the route-level log, backend route switch, and temporary-route close lifecycle acceptance requirements left open by the NeuralRoam routes change.

### Modified Capabilities

## Impact

- Affected core: `src/core/queue/domain/NeuralRoamQueue.ts`
- Affected backend worker: `worker/bootstrap/WorkerNeuralRoamAdvanceService.ts`
- Affected UI: `src/ui/browser/neural/useNeuralBrowserController.ts`, `src/application/factories/createUnifiedReviewDialog.ts`, `src/ui/review/v2/ReviewView.vue`
- Affected tests: NeuralRoam queue, backend kernel/advance, Browser controller, Review close lifecycle
