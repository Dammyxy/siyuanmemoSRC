## Context

NeuralRoam has become a mixed runtime. The backend worker can execute `neural-roam.advance`, but the frontend still owns meaningful state through `NeuralRoamQueue`, `ConceptNeuralQueue`, `HyperspaceEngine`, route snapshots, Browser controller refreshes, and Review strategy counters. Browser Orbit/双链轨道 then reconstructs state from a local restored queue, while Hyperspace often reads a different source pool and progress model.

The confirmed failure pattern is ownership drift:

- Orbit source rail reads `conceptQueue.seedPool`; Hyperspace source rail reads `hyperspaceEngine.sourcePool`.
- Orbit progress reads `neighborsViewed`; Hyperspace progress reads current depth.
- Route restore can reset Orbit `neighborsViewed` while Hyperspace remains useful.
- Browser and Review can refresh local state at different times from backend advance and route projection.

The backend migration constraints still apply: no UI direct SQL, no hidden fallback/dual-path masking, kernel remains relay authority only, and unavailable states must be explicit.

## Goals / Non-Goals

**Goals:**
- Make backend worker the authority for active NeuralRoam route, engine mode, Orbit/Hyperspace sessions, source/anchor pools, history, batch progress, and counters.
- Provide one backend read model that Browser and Review can consume directly.
- Preserve Orbit and Hyperspace domain semantics while exposing a common UI contract.
- Keep `neural-roam.advance` as the main next/rate/skip command path and extend it to return complete view state.
- Move route, source/seed, anchor, engine mode, and temporary route mutations to backend commands or backend-mediated application calls.
- Leave frontend `NeuralRoamQueue` as a temporary adapter/cache during migration, with no independent state-machine advancement after cutover.
- Add regression coverage for the current user-visible failures.

**Non-Goals:**
- Do not model NeuralRoam as a normal `queue_projection_rows` queue.
- Do not merge Orbit and Hyperspace into one engine.
- Do not add public external APIs for NeuralRoam route management.
- Do not remove frontend NeuralRoam components in this change; only change their data authority.
- Do not redesign SQL route repository storage unless required for missing fields.

## Decisions

1. Backend read model instead of ordinary queue projection.

   NeuralRoam state is not a static ordered card list. It includes route identity, current focus/source, Orbit round progress, Hyperspace depth/frontier, local history, source rails, anchors, and temporary route lifecycle. A regular projection row snapshot cannot represent those invariants without duplicating state and reintroducing drift. The change will introduce a NeuralRoam-specific backend read model.

2. Backend worker owns state, frontend consumes immutable snapshots.

   The backend will return a `viewState` from `neural-roam.advance` and expose a read command for Browser refresh. The frontend may cache the latest `viewState`, but UI components must treat it as data from backend authority. Local queue methods that currently compute source/history/counters become adapters over the backend snapshot during migration.

3. Command surface is explicit and stateful.

   NeuralRoam mutations will use typed commands for:
   - advance next/rate/skip
   - switch engine mode
   - switch route
   - create/replace/close temporary route
   - set source/seed
   - set anchor
   - clear history/anchors where supported

   Each command returns the updated read model or an explicit unavailable/mismatch result.

4. Preserve route history and engine history as separate read-model sections.

   Route history is cross-engine and route-owned. Engine history is the current engine trace/双链轨道. The backend read model will expose both when relevant so Browser can keep separate “航线日志” and “双链轨道” surfaces without reconstructing either from the wrong store.

5. Cutover happens by narrowing frontend write authority first.

   The migration should not remove all frontend queue code in one step. Instead:
   - First add backend read model and consume it in Browser/Review.
   - Then route all NeuralRoam commands through backend.
   - Then mark local queue advancement paths unavailable or test-only.
   - Finally remove or archive dead local authority code.

6. Short-term P0 fixes remain allowed.

   Before full backend ownership, the implementation may fix confirmed state-loss bugs such as route restore dropping `neighborsViewed` and Orbit source rails returning empty for active focus. These fixes reduce user pain and provide regression fixtures for the backend read model.

## Risks / Trade-offs

- [Risk] Read-model contract grows large. → Mitigation: keep it NeuralRoam-specific and versioned; do not reuse generic queue projection shape.
- [Risk] Backend command coverage misses one UI mutation, leaving a hidden local path. → Mitigation: add boundary tests/grep for frontend `NeuralRoamQueue` mutation calls and fail closed after cutover.
- [Risk] Full migration is too large for one safe patch. → Mitigation: implement in staged tasks with P0 stopgap, read model, command migration, and local-authority retirement.
- [Risk] Multi-window route state can still race during cutover. → Mitigation: commands include route/session identity and return mismatch/unavailable instead of local fallback.
- [Risk] Performance improves only after UI stops forcing local reloads. → Mitigation: Browser/Review must consume backend snapshots directly and avoid `getCards()` warm-up as a state sync mechanism.

## Migration Plan

1. Add P0 regression tests and fixes for known Orbit state loss.
2. Define backend `NeuralRoamViewState` contract and include it in `neural-roam.advance` results.
3. Add backend read command for current NeuralRoam view state without advancing.
4. Switch Browser NeuralRoam panels and Review stats to read `NeuralRoamViewState`.
5. Add backend commands for mode, route, source/seed, anchor, and temporary route lifecycle.
6. Replace frontend mutation callers with backend command callers.
7. Fail closed for remaining local state-machine advancement in runtime paths.
8. Run targeted tests, boundary checks, and build.

Rollback path: keep the existing frontend queue adapter until final local-authority retirement. If backend view-state cutover fails validation, disable the new read-model consumption while retaining P0 bug fixes.

## Open Questions

- Should backend route/source/anchor commands be separate RPC methods or one `neural-roam.command` method with command type tags?
- Does the backend view-state need pagination for long route history immediately, or can Browser keep existing history page requests as a separate read command?
- Which existing local methods should remain for tests and offline construction after runtime cutover?
