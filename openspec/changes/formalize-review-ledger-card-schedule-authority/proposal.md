## Why

Recent Review durability work fixed the immediate restart rollback and hot-path delta-read symptoms, but the long-term storage contract is still implicit: `review_events`, card schedule rows, sync/domain ledgers, and queue projections can be inspected separately without one explicit authority model. This change formalizes the Anki-style durable core so Review record count, card `reps/lastReview/due`, and replay/audit evidence cannot drift silently.

## What Changes

- Define Review Ledger as the revlog-like append-only authority for accepted Review answers.
- Define Card Schedule Store as the current card scheduling authority after each accepted answer.
- Define replay and reconciliation rules from Review Ledger + Card Schedule Store without using Browser projection or SQLite delta segments as semantic truth.
- Add audit diagnostics for mismatches between Review Ledger count, card schedule state, and queue/read-model projections.
- Add explicit repair-plan flow for proven inconsistencies; no hidden automatic repair and no best-effort fallback success.
- Preserve existing durable failure semantics: answer success still requires ledger + card schedule commit.

## Capabilities

### New Capabilities

- `review-ledger-card-schedule-authority`: Review Ledger and Card Schedule Store form the authoritative, replayable storage model for Review answers and card schedule state.

### Modified Capabilities

- `review-journal-projection-reconciler`: Reconciliation must prefer Review Ledger + Card Schedule Store evidence over projection/journal side effects.
- `sql-first-card-runtime`: Review persistence requirements are tightened around explicit ledger/schedule authority and mismatch diagnostics.

## Impact

- Affected worker/backend storage:
  - `worker/db/SqliteDatabaseService.ts`
  - `worker/db/ReviewFeedbackJournalStore.ts`
  - `worker/db/StorageBootstrapRuntime.ts`
  - `worker/review/*`
- Affected Review commit/session path:
  - `worker/review/SrsReviewKernel.ts`
  - `worker/bootstrap/rpc/BackendReviewRpcAdapter.ts`
  - `src/application/adapters/review-session/*`
- Affected diagnostics and repair:
  - domain sync divergence audit/status paths
  - review restart/replay tests
  - docs/backlog/OpenSpec artifacts

