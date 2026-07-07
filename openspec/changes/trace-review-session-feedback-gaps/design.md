## Context

The previous diagnostics change proved that Review scoring uses SQLite delta storage correctly: `mainDb=none`, expected `sqlite-delta.append` write substeps, and host work around 60-72ms. The remaining live delay is still ~570-690ms and is reported as `session-feedback-total`, while narrower session spans are missing because they do not cross the per-step slow threshold.

This means the timing interface is still shallow for the exact failure mode we need to diagnose: a slow total made of small measured steps plus a large gap between awaits, worker scheduling, or an unmeasured segment.

## Goals / Non-Goals

**Goals:**
- Make one slow `review.session.feedback` report enough to explain whether latency sits in measured session work or unattributed gap.
- Include sub-threshold session steps when the total session step is slow.
- Keep normal Review logs quiet and reuse the existing slow-summary channel.
- Preserve Review scheduling, durable writes, queue selection, and fail-closed semantics.

**Non-Goals:**
- Do not optimize storage, batching, bridge behavior, or async durability in this change.
- Do not change session advance, undo journal persistence, or frontend Review authority.
- Do not add broad trace logging outside `review.session.feedback`.

## Decisions

1. Buffer session feedback step timings locally for each `feedback()` call.
   - Rationale: the session runtime owns the relevant substeps and can decide at the end whether the total was slow.
   - Alternative rejected: lower the global step threshold. That would make normal ratings noisier and affect other timing surfaces.

2. Flush all buffered session steps only when total feedback is slow.
   - Rationale: live logs need one clear slow report. Fast ratings should not create extra inner-step payload.
   - Alternative rejected: always emit every substep. That increases payload and log surface on the hot path.

3. Add explicit `session-feedback-unattributed-gap`.
   - Rationale: if commit/advance/undo/state are all small but total is slow, the actionable evidence is the gap.
   - Alternative rejected: infer gap only in frontend summary. The session runtime has the most accurate local step total before transport/host aggregation.

## Risks / Trade-offs

- More inner steps can crowd top summaries -> keep step names concise and only flush when total is slow.
- Gap is diagnostic, not root cause -> the next change still needs live evidence before optimizing event-loop, storage, or worker scheduling.
- Timing uses `Date.now()` -> acceptable because existing worker timing already uses the same clock and coarse ms precision.
