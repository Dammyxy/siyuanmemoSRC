## Context

Local Anki review flow keeps the user-facing scheduler interface small while the backend transaction owns card state mutation, revlog append, queue update, and undo evidence. The relevant shape is:

```text
answer_card(input)
  -> transaction(Op::AnswerCard)
  -> apply scheduler state to card
  -> update card row
  -> add revlog entry
  -> update study queue
  -> save undo evidence for card/revlog/queue
```

SiYuanMemo has already moved the same authority in that direction:

```text
review.session.feedback
  -> SrsReviewKernel.answer
  -> WorkerReviewSessionRuntime.feedback
  -> WorkerReviewFeedbackRuntime.reviewFeedback
  -> WorkerReviewCardMutationPersistenceModule
  -> Review Ledger + Card Schedule Store + queue impact
```

The remaining gap is undo/go-back. Worker-backed `goBack` can restore session current card from bounded session journal evidence, but it is not yet a durable transaction undo that can reverse card schedule state, Review Ledger/revlog evidence, and derived queue impact after restart.

This change treats the missing undo layer as a global SRS architecture concern, not a local UI feature. The implementation may substantially refactor the internal Review answer path if that deepens the SRS Review Kernel Module and reduces shallow seams, but the external kernel Interface must remain small.

## Goals / Non-Goals

**Goals:**

- Make worker-backed Review undo/go-back Anki-style: one backend-owned transaction journal records enough before/after evidence to undo an accepted answer.
- Keep `SrsReviewKernel` as the small external Interface: `startSession / current / answer / skip / undo / lookahead / counters / diagnostics`.
- Move undo authority behind the same Module that owns Review answer success, not renderer ReviewHistory or BrowserProjectionIndex.
- Preserve Review auditability by recording reversal/supersession evidence instead of silently deleting Review Ledger facts.
- Make restart-safe undo testable through backend RPC and storage replay, not only through live in-memory session state.
- Keep queue projection, SQLite delta, Domain Sync, and renderer state as adapters or derived read models.

**Non-Goals:**

- No hidden automatic repair of Review Ledger/Card Schedule divergence.
- No physical deletion of review history as the default undo model.
- No broad native SQLite/WAL migration.
- No Browser/manual/right-click queue membership fix inside this change unless implementation tracing proves it is required for undo correctness.
- No support for every legacy/non-worker queue in the first slice; start with RetrievalPractice and IncrementalLearning worker-backed sessions.

## Decisions

### Decision 1: Journal undo transactions, not just session current-card restoration

The Review Transaction Undo Journal SHALL persist an undo record for each undoable worker-backed answer. It must include before-card schedule state, after-card schedule state, Review Ledger/review event identity, session frontier before/after, queue impact metadata, idempotency key, and projection generation evidence.

Alternative considered: keep current worker session undo journal and rename it. Rejected because it cannot prove card schedule and Review Ledger reversal after restart.

### Decision 2: Preserve ledger history with reversal evidence

Undo SHALL append or mark explicit reversal/supersession evidence. It SHALL NOT silently delete Review Ledger facts or pretend the answer never existed. Derived counts and queues may exclude reversed answers, but audit history must remain explainable.

Alternative considered: delete the latest review event on undo. Rejected because it weakens sync/audit semantics and can corrupt multi-device reconciliation.

### Decision 3: Undo commits through the same storage envelope as answer

`SrsReviewKernel.undo()` SHALL fail closed unless the Review Transaction Undo Journal, Card Schedule Store restore, Review Ledger reversal evidence, and projection invalidation/rebuild evidence commit successfully or are proven idempotently committed.

Alternative considered: restore session UI first and flush storage later. Rejected because it recreates the old split-brain failure mode.

### Decision 4: Keep projection as derived state

Undo may invalidate or rebuild BrowserProjectionIndex/queue projection rows, but projection rows are not undo truth. On restart, replay/reconciliation SHALL derive visible queue state from Card Schedule Store plus non-reversed Review Ledger evidence.

Alternative considered: store undo only as a projection patch. Rejected because Browser projection was a prior source of stale count bugs.

### Decision 5: Allow internal kernel refactor, but keep one external seam

The implementation may replace pass-through modules inside worker Review with a deeper `ReviewTransactionRuntime` or equivalent internal Module. Callers must still cross `SrsReviewKernel` rather than learning scheduler, ledger, schedule store, queue, projection, and undo ordering.

Alternative considered: add another public RPC family for undo journal operations. Rejected for the first slice because it exposes implementation seams instead of deepening the kernel.

## Risks / Trade-offs

- [Risk] Reversal semantics can confuse stats/counts if old queries count all review events. -> Mitigation: add explicit tests for ledger count, card `reps/lastReview/due`, and queue counts after undo and restart.
- [Risk] Durable undo adds more writes to rating hot path. -> Mitigation: keep evidence compact, use existing SQL transaction/delta envelope, and measure with existing worker timing diagnostics.
- [Risk] Multi-device sync may see answer and undo in different batches. -> Mitigation: use idempotency keys, transaction IDs, and supersession/reversal references that are replay-order independent.
- [Risk] Large refactor may destabilize already-fixed Review answer path. -> Mitigation: preserve the current `review.session.feedback` contract and add tracer-bullet tests before moving internals.
- [Risk] Non-worker queues keep older go-back semantics temporarily. -> Mitigation: explicitly fail closed or keep legacy paths marked non-worker-only; do not blur authority.

## Migration Plan

1. Add read-only audit/test coverage showing the current worker undo journal cannot undo a committed answer after backend restart.
2. Introduce the Review Transaction Undo Journal schema and storage adapter behind worker Review internals.
3. Write undo evidence during `SrsReviewKernel.answer()` in the same success envelope as schedule/ledger commit.
4. Implement `SrsReviewKernel.undo()` as a storage transaction that restores schedule state, records reversal evidence, restores SessionQueueIndex frontier, and invalidates/rebuilds derived projection.
5. Update replay/reconciliation so reversed answers do not return as active due evidence after restart.
6. Retire renderer fallback go-back for worker-backed sessions; keep non-worker local behavior explicitly scoped.
7. Update `CONTEXT.md`, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.

Rollback is code-only until migration ships. If a persisted undo journal table is introduced, it must be additive and ignored by older builds rather than required for answer replay.

## Open Questions

- Should reversal evidence live in `review_events`, a new ledger table, or a dedicated undo journal table with a projection into `review_events`?
- Should undo decrement `reps` by restoring before-state exactly, or should visible stats treat reversal as compensating evidence while preserving raw reps history?
- Should the first implementation support undo after plugin restart only within a bounded recent transaction window, or indefinitely for all available journal records?
- How should sync conflict resolution display answer+undo pairs if another device has already seen the answer?
