## Context

Current logs suggest two independent concerns are still close together:

```text
Review answer
  -> session-runtime-answer
  -> ReviewSessionController update-state
  -> queue created / projection warmup / filter-group repair logs
```

Some projection work is derived maintenance and should happen. The issue is ownership: active Review session advancement and Browser projection readiness are different jobs.

## Target Shape

```text
SrsReviewKernel
  -> SessionQueueIndex
       - current card
       - lookahead
       - session exclusions
       - session counters
       - answer/skip advancement

Browser
  -> BrowserProjectionIndex
       - matched row identity
       - counts
       - filter/sort projections
       - projection warmup / repair
       - row hydration

Facts
  -> ReviewLedger + CardScheduleStore
       - source of truth for rebuilding both indexes
```

The two indexes may share source facts and storage helpers, but their Interfaces and latency budgets differ.

## Key Decisions

1. **SessionQueueIndex owns active session advancement**
   - Once a Review session starts, post-feedback next card comes from session queue state.
   - Projection generation mismatches do not force synchronous Browser projection rebuild before switching.

2. **BrowserProjectionIndex owns Browser readiness**
   - Browser may wait for projection warmup, repair stale filter groups, and hydrate rows.
   - Those states are Browser read-model states, not Review answer authority.

3. **Handoff is explicit**
   - Session start may seed from projection snapshot if ready.
   - After seed, SessionQueueIndex carries its own frontier/lookahead until session refresh/restart.

4. **Diagnostics name the owner**
   - Slow logs must say `session-queue`, `browser-projection`, `projection-repair`, `storage`, or `sync`.
   - Generic `update-state` timing is insufficient for future diagnosis.

## Migration Plan

1. Document current Review/Brower queue/projection call chain and timing owners.
2. Introduce SessionQueueIndex and BrowserProjectionIndex terms in docs/specs.
3. Add timing probes/tests that distinguish Review update-state from Browser projection warmup/repair.
4. Move any post-feedback Browser projection warmup/repair scheduling off the blocking Review UI state update path.
5. Keep Browser projection fail-closed for Browser reads.

## Risks

- Some existing queue types may rely on Browser projection side effects for Review counters.
- Filter-group repair may currently be triggered from shared queue invalidation events.
- NeuralRoam route/session state may need a specialized session index policy.

## Open Questions

- Should BrowserProjectionIndex live under existing `queue-projection` naming, or get a new Browser Read Model package?
- Should SessionQueueIndex be worker-only, or have shared type definitions for renderer tests?
