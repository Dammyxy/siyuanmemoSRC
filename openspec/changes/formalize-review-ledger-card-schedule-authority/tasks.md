## 1. Exploration and Authority Map

- [x] 1.1 Trace `SrsReviewKernel.answer` through Review Ledger evidence, Card Schedule Store state, SQLite delta export, Domain Sync merge, and queue projection rebuild.
- [x] 1.2 Map existing `review_events`, Review feedback journal, card schedule rows, and sync/domain ledgers to Review Ledger vs Card Schedule Store responsibilities.
- [x] 1.3 Identify every current path that compares or repairs Review record count, card `reps/lastReview/due`, or queue projection counts.

## 2. Tests First

- [x] 2.1 Add storage invariant tests proving answer success requires both ledger fact and card schedule after-state.
- [x] 2.2 Add restart/replay tests proving projection/count state derives from ledger/schedule evidence, not stale Browser projection rows.
- [x] 2.3 Add audit tests for divergence among Review Ledger count, card `reps/lastReview/due`, and derived queue counts.
- [x] 2.4 Add repair preview/apply tests proving repairs are explicit, idempotent, stale-plan guarded, and fail closed on incomplete evidence.

## 3. Implementation

- [x] 3.1 Introduce named Review Ledger and Card Schedule Store interfaces around existing SQL/journal/card schedule writes.
- [x] 3.2 Add Review storage audit read model for ledger/schedule/projection divergence.
- [x] 3.3 Add replay/reconciliation path that rebuilds derived Review queue state from ledger/schedule authority.
- [x] 3.4 Add explicit repair preview/apply flow only for evidence-complete ledger/schedule divergence.
- [x] 3.5 Keep SQLite delta, Domain Sync, and BrowserProjectionIndex as adapters/derived state, not answer authority.

## 4. Docs and Validation

- [x] 4.1 Update `CONTEXT.md` with Review Ledger/Card Schedule Store authority and Review storage audit terms.
- [x] 4.2 Update `ARCHITECTURE.md` storage/replay/audit diagrams.
- [x] 4.3 Update `docs/DDD_RESCAN_BACKLOG.md` with debt retired/deferred.
- [x] 4.4 Run focused Review storage/restart/audit tests.
- [x] 4.5 Run `pnpm run check:boundaries`.
- [x] 4.6 Run `pnpm build`.
- [x] 4.7 Run `openspec validate formalize-review-ledger-card-schedule-authority --strict`.
