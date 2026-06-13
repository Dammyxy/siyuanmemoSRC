## Context

Progressive / Excerpt flow creates durable learning material from a selected source block or range. Current service code has a deep implementation but a broad caller-facing surface: callers and tests must know too many details about storage mode, source block identity, topic-card linkage, attrs, and duplicate records.

## Goals / Non-Goals

**Goals:**
- Introduce a Progressive Excerpt Materialization Module that takes normalized excerpt input and returns a materialization result.
- Concentrate storage target decisions for source-child, daily-note, and configured-library modes.
- Preserve `ExcerptRecordService` duplicate semantics and Progressive source lineage metadata.
- Make tests hit the same Interface used by `ProgressiveReadingService`.
- Keep explicit unavailable/error outcomes instead of adding best-effort fallback branches.

**Non-Goals:**
- No progressive split redesign.
- No Topic-derived item command redesign.
- No Review queue, scheduler, writer relay, kernel sidecar, AI, or agent work.
- No visual redesign of `ProgressiveSplitDialog`.

## Decisions

1. Put the external Seam at `ProgressiveExcerptMaterializer`.
   - Rationale: materialization is the concept that joins storage target, created entity, attrs, topic card, and lineage.
   - Alternative rejected: split each helper into smaller private functions only. That helps file size but does not improve Interface Depth.

2. Keep `ProgressiveReadingService` as the facade.
   - Rationale: existing callers already use it for progressive operations. The service should delegate materialization rather than disappear in one broad pass.
   - Alternative rejected: migrate every caller directly to the new materializer; that adds churn without extra Leverage.

3. Keep storage writes behind Progressive ports.
   - Rationale: materialization should own orchestration, not concrete Siyuan calls.
   - Alternative rejected: make the materializer an infrastructure adapter; that would mix application policy with Siyuan implementation details.

4. Treat duplicate excerpt behavior as part of the Interface.
   - Rationale: duplicate detection affects user-visible result shape and later Review rendering.
   - Alternative rejected: leave duplicates as an `ExcerptRecordService` internal side effect only; callers still need to know how to interpret result variants.

## Risks / Trade-offs

- Risk: result shapes become too large. Mitigation: expose only materialized entity id/type, topic card id, source lineage, availability, and duplicate state.
- Risk: storage-mode parity drift. Mitigation: characterize all storage modes before extraction.
- Risk: source-child and daily-note paths have different attrs. Mitigation: add attr-level tests for each mode through the materializer Interface.
