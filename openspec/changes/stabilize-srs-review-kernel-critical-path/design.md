## Context

Current Review architecture is powerful but spread out:

```text
Review UI
  -> useReviewSession / ReviewSessionController
  -> UnifiedQueueStrategy
       -> renderer cursor
       -> worker session runtime adapter
       -> queue projection policy
       -> CDF preparation evidence
       -> compensation / counter refresh / timing
  -> worker review.session.feedback
       -> card mutation
       -> review journal/event
       -> queue impact
       -> storage checkpoint/delta side effects
```

This shape makes `UnifiedQueueStrategy` a shallow, high-knowledge Module. Callers/tests must understand many details that should be hidden behind one Review session Interface.

Anki's comparable shape is:

```text
Frontend answer
  -> Collection/Scheduler
       -> current card state
       -> next scheduling state
       -> card update
       -> revlog append
       -> in-memory queue advancement
  -> UI displays returned result
```

The key lesson is not less architecture; it is deeper authority. One Module owns the answer transaction and visible session state.

## Target Shape

```text
Review UI
  -> ReviewSessionAdapter
       -> SrsReviewKernel
            -> SchedulerAlgorithm
            -> ReviewLedger
            -> CardScheduleStore
            -> SessionQueueIndex
            -> NextCardPreparation
            -> Diagnostics

Browser / projection / sync
  -> derived from kernel facts and card schedule state
```

`SrsReviewKernel` is not necessarily one file. It is a Module with one small external Interface. Internally it may compose worker runtime, scheduler, storage, CDF preparation, and diagnostics.

## Interface Sketch

```ts
type SrsReviewKernel = {
  startSession(request): Promise<ReviewSessionState>;
  current(sessionId): Promise<ReviewCard | null>;
  answer(command): Promise<ReviewAnswerResult>;
  skip(command): Promise<ReviewAnswerResult>;
  undo(command): Promise<ReviewUndoResult>;
  diagnostics(sessionId): Promise<ReviewSessionDiagnostics>;
};
```

`answer(command)` returns the next visible state from kernel-owned session state. It does not ask the renderer to patch projection rows, requery local queues, or compensate a separate cursor.

## Key Decisions

1. **Kernel authority is user-visible authority**
   - If kernel accepts an answer, the next card comes from kernel session state.
   - Browser projection and CDF state may lag without becoming visible session authority.

2. **Adapters get thinner**
   - `UnifiedQueueStrategy` should become an adapter from existing `IQueueStrategy` shape to kernel commands.
   - It should stop owning post-feedback advancement policy once kernel coverage is complete.

3. **Diagnostics remain explicit**
   - Kernel diagnostics should expose journal, projection, CDF, sync, and checkpoint state separately.
   - Explicit degraded/unavailable state is fine; hidden fallback is not.

4. **Tests move to kernel Interface**
   - Core tests should assert answer/advance/undo/lookahead behavior through the kernel Interface.
   - Adapter tests should assert mapping only.

## Migration Plan

1. Define kernel Interface and map current worker runtime behavior to it.
2. Add contract tests using in-memory adapters.
3. Move current `answerAndAdvance` authority behind kernel naming.
4. Thin `UnifiedQueueStrategy` by deleting duplicated cursor/projection advancement responsibility from production Review feedback path.
5. Keep diagnostics proving no production fallback to renderer authority.

## Risks

- Existing tests may overfit `UnifiedQueueStrategy` internals.
- Some queue types may still need local-session compatibility during migration.
- NeuralRoam has route/session state that must stay explicit, not hidden behind generic SRS semantics.

## Open Questions

- Should NeuralRoam use the same kernel Interface with specialized session policy, or remain a sibling kernel until route semantics settle?
- Should kernel live under `worker/review` first, then later expose shared types under `src/core/review`, or start with shared core types now?
