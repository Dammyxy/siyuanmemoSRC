## Why

NeuralRoam is currently in a mixed ownership state: backend `neural-roam.advance` computes next items, while Browser/Review still restore and inspect a local frontend queue state for Orbit, Hyperspace, route history, counters, and source rails. This has produced repeated regressions where Hyperspace shows rails and progress while Orbit loses source data or resets counters after route/projection restore.

The change is needed now because local fixes to Browser refresh, route projection, and Orbit counters have not stabilized the user-visible state. NeuralRoam needs one backend-owned state/read model instead of three partially coupled projections.

## What Changes

- Introduce a backend-owned NeuralRoam state/read-model contract for active route, engine mode, current node, Orbit/Hyperspace source rails, anchors, history, batch progress, and counters.
- Extend `neural-roam.advance` and related backend commands to return the read model required by Browser and Review instead of requiring the frontend to reconstruct it from local `NeuralRoamQueue` state.
- Move NeuralRoam state-changing commands behind backend authority: next, rate, skip, switch engine mode, route switch, seed/source updates, anchor updates, and temporary route lifecycle.
- Make Browser Orbit/双链轨道 and counters read the backend read model, not local queue projection guesses.
- Keep a short-term compatibility adapter only as a frontend cache/consumer of backend state, with no independent state-machine advancement.
- Add regression tests for Orbit and Hyperspace parity: source rail presence, batch progress, route restore, temporary current-block roam, and stale frontend state after backend advance.
- **BREAKING** for internal architecture: frontend code must stop treating `NeuralRoamQueue` as the authority for runtime NeuralRoam state.

## Capabilities

### New Capabilities
- `backend-owned-neural-roam-state`: Backend owns NeuralRoam runtime state and exposes a read model for Browser and Review Orbit/Hyperspace UI.

### Modified Capabilities

## Impact

- Affected backend worker: `worker/bootstrap/WorkerNeuralRoamAdvanceService.ts`, `worker/bootstrap/BackendKernel.ts`, backend RPC contracts in `packages/contracts/src/backend-rpc.ts`.
- Affected queue core: `src/core/queue/domain/NeuralRoamQueue.ts`, `src/core/queue/neural/ConceptNeuralQueue.ts`, `src/core/queue/neural/hyperspace/HyperspaceEngine.ts`, route catalog/persistence.
- Affected application layer: `src/application/services/UnifiedDataSourceManager.ts`, `src/application/adapters/UnifiedQueueStrategy.ts`, NeuralRoam entry action services, review-session advance coordinator.
- Affected UI: Browser NeuralRoam controller/panels, Review NeuralRoam entry and counters.
- Affected tests: backend kernel/advance, queue domain, Browser controller, Review strategy/session, route persistence.
