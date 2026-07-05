## Context

SiYuanMemo has already moved much of Review writing into the backend worker, but active Review session control remains split:

```text
Review UI
  -> UnifiedReviewAdapter
  -> UnifiedQueueStrategy
      -> renderer ReviewSessionCursor
      -> projection patch / requery decisions
      -> backend review.feedback
  -> worker writes card/review event and returns queueImpact
```

That split leaks too much implementation detail through the interface. Renderer code needs to know whether the queue is projection-backed, whether projection generation mismatched, whether a requery is required, whether counters are stale, and how to compensate failed feedback. The worker owns durable card mutation, but the renderer still owns much of the user-visible session state.

Live diagnostics now show the cost of this coupling. Slow feedback calls are dominated by host SQLite delta reads, especially `sqlite-delta/v2/sqlite-delta-log.v2.manifest.json` and sealed segment files. Even if we keep optimizing delta append, the system is still organized so derived-cache persistence can remain near the answer success gate.

Reference implementations are simpler:

- Anki answers a card in backend collection state, writes card/revlog/deck stats, and updates in-memory study queues.
- Incrementum updates the canonical item/review state and removes the current card from the current queue/list.
- Neither makes per-answer advancement depend on a persisted projection/checkpoint layer.

The target shape:

```text
Review UI
  -> ThinReviewSessionAdapter
  -> worker ReviewSessionRuntime
      -> session cursor/current/next
      -> review.feedback commit
      -> durable journal after-state fact
      -> worker in-memory SQL update
      -> session-local counters/diagnostics

Background/read models
  -> queue projection rows/counters
  -> sqlite delta/checkpoint
  -> truth flush
  -> projection reconciliation
```

## Goals / Non-Goals

**Goals:**

- Make worker backend the only active Review session authority.
- Remove renderer-owned session cursor authority from active Review feedback and next-card routing.
- Define `review.feedback` success around durable Review journal facts plus worker in-memory state, not projection/checkpoint persistence.
- Keep Review grading and next-card advancement off SQLite delta manifest/sealed segment cold reads.
- Keep projection as derived-cache for Browser, warmup, counters, and session initialization.
- Expose failure states explicitly: worker-session-unavailable, commit-failed, projection-stale, truth-flush-pending, checkpoint-pending.
- Improve module depth: renderer sees a small Review session interface; worker hides cursor, queue impact, journal, and projection maintenance implementation.

**Non-Goals:**

- No dual authority or runtime fallback to renderer cursor.
- No deletion of Browser queue projection.
- No full storage engine replacement or native SQLite migration.
- No scheduler algorithm rewrite.
- No silent best-effort success when durable journal append fails.
- No direct UI SQL access.

## Decisions

### Decision 1: Worker owns active Review session authority

The worker will expose Review session operations such as session start/read current/feedback/skip/finish diagnostics behind one interface. The active session cursor, current card, next-card selection, session-local counters, and pending commit statuses live behind that worker interface.

Renderer Review code becomes a thin adapter. It may cache display DTOs for rendering, but it must not independently decide next-card authority after feedback.

Alternative considered: keep renderer `ReviewSessionCursor` and make worker faster. Rejected because this preserves two authorities and keeps projection/requery complexity at the renderer interface.

### Decision 2: No active fallback to renderer cursor

If worker session authority is unavailable, Review fails closed with a typed unavailable state. The system must not silently switch to renderer local queue, legacy snapshot reads, projection requery, or `UnifiedQueueStrategy` cursor as a second runtime path.

Old modules may remain temporarily during migration only when unreachable from active production wiring or covered by deletion tasks. They must not be kept as a feature flag fallback.

Alternative considered: ship a compatibility toggle. Rejected because it preserves the exact dual-authority bug class this change is removing.

### Decision 3: Journal stores after-state facts

Review journal entries will represent completed Review facts, not merely user intent. A durable entry includes card identity, rating, reviewedAt, queue/session identity, idempotency key, before/after card state, review event evidence, and queue impact evidence sufficient for deterministic replay/reconciliation.

Alternative considered: store only `{ cardId, rating }` and recompute on replay. Rejected because scheduler parameters, wall-clock timing, and code version can drift.

### Decision 4: Worker in-memory SQL updates synchronously; projection/delta persistence does not gate success

Ordinary formal Review feedback must synchronously update worker in-memory SQL/session state so the same session and later worker reads see the new card state. It must not require queue projection persistence, SQLite delta checkpoint, sealed segment reads, main DB snapshot persistence, Browser counter refresh, or truth segment flush before returning success.

If journal append succeeds and worker in-memory state update succeeds, the feedback can return committed with background projection/checkpoint/truth flush status. If journal append fails, feedback fails closed.

Alternative considered: skip in-memory SQL update and rely only on journal until background replay. Rejected because the active session and subsequent reads would be inconsistent.

### Decision 5: Projection remains useful but loses Review next-card authority

Queue projection rows/counters remain derived-cache read models for Browser, initial queue/session materialization, warmup, and background counters. Review session advancement after start uses worker session state and queueImpact, not projection rows.

Projection state can be stale/deferred/refresh-required while Review continues from worker session authority. Reconciliation later catches projection up from durable journal/review event facts.

Alternative considered: delete projection entirely. Rejected because Browser and large queue reads still need a read model.

### Decision 6: The implementation change is one cutover, not a two-step runtime split

The OpenSpec change may be implemented across tasks, but the shipped active path must cut over to worker-owned Review session authority in one release. Intermediate branches used during implementation must not leave both authorities active in production wiring.

Alternative considered: first optimize hot path, later migrate cursor authority. Rejected by product decision: the user wants one architecture cut that removes the root dual-authority design.

## Proposed Interface Shape

Names are illustrative; implementation should follow local conventions:

```ts
type WorkerReviewSessionStartRequest = {
  queueType: QueueType;
  scope?: ReviewScope;
  limit?: number;
  sessionId?: string;
};

type WorkerReviewSessionState = {
  sessionId: string;
  current: ReviewCardDto | null;
  counters: ReviewSessionCounterSnapshot;
  commitStates: ReviewCommitState[];
  projectionState: 'ready' | 'stale' | 'deferred' | 'refresh-required' | 'not-used';
};

type WorkerReviewSessionFeedbackRequest = {
  sessionId: string;
  cardId: string;
  rating: 1 | 2 | 3 | 4;
  reviewedAt: number;
  idempotencyKey: string;
};

type WorkerReviewSessionFeedbackResult = WorkerReviewSessionState & {
  answeredCardId: string;
  journalEntryId: string;
  commitStatus: 'committed' | 'failed' | 'unavailable';
};
```

Important interface property: no projection generation or renderer cursor token is needed for ordinary feedback advancement.

## Migration Plan

1. Add failing tests that prove renderer no longer decides next card when worker returns a session feedback result.
2. Add worker Review session runtime with start/current/feedback/skip/diagnostics operations.
3. Move session cursor/counter advancement behind worker runtime.
4. Change Review UI/application adapter to call worker session methods.
5. Route `review.feedback` through durable after-state journal facts and in-memory SQL update without waiting for projection/delta checkpoint persistence.
6. Mark projection/counter updates as background derived-cache state.
7. Remove active production wiring to renderer `ReviewSessionCursor` / projection requery as feedback authority.
8. Update docs/backlog and validation.

Rollback strategy: revert the change before release. Do not keep a runtime fallback toggle with dual authorities.

## Risks / Trade-offs

- More worker RPC surface: mitigated by one deep Review session interface rather than many shallow projection/cursor calls.
- Existing UI tests may depend on renderer cursor behavior: update tests to assert worker-session adapter behavior instead.
- Commit failure after UI advances: feedback result must expose typed failure/pending state and idempotent retry; no silent success.
- Projection counters may lag during fast review: Review session counters are local authority; Browser/projection counters can report stale/deferred.
- Large cutover risk: validate with narrow tests first, then integration/build. Avoid unrelated refactors.

## Open Questions

- Should worker session state survive tab transfer/reopen through a serialized session id only, or through a full worker session snapshot? Recommendation: session id plus worker-owned snapshot when same worker is alive; durable journal remains replay source after restart.
- Should Review session startup use projection rows by default or direct SQL query when projection is stale? Recommendation: use projection when ready; otherwise fail closed or build worker session from authoritative SQL query without claiming projection readiness.
- Should old renderer cursor modules be deleted in the same change or only disconnected? Recommendation: disconnect active path first, then delete dead code inside same change if tests show no production imports remain.
