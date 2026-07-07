## Context

The current Review answer hot path is an Anki-like operation in behavior but not in structure. A rating click must validate the active card, submit the answer through the session authority, advance the session, prepare the next visible card, emit counter and queue-impact evidence, preserve commit status, and produce timing diagnostics.

Today that sequence is distributed across `UnifiedQueueStrategy.onFeedback()`, `withFeedbackMutation()`, `SrsV2SessionQueueRuntime.answerAndAdvance()`, `WorkerReviewSessionQueueRuntime.answerAndAdvance()`, `consumeSrsV2FeedbackAdvanceResult()`, `prepareSelectedReviewCard()`, CDF preparation evidence, transaction runtime, and frontend timing summary helpers. The Interface seen by maintainers is nearly as complex as the implementation. Deleting the implied Module would scatter the same sequencing rules back across the strategy, which is the signal that this deserves to become a real deep Module.

## Goals / Non-Goals

**Goals:**

- Create a `ReviewAnswerPipeline` Module with one answer Interface for SRS v2 rate/skip flows.
- Concentrate ordering rules and fail-closed behavior in that Module: transaction capture, runtime answer, conflict/unavailable mapping, session/counter sync, next-card preparation, history recording, and typed result shaping.
- Keep caller knowledge small: `UnifiedQueueStrategy` should only resolve the active item, route non-SRS flows, delegate answer execution, and apply existing compensation on thrown failures.
- Preserve worker-owned authority and avoid renderer projection fallback when the worker/runtime is unavailable.
- Preserve CDF preparation evidence reuse and narrow queue-impact behavior.
- Expose timing through a small recorder Interface so slow-log diagnostics no longer require answer orchestration to live in `UnifiedQueueStrategy`.

**Non-Goals:**

- No scheduler algorithm rewrite.
- No CDF repair/write ownership move.
- No queue projection rebuild rewrite.
- No Browser queue count read-model change.
- No compatibility toggle or fallback answer path.

## Decisions

1. `ReviewAnswerPipeline` owns SRS v2 answer sequencing behind one Interface.

   The new Module accepts active card, feedback, session runtime, transaction hooks, cursor/counter hooks, CDF next-card preparation, and timing recorder dependencies. It returns `ReviewAnswerPipelineResult`, which is shaped into the existing `QueueFeedbackResult` contract.

   Alternative rejected: extract only a helper for `answerAndAdvance()`. That would be a shallow Module because the caller would still need to know the ordering, error mapping, cursor sync, counter sync, preparation, and result-shaping rules.

2. The pipeline uses injected hooks for existing state owners instead of moving ownership.

   `ReviewSessionCursor`, `ReviewCurrentItemCommand`, `ReviewTransactionRuntime`, and CDF evidence store remain owned by the surrounding Review adapter slice. The pipeline coordinates them through a narrow dependency Interface.

   Alternative rejected: move cursor and transaction state into the pipeline in the first slice. That would expand blast radius and make undo/go-back behavior harder to verify.

3. Worker/runtime unavailable remains fail-closed.

   If the runtime reports `conflict` or `unavailable`, the pipeline throws the same error family used today and marks pending next-card state exactly as before. It does not call local queue review, projection hydration, or broad queue reads as a substitute.

   Alternative rejected: retry through local queue strategy. That is a hidden fallback and can score a stale card under split authority.

4. CDF preparation is presentation-only in the pipeline.

   The pipeline calls the existing `prepareSelectedReviewCard()` hook for next-card presentation and duplicate safety. It does not own CDF metadata repair writes or queue invalidation.

   Alternative rejected: merge CDF repair into the pipeline. That would re-couple the answer hot path to metadata write fanout, undoing the previous CDF decoupling.

5. Tests target the pipeline Interface first, then strategy integration.

   Add focused pipeline tests for worker-backed success and fail-closed unavailable behavior. Keep existing strategy performance tests as integration coverage for CDF preparation, queue impact, and logs.

   Alternative rejected: only testing through `UnifiedQueueStrategy`. That keeps the test surface broad and makes the new Module's depth unproven.

## Risks / Trade-offs

- [Risk] Extraction changes subtle ordering around history and counter snapshots. Mitigation: first move the runtime-backed branch behavior-preservingly and add focused tests before removing strategy code.
- [Risk] Timing logs lose detail. Mitigation: keep the same step names through the recorder hook, including `consume-advance.*`.
- [Risk] Pipeline Interface becomes too large. Mitigation: keep dependencies grouped by role and move only the SRS v2 answer path in this change.
- [Risk] Legacy/local rate path remains in `UnifiedQueueStrategy`. Mitigation: document it as deferred; next safe step is a second slice after the runtime-backed path is stable.

## Migration Plan

1. Add `ReviewAnswerPipeline` and focused tests.
2. Delegate runtime-backed `rate`/`skip` branch from `UnifiedQueueStrategy.onFeedback()` to the pipeline.
3. Preserve existing integration tests for CDF preparation, queue impact, fail-closed behavior, and timing step names.
4. Update architecture docs and debt ledger.
5. Run focused tests, hidden fallback check, boundary check, build, strict OpenSpec validation, and diff whitespace check.
