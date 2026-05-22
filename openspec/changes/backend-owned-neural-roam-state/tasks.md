## 1. P0 Orbit Stabilization

- [x] 1.1 Add a regression test proving Orbit `neighborsViewed` survives route snapshot save/restore.
- [x] 1.2 Preserve `neighborsViewed` when converting route pool entries back into Orbit focus pool entries.
- [x] 1.3 Add a regression test for temporary current-block Orbit view state with a non-concept focus and concept seed.
- [x] 1.4 Ensure Orbit source/focus read data is not empty for temporary current-block roam when the route has a concept seed or active focus.
- [x] 1.5 Remove or adjust uncommitted batch-stat behavior that masks backend counters with stale local Orbit batch snapshots.

## 2. Backend View-State Contract

- [x] 2.1 Define versioned `NeuralRoamViewState` contract in backend RPC types.
- [x] 2.2 Add backend view-state builder covering route identity, engine mode, current node, counters, route history, engine history, sources, anchors, and batch progress.
- [x] 2.3 Include `viewState` in successful and unavailable `neural-roam.advance` responses whenever backend queue state is available.
- [x] 2.4 Add a backend read method for current NeuralRoam view state without advancing the queue.
- [ ] 2.5 Add backend tests for Orbit and Hyperspace view-state parity.

## 3. Browser And Review Consumption

- [x] 3.1 Add application-layer methods to read backend NeuralRoam view state through `UnifiedDataSourceManager`.
- [x] 3.2 Switch Browser NeuralRoam source rails, anchors, history, batch progress, and counters to consume backend view state.
- [x] 3.3 Switch Review NeuralRoam stats to consume backend view-state progress/counters after advance.
- [x] 3.4 Remove Browser refresh dependence on local `getCards()` warm-up for NeuralRoam source/counter hydration.
- [x] 3.5 Add Browser and Review regression tests proving stale local queue state is replaced by backend view state.

## 4. Backend-Mediated NeuralRoam Commands

- [x] 4.1 Define backend command contract for engine mode, route switch, temporary route lifecycle, source/seed updates, anchor updates, and clear operations.
- [x] 4.2 Implement backend command handling and return updated view state or explicit unavailable/mismatch results.
- [x] 4.3 Route NeuralRoam entry actions through backend-mediated commands.
- [x] 4.4 Route Browser NeuralRoam source/anchor/route/mode commands through backend-mediated commands.
- [x] 4.5 Add multi-window stale route/session mismatch tests for backend-mediated commands.

## 5. Frontend Authority Retirement

- [x] 5.1 Identify runtime callers that still mutate or advance local `NeuralRoamQueue` after backend ownership is enabled.
- [x] 5.2 Convert remaining runtime callers to backend commands or explicit unavailable states.
- [x] 5.3 Keep local NeuralRoam queue code only as adapter/cache/test helper during the migration window.
- [x] 5.4 Add boundary or grep checks preventing UI/Review runtime from using local `getNextCard()` or state mutation as authority.
- [x] 5.5 Update architecture/backlog docs with final NeuralRoam ownership and any deferred removal debt.

## 6. Validation

- [x] 6.1 Run targeted backend NeuralRoam advance/view-state tests.
- [x] 6.2 Run targeted queue domain route restore and Orbit/Hyperspace parity tests.
- [x] 6.3 Run targeted Browser NeuralRoam controller and Review strategy/session tests.
- [x] 6.4 Run `openspec validate backend-owned-neural-roam-state --strict`.
- [x] 6.5 Run `pnpm run check:boundaries`.
- [x] 6.6 Run `pnpm build`.
