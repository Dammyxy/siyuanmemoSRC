## Why

Neural Roam now has separate orbit and hyperspace engines, route history, and a dedicated review header, but the activation relationship is not preserved or shown consistently. Orbit can lose the current orbit-center progression in the review header, hyperspace wake chains can fail to resolve from route/history views, and route history is currently downgraded to legacy events with no event-to-event link.

This change fixes the active runtime path so counts, route history, orbit tracks, and hyperspace wake chains all describe the same current traversal state.

## What Changes

- Preserve activation lineage in route-history events instead of converting route entries to legacy, single-node trace entries.
- Resolve activation traces across orbit and hyperspace engines, with route-history events mapped back to exact engine traces when possible.
- Bind review-header progress/cache state to current engine, route, focus/current node, and current event so orbit center switches update immediately.
- Extend the Neural Roam review header detail state to show engine-specific path context, not only numeric progress.
- Add regression coverage for orbit center switching, hyperspace trace resolution, route-history trace preservation, and header progress binding.

## Capabilities

### New Capabilities

- `neural-roam-activation-links`: Neural Roam must preserve and surface activation lineage across orbit, hyperspace, route history, browser wake panels, and review header detail state.

### Modified Capabilities

## Impact

- Core queue contracts and persisted route-history event shape under `src/core/queue/neural/routes/*`.
- Neural Roam queue aggregation and trace lookup under `src/core/queue/domain/NeuralRoamQueue.ts`.
- Backend view-state construction under `worker/bootstrap/WorkerNeuralRoamAdvanceService.ts`.
- Review adapter/header cache and Neural Roam header UI under `src/application/adapters/UnifiedReviewAdapter.ts` and `src/ui/review/v2/*`.
- Browser Neural Roam controller and trace panel behavior under `src/ui/browser/neural/*` and `src/ui/browser/SRSBrowser.vue`.
- Tests in queue, browser, and review slices.
