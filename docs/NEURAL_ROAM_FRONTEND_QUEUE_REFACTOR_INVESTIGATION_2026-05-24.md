# NeuralRoam Frontend Queue Refactor Investigation

Date: 2026-05-24
Product root: `H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0`
Audience: next AI agent taking the NeuralRoam frontend-queue refactor.

## 1. Scope

User-visible bug that triggered this investigation:

- In Review, switching to Hyperspace could later jump back to Orbit and return exhausted.
- Logs showed frontend-side state like `activeRoute=default, engineMode=hyperspace`, then backend advance returned `status: exhausted`.
- Root cause already fixed in the current Review command path: the JourneyHeader engine-mode selection now routes through backend `neural-roam.command` and syncs returned `queueState`.

This report does not propose another bug patch. It maps remaining frontend queue authority so a later refactor can remove drift-prone state ownership.

## 2. Current Truth

Hyperspace is not supposed to be frontend authority anymore.

Active Review path:

```text
ReviewView.vue
  -> UnifiedQueueStrategy.next()/onFeedback()
  -> UnifiedDataSourceManager.neuralRoamAdvance()/neuralRoamCommand()
  -> SrsBackendClient / writer relay
  -> worker/bootstrap/WorkerNeuralRoamAdvanceService.ts
  -> src/core/queue/domain/NeuralRoamQueue.ts
  -> ConceptNeuralQueue or HyperspaceEngine
  -> BackendNeuralRoamAdvanceResult / BackendNeuralRoamCommandResult
  -> frontend NeuralRoamQueue.syncFromBackendState(queueState)
```

Important source files:

- `src/application/adapters/UnifiedQueueStrategy.ts`
  - `next()` branches `QueueType.NeuralRoam` into `nextFromNeuralRoamAdvance()`.
  - `onFeedback()` branches NeuralRoam into backend advance feedback.
  - `syncNeuralRoamQueueFromBackendState()` requires backend `queueState` and syncs it into the renderer queue.
- `src/application/services/UnifiedDataSourceManager.ts`
  - `neuralRoamAdvance()`, `readNeuralRoamViewState()`, and `neuralRoamCommand()` own renderer-to-backend routing and follower writer relay.
  - `createQueue()` still constructs a renderer `NeuralRoamQueue`.
- `worker/bootstrap/WorkerNeuralRoamAdvanceService.ts`
  - Worker-side owner of backend NeuralRoam queue instances.
  - Handles `neural-roam.advance`, `neural-roam.viewState`, and `neural-roam.command`.
- `src/core/queue/domain/NeuralRoamQueue.ts`
  - Shared domain implementation used by both renderer mirror and worker runtime.
  - Contains `ConceptNeuralQueue` and `HyperspaceEngine`.
- `src/application/services/queue-projection/QueueProjectionRuntime.ts`
  - Treats NeuralRoam as `backend-advance` when advance capability exists.
  - NeuralRoam projection is Browser/count/diagnostic only, not Review cursor authority.

## 3. Current Frontend Queue Inventory

These are the remaining frontend queue layers by authority risk.

### 3.1 Low-risk projection-backed review queues

Queue types:

- `retrieval-practice`
- `incremental-learning`
- `final-drill`
- `leech`

Current behavior:

- Browser/read path is backend projection-backed.
- Review feedback is backend `review.feedback` via `ReviewCommitUseCase` / backend worker / writer relay.
- Renderer queue classes still exist, but they are mostly facade/cache/session adapters.

Do not start here for the Hyperspace/Orbit refactor. These are not the source of engine drift.

### 3.2 Medium-risk local queue: FilterGroup

File:

- `src/core/queue/domain/FilterGroupQueue.ts`

Current behavior:

- `getProjectionReadMode()` returns `local-queue`.
- FilterGroup still computes visible membership in renderer from filter config plus manager reads.

Refactor later:

- Move filter materialization to backend projection.
- Keep frontend FilterGroup as filter-config holder and UI adapter only.

### 3.3 Intentional local static queues

Files:

- `src/core/queue/domain/SubsetReviewQueue.ts`
- `src/core/queue/domain/TemporaryDrillQueue.ts`
- `src/core/queue/domain/OrderedStaticSubsetQueueBase.ts`

Current behavior:

- `OrderedStaticSubsetQueueBase.getProjectionReadMode()` returns `local-queue`.
- Used for exact selected-card review / temporary practice / open-as flows.

Refactor later only if backend needs exact-scope temporary sessions. Do not fold these into NeuralRoam work unless a bug crosses this surface.

### 3.4 Highest-risk residual: renderer NeuralRoamQueue

Files:

- `src/core/queue/domain/NeuralRoamQueue.ts`
- `src/core/queue/neural/ConceptNeuralQueue.ts`
- `src/core/queue/neural/hyperspace/HyperspaceEngine.ts`
- `src/ui/review/v2/reviewNeuralCommands.ts`
- `src/ui/browser/neural/useNeuralBrowserController.ts`

Current behavior:

- Worker owns actual `neural-roam.advance` and command execution.
- Renderer still constructs a full `NeuralRoamQueue`.
- Renderer queue still has methods that can mutate engine/session state: `setEngineMode`, `setCurrentFocus`, `setSourceEntry`, `setAnchorEntry`, `jumpToHistoryNode`, `clearHistory`, `returnToBookmark`.
- Active Browser controller already routes commands through backend command and no longer falls back to local mutation.
- Active ReviewView now passes backend command runner to JourneyHeader/toolbar/menu helpers.
- `reviewNeuralCommands.ts` still contains local fallback branches when no command runner is passed. This is drift-prone and should be removed or converted to explicit unavailable after all active callers are backend-wired.

This is the best first refactor target.

## 4. Root Cause Pattern

The failed Hyperspace switch was not caused by Hyperspace algorithm itself.

Failure pattern:

```text
UI command mutates renderer NeuralRoamQueue
  -> renderer says engineMode=hyperspace
  -> backend worker remains orbit
  -> Review grade/next calls backend neural-roam.advance
  -> backend advances Orbit route/session
  -> backend returns exhausted / orbit viewState
  -> renderer syncs backend queueState
  -> user sees jump back to Orbit and exhausted
```

Fixed instance:

- `ReviewView.handleNeuralRoamEngineModeSelect()` now passes `runNeuralRoamCommand`.
- `ReviewView` separates request-shaped backend route runner from bare command runner.

Remaining general risk:

- Any active UI path that can call renderer `NeuralRoamQueue` mutators without backend command authority can recreate this class of bug.

## 5. Refactor Goal

Make renderer NeuralRoam queue a read/sync adapter, not an authority.

Target shape:

```text
BackendNeuralRoamRuntime owns:
  - active route
  - engine mode
  - Orbit/Hyperspace session
  - source/anchor pools
  - history/log clear
  - next/feedback advance

Renderer NeuralRoam adapter owns:
  - last backend viewState
  - last backend queueState snapshot for UI helpers
  - local selected UI state only
  - explicit unavailable if backend command/advance is missing
```

Keep `src/core/queue/domain/NeuralRoamQueue.ts` as shared domain implementation for now, because worker uses it. The first refactor should not move algorithms out of `src/core`; it should stop renderer callers from treating the renderer instance as source of truth.

## 6. Suggested Implementation Slices

### Slice 1: kill Review local command fallback

Files:

- `src/ui/review/v2/reviewNeuralCommands.ts`
- `src/ui/review/v2/ReviewView.vue`
- `src/ui/review/v2/__tests__/reviewNeuralCommands.test.ts`
- `src/ui/review/v2/__tests__/ReviewView.queue-switch.spec.ts`

Change:

- Require `runNeuralRoamCommand` for Review NeuralRoam commands that mutate route/engine/focus/source/anchor/history.
- If missing, show explicit unavailable/error instead of calling renderer queue mutators.
- Keep pure read helpers that project already-synced `viewState`/queue snapshot.

Acceptance:

- No `reviewNeuralCommands.ts` path calls `neuralQueue.setEngineMode`, `setCurrentFocus`, `setSourceEntry`, `setAnchorEntry`, `jumpToHistoryNode`, `clearHistory`, or `returnToBookmark` as fallback.
- Existing active Review command tests still pass.
- Add one test proving missing command runner returns unavailable and does not mutate local queue.

### Slice 2: introduce renderer NeuralRoam adapter type

Files:

- `src/types/unified-data-source.ts`
- `src/ui/review/v2/ReviewView.vue`
- `src/ui/browser/neural/useNeuralBrowserController.ts`
- possibly a new `src/application/adapters/BackendNeuralRoamSessionAdapter.ts`

Change:

- Split current `NeuralRoamSessionQueue` into:
  - read model surface: navigation/source/anchor/history snapshots from backend-synced state
  - command surface: backend command runner
  - local domain queue mutators for worker/tests only
- UI should depend on read model + command runner, not full `NeuralRoamQueue`.

Acceptance:

- UI type deps no longer require full local mutator interface.
- `isNeuralRoamSessionQueue()` does not force UI to prove every local mutator exists.

### Slice 3: make renderer NeuralRoamQueue fail closed for active UI mutation

Files:

- `src/core/queue/domain/NeuralRoamQueue.ts`
- `worker/bootstrap/WorkerNeuralRoamAdvanceService.ts`
- tests around worker queue and UI command runners

Change:

- Keep local mutators available to worker/domain tests.
- Add an explicit runtime ownership option, for example `authority: 'worker' | 'renderer-mirror'`.
- In `renderer-mirror`, mutators that change route/engine/session throw explicit unavailable unless invoked by `syncFromBackendState()`.

Acceptance:

- Active renderer cannot directly change engine mode or route state.
- Worker can still execute `applyWorkerNeuralRoamCommand()`.
- Hidden fallback checker stays green.

### Slice 4: add engine-mode assertion to advance contract

Files:

- `packages/contracts/src/backend-rpc.ts`
- `src/application/adapters/review-session/NeuralRoamAdvanceCoordinator.ts`
- `worker/bootstrap/neuralRoamRoutePolicy.ts`
- `worker/bootstrap/WorkerNeuralRoamAdvanceService.ts`

Change:

- Add optional `engineMode` to `BackendNeuralRoamAdvanceRequest`.
- Worker compares requested engine mode with active backend engine mode.
- Mismatch returns `status: mismatch`, `unavailableReason: route-mismatch` or a new explicit `engine-mismatch`.

Acceptance:

- If renderer thinks Hyperspace while backend is Orbit, advance fails mismatch instead of exhausting wrong engine.
- This is guardrail, not substitute for command ownership cleanup.

## 7. Do Not Do

- Do not make `neural-roam.advance` read projection rows as cursor source. Architecture says NeuralRoam projection is Browser/count/diagnostic only.
- Do not add local fallback when backend command/advance is missing. Return explicit unavailable.
- Do not edit baseline mirror `H:/project-F/flashcard/siyuan-plugin-siyuanmemo/`.
- Do not move Hyperspace algorithm out of `src/core` in the first slice. Worker imports and uses it now.
- Do not make `kernel.js` own queue logic. Kernel owns writer lease/relay only, not `siyuanmemo.db` or NeuralRoam runtime.

## 8. Existing Evidence To Read First

Read these before editing:

- `ARCHITECTURE.md`
  - Browser NeuralRoam ownership section around Browser `neural-roam.viewState` / `neural-roam.command`.
  - Review section around `UnifiedQueueStrategy` and NeuralRoam backend advance.
  - File responsibility map entries for `WorkerNeuralRoamAdvanceService`, `UnifiedDataSourceManager`, `QueueProjectionRuntime`, and `UnifiedQueueStrategy`.
- `docs/DDD_RESCAN_BACKLOG.md`
  - `2026-05-24 - Review NeuralRoam Engine Command Boundary`
  - `2026-05-24 - NeuralRoam Engine Boundary Pending Reset`
  - `2026-05-23 - NeuralRoam Route CRUD Backend Ownership`
  - `2026-05-23 - NeuralRoam Backend View-State and Command Ownership`
- Current tests:
  - `src/ui/review/v2/__tests__/ReviewView.queue-switch.spec.ts`
  - `src/ui/review/v2/__tests__/reviewNeuralCommands.test.ts`
  - `src/ui/browser/neural/__tests__/useNeuralBrowserController.test.ts`
  - `src/application/__tests__/UnifiedQueueStrategy.neural-roam.test.ts`
  - `worker/__tests__/BackendKernel.test.ts -t neural-roam`

## 9. Validation Plan For Next AI

For Slice 1:

```powershell
pnpm exec vitest run src/ui/review/v2/__tests__/reviewNeuralCommands.test.ts src/ui/review/v2/__tests__/ReviewView.queue-switch.spec.ts
node scripts/check-hidden-fallbacks.cjs
pnpm run check:boundaries
pnpm build
```

For Slice 2 or broader:

```powershell
pnpm exec vitest run src/ui/review/v2/__tests__/ReviewView.queue-switch.spec.ts src/ui/browser/neural/__tests__/useNeuralBrowserController.test.ts src/application/__tests__/UnifiedQueueStrategy.neural-roam.test.ts
pnpm exec vitest run worker/__tests__/BackendKernel.test.ts -t neural-roam
node scripts/check-hidden-fallbacks.cjs
pnpm run check:boundaries
pnpm build
```

Production `src/` changes that fix/defer debt must append a new entry to `docs/DDD_RESCAN_BACKLOG.md`.

## 10. Recommended Prompt For Next AI

```text
$siyuanmemo-plugin-dev

Use docs/NEURAL_ROAM_FRONTEND_QUEUE_REFACTOR_INVESTIGATION_2026-05-24.md as the handoff. Implement Slice 1 only: remove Review NeuralRoam local command fallback so route/engine/focus/source/anchor/history commands require backend neural-roam.command and return explicit unavailable when missing. Do not change worker algorithms. Add focused tests, run hidden fallback gate, boundaries, and build. Update DDD_RESCAN_BACKLOG.md.
```

