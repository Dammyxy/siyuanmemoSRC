## Context

The current worker-backed rating path is:

```text
WorkerReviewSessionRuntime.feedback
  -> push undo snapshot
  -> WorkerReviewFeedbackRuntime.reviewFeedback
  -> WorkerReviewCardMutationPersistenceModule.commitReviewFeedback
  -> runtime.runTransaction("review.feedback", persist: true)
  -> advance SessionQueueIndex
  -> undoJournal.append
  -> runtime.runTransaction("review.session.undo-journal.append", persist: true)
```

That leaves the Review answer Module shallow. The session caller must know the ordering between scheduler commit, session advancement, undo evidence, queue impact, and timing. It also creates the visible latency split from the live logs: commit around 400ms plus undo append around 250ms.

Anki's shape is smaller at the caller Interface: answering a card is one operation that updates card scheduling state, writes revlog evidence, updates queue state, and records undo evidence inside the operation transaction. SiYuanMemo should match that structure for worker-backed rating answers.

## Goals / Non-Goals

**Goals:**

- Persist answer undo evidence inside the same `review.feedback` SQL/delta transaction as schedule and Review Ledger writes.
- Keep `WorkerReviewSessionRuntime` responsible for session frontier calculation, but not durable undo writes after commit.
- Keep the answer transaction fail-closed if inline undo-journal evidence cannot be inserted.
- Preserve durable undo/restart behavior through the existing Review Transaction Undo Journal consume path.
- Keep timing evidence clear: no separate answer `session-feedback-undo-journal-append` span.

**Non-Goals:**

- No scheduler rewrite.
- No Review Ledger schema rewrite.
- No SQLite native/WAL migration.
- No skip-path refactor.
- No broad split of the remaining `review.feedback` 400ms internals; that stays a follow-up if logs still show it.

## Decisions

### Decision 1: Session builds undo evidence, transaction persists it

`WorkerReviewSessionRuntime` already owns `frontierBefore` and can deterministically preview `frontierAfter` using the same SessionQueueIndex advancement logic. It SHALL build a `ReviewTransactionUndoJournalEntry` draft before commit and pass it into `reviewFeedback()`.

Alternative rejected: move SessionQueueIndex ownership into the SQL mutation Module. That would deepen the storage transaction too far and mix session cursor rules with scheduler persistence.

### Decision 2: SQL append statement lives in a small journal-store Module

The SQL statement for `review_transaction_undo_journal` SHALL live behind a small internal Module used both by the old skip append path and the new inline answer transaction path. This keeps locality for the storage statement while allowing different transaction owners.

Alternative rejected: duplicate SQL in `SqliteDatabaseService` and `WorkerReviewCardMutationPersistenceModule`. That would make future journal schema changes error-prone.

### Decision 3: Answer path removes the post-commit append

After successful answer commit, `WorkerReviewSessionRuntime` SHALL only advance session state and return the undo token. It SHALL NOT call `undoJournal.append()` for rating answers.

Alternative rejected: keep post-commit append as fallback when inline persistence is unavailable. That preserves the exact split durable path this change is removing.

## Risks / Trade-offs

- [Risk] Frontier preview may drift from real advancement. Mitigation: use the same `advanceAfterRating()` implementation on a cloned session before commit, then on the real session after commit.
- [Risk] Tests with fake feedback runtimes may not persist undo evidence. Mitigation: focused tests assert that session passes the draft evidence into feedback runtime and production mutation tests assert SQL insertion inside `review.feedback`.
- [Risk] Commit timing still shows around 400ms. Mitigation: defer internal commit bucket tracing to a separate change after the second durable append is gone.

## Migration Plan

1. Add tests proving answer feedback passes undo evidence into the transaction and does not call a separate answer append.
2. Add an inline SQL journal append helper and reuse it from the existing append adapter.
3. Extend worker feedback mutation input with optional transaction undo evidence and insert it inside `review.feedback`.
4. Update docs and task ledger.
5. Run focused Review worker tests, boundary/fallback checks, build, OpenSpec validation, and diff check.
