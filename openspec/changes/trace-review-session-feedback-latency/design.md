## Context

After `include-review-undo-journal-in-sqlite-delta`, live logs show:

- `mainDb=none`
- host effects only write SQLite delta files
- `hostTotal` is ~50-80ms
- total `review.session.feedback` is still ~550-680ms
- the dominant inner step is `session-feedback-total`, which is too coarse

`WorkerReviewSessionRuntime.feedback()` already measures commit and advance, but it does not measure undo-journal append or final result shaping. Because slow inner steps are thresholded, total can dominate without explaining which unmeasured segment caused the delay.

## Goals / Non-Goals

**Goals:**
- Attribute Review session feedback latency to narrow worker steps.
- Identify expected SQLite delta write substeps in host summaries.
- Preserve quiet normal logs: diagnostics should appear only in existing slow-summary/runtime timing surfaces.
- Keep Review Answer Pipeline and SRS Review Kernel storage semantics unchanged.

**Non-Goals:**
- Do not optimize latency in this change unless the diagnostic gap itself is the cost.
- Do not change delta durability, segment thresholds, or async success semantics.
- Do not introduce UI-side fallback or renderer-owned Review authority.

## Decisions

1. Measure uninstrumented session steps first.
   - Rationale: current evidence says storage is designed correctly, but total latency is unattributed. Better attribution is the smallest safe next Module deepening.
   - Alternative rejected: immediately tune segment rollover. Logs show host time is not the main 550-680ms cost.

2. Reuse existing backend worker inner-step timing.
   - Rationale: the slow worker summary already consumes this timing, so adding spans there improves live reports without new log channels.
   - Alternative rejected: add ad hoc console logs. That reintroduces log flood.

3. Add SQLite delta write metadata at the delta adapter.
   - Rationale: `purpose=unknown` on open/sealed/manifest writes hides whether storage writes are expected append/rollover work.
   - Alternative rejected: infer purpose from path in the UI summary. The storage adapter already knows the substep.

## Risks / Trade-offs

- More inner steps can truncate timing lists → keep names concise and only add hot-path gaps.
- Timing overhead should stay negligible → use existing Date.now measurement helper.
- The next live report may still show one dominant step → that becomes the real optimization target for a follow-up change.
