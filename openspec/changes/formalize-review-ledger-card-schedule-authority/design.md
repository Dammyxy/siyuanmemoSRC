## Context

The current data model already contains most of the raw evidence needed for an Anki-style durable core:

- `review_events` / Review feedback journal record accepted answers.
- card rows carry current schedule state such as `reps`, `lastReview`, `due`, stability, difficulty, and state.
- SQLite delta and Domain Sync layers export, checkpoint, merge, and diagnose those facts.
- Browser/queue projection rows derive visible queue membership and counts.

The missing architecture piece is a named authority contract that says which facts decide whether a Review answer happened, what the card schedule became, and how restart/replay/audit should behave when derived state disagrees.

## Target Shape

```text
SrsReviewKernel.answer
  -> ReviewLedger.appendOrReuse(idempotent review fact)
  -> CardScheduleStore.commit(after-card schedule state)
  -> SessionQueueIndex.advance
  -> return current/next/counters/diagnostics

ReviewReplayAudit
  -> reads ReviewLedger + CardScheduleStore
  -> reports count/reps/due divergence
  -> builds explicit repair plan when evidence is sufficient

Projection / Delta / Sync Adapters
  -> derive/export/repair read models
  -> never become Review answer truth
```

## Key Decisions

1. **Ledger + schedule are the authority**
   - An accepted answer is proven by one idempotent Review Ledger fact plus matching Card Schedule Store after-state.
   - Queue projection rows, SQLite delta segments, and Browser rows are derived evidence.

2. **Replay is explicit and bounded**
   - Replay/reconciliation may reconstruct derived projection/read-model state from ledger/schedule evidence.
   - It must not silently reschedule cards from partial history when schedule evidence is missing or contradictory.

3. **Audit before repair**
   - Diagnostics shall report mismatches among Review Ledger count, card `reps/lastReview/due`, and derived queue counts.
   - Repair must be an explicit plan/apply flow with idempotency and stale-plan checks.

4. **No hidden fallback authority**
   - If ledger/schedule authority is unavailable, Review answer fails closed.
   - BrowserProjectionIndex, SQLite delta reconstruction, Domain Sync merge, or renderer cursor state cannot declare answer success.

## Migration Plan

1. Map existing `review_events`, Review feedback journal, card rows, and schedule commit evidence into named Review Ledger / Card Schedule Store interfaces.
2. Add audit tests for consistent and inconsistent states:
   - ledger count equals card review facts
   - card `reps/lastReview/due` matches latest accepted answer evidence
   - queue projections are treated as derived and repairable
3. Add replay/reconciliation tests that rebuild derived state from ledger/schedule without projection authority.
4. Add repair-plan preview/apply only for evidence-complete mismatches.
5. Update `CONTEXT.md`, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.

## Risks

- Existing startup repair paths may blur journal, projection, and card-state ownership.
- Sync conflict merge may currently report divergences without enough typed evidence to build repair plans.
- Over-eager repair could corrupt valid schedule state, so the first implementation must prefer diagnostics over mutation.

## Out Of Scope

- No native SQLite/WAL migration.
- No hidden automatic repair.
- No rescheduling from incomplete review history.
- No change to scheduler algorithms.
- No Browser projection performance work.

