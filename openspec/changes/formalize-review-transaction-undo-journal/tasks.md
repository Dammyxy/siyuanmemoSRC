## 1. Global Architecture Trace

- [x] 1.1 Trace Anki `answer_card` transaction flow from scheduling state application through card update, revlog write, queue update, and undo evidence.
- [x] 1.2 Trace current SiYuanMemo `review.session.feedback` from `SrsReviewKernel.answer` through Review Ledger, Card Schedule Store, SessionQueueIndex, projection impact, and current undo journal.
- [x] 1.3 Map every worker-backed and renderer-local go-back/undo path, including `ReviewHistory`, `ReviewSessionCursor`, `ReviewTransactionRuntime`, `WorkerReviewSessionRuntime.undo`, and backend RPC contracts.
- [x] 1.4 Decide final reversal representation: Review Ledger supersession row, `review_events` reversal event, dedicated undo journal table, or combined model.

## 2. Regression Harness

- [x] 2.1 Add a failing worker/backend test proving current worker undo cannot restore a committed answer after backend restart.
- [x] 2.2 Add a failing test proving worker-backed go-back must not fall back to renderer ReviewHistory when kernel undo evidence is missing.
- [x] 2.3 Add a failing replay/reconciliation test proving undone/reversed answers do not corrupt Review Ledger count, card `reps/lastReview/due`, or derived queue counts.
- [x] 2.4 Add a focused idempotency test for duplicate undo requests with the same undo token/idempotency key.

## 3. Review Transaction Undo Journal

- [x] 3.1 Introduce Review Transaction Undo Journal storage contract with transaction id, undo token, original review identity, before-card state, after-card state, session frontier before/after, queue impact, projection generation, and idempotency metadata.
- [x] 3.2 Write undo journal evidence during `SrsReviewKernel.answer` / worker Review feedback success before returning an undo token.
- [x] 3.3 Ensure answer success remains fail-closed for contradictory ledger/schedule evidence while allowing explicit diagnostics when durable undo evidence is unavailable.
- [x] 3.4 Keep undo journal evidence compact and included in existing SQL/delta durability envelope.

## 4. Durable Undo Implementation

- [x] 4.1 Implement `SrsReviewKernel.undo` against Review Transaction Undo Journal evidence, not renderer state.
- [x] 4.2 Restore Card Schedule Store before-state exactly, including `due`, `state`, `reps`, `lapses`, `lastReview`, stability/difficulty, elapsed/scheduled days, and relevant metadata.
- [x] 4.3 Record explicit Review Ledger/review event reversal or supersession evidence for the original answer.
- [x] 4.4 Restore SessionQueueIndex current card, lookahead, exclusions, and counters from journaled frontier evidence.
- [x] 4.5 Invalidate or rebuild derived Browser/Queue projection state after undo without using projection as undo truth.
- [x] 4.6 Make duplicate undo idempotent and stale/non-latest undo fail closed with diagnostics.

## 5. Renderer And Adapter Cleanup

- [x] 5.1 Remove worker-backed go-back fallback to renderer ReviewHistory / ReviewSessionCursor.
- [x] 5.2 Keep non-worker local go-back explicit and diagnostically separate.
- [x] 5.3 Update `WorkerReviewSessionQueueRuntime`, `SrsV2SessionQueueRuntime`, and `UnifiedQueueStrategy` to consume kernel undo results as adapter state only.
- [x] 5.4 Update backend RPC contracts and client tests for durable undo diagnostics and idempotency metadata.

## 6. Replay, Audit, And Docs

- [x] 6.1 Extend Review replay/reconciliation so reversal evidence derives active Review facts and queue projection consistently after restart.
- [x] 6.2 Extend Review Storage Audit to report answer/undo pairs, stale undo plans, and ledger/schedule/projection divergence after undo.
- [x] 6.3 Update `CONTEXT.md` with Review Transaction Undo Journal and reversal evidence terms.
- [x] 6.4 Update `ARCHITECTURE.md` with the Anki-style answer/undo transaction flow.
- [x] 6.5 Update `docs/DDD_RESCAN_BACKLOG.md` with retired/deferred debt.

## 7. Validation

- [x] 7.1 Run focused SRS Review Kernel and WorkerReviewSessionRuntime undo tests.
- [x] 7.2 Run focused WorkerReviewFeedbackRuntime / WorkerReviewCardMutationPersistenceModule storage tests.
- [x] 7.3 Run backend RPC contract/client tests for review session undo.
- [x] 7.4 Run replay/reconciliation/audit tests covering restart after answer and undo.
- [x] 7.5 Run `pnpm run check:boundaries`.
- [x] 7.6 Run `pnpm build`.
- [x] 7.7 Run `openspec validate formalize-review-transaction-undo-journal --strict`.
