## Context

`incremental-learning` and `retrieval-practice` use `SrsV2SessionQueueRuntime` to keep Review navigation and rating off the projection hydration path. The runtime only initialized on `next()`, so a Review component that asks for counters before selecting a card could fall through to `queue.getCounterSnapshot()`. After SQLite delta cleanup, that projection can legitimately be `refreshing/projection_stale`.

## Goals / Non-Goals

**Goals:**
- Initialize SRS v2 session counters from the same live-card source used by `next()`.
- Avoid projection reads for Review mount-time stats while preserving fail-closed projection behavior elsewhere.
- Add regression coverage for runtime and strategy seams.

**Non-Goals:**
- Rebuild projection readiness lifecycle.
- Hide projection errors for non-SRS-v2 queues.
- Resolve repeated Xiuyuan normalization persistence in this counter patch.

## Decisions

- Add `ensureCounterSnapshot()` to session runtime instead of making `getCounterSnapshot()` async. Existing callers keep sync snapshot reads; only Review strategy needs the async initialization path.
- Initialize via `profile.buildInitialCards(queue)`, the same authority as `next()`. This avoids a second queue/projection path and keeps session ordering semantics intact.
- Keep stale projection read failures untouched outside session-backed queues.

## Risks / Trade-offs

- Counter initialization now performs a `getCards()` read earlier on Review mount → mitigated by reusing the loaded runtime for subsequent `next()`.
- If `getCards()` itself fails, Review still fails closed → intended because no authoritative session can be built.
