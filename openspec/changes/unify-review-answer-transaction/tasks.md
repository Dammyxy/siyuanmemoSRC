## 1. Contract And Tests

- [x] 1.1 Add OpenSpec artifacts for the unified Review answer transaction.
- [x] 1.2 Add session-runtime regression coverage proving answer undo evidence is passed into feedback and no separate answer append runs.
- [x] 1.3 Add feedback-runtime regression coverage proving undo journal SQL is inserted inside `review.feedback`.

## 2. Transaction Implementation

- [x] 2.1 Add a shared Review Transaction Undo Journal SQL append helper.
- [x] 2.2 Pass session answer undo evidence into `WorkerReviewFeedbackRuntime`.
- [x] 2.3 Persist answer undo evidence inside `WorkerReviewCardMutationPersistenceModule.commitReviewFeedback()`.
- [x] 2.4 Remove answer `session-feedback-undo-journal-append` timing from `WorkerReviewSessionRuntime.feedback()`.

## 3. Docs And Debt Ledger

- [x] 3.1 Update `CONTEXT.md` / `ARCHITECTURE.md` with unified answer transaction ownership.
- [x] 3.2 Append `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred debt.

## 4. Validation

- [x] 4.1 Run focused Review session / feedback / undo journal tests.
- [x] 4.2 Run hidden fallback and boundary checks.
- [x] 4.3 Run `pnpm build`, strict OpenSpec validation, and `git diff --check`.
