## Context

The current hot path can look like this:

```text
review.session.feedback
  -> worker session commit
  -> SQL/card/review event persistence
  -> SQLite delta persist
       -> append preflight
       -> read append hot-path snapshot
       -> read manifest
       -> read sealed msgpack segments
  -> response
```

This means the Review answer command can pay for historical delta reconstruction. That makes sync/delta storage behavior part of the user-visible SRS feedback latency.

Anki's model is a better north star:

```text
answer card
  -> update card row
  -> insert revlog row
  -> update in-memory queue/session
  -> later sync/export reads facts
```

## Target Shape

```text
SrsReviewKernel.answer
  -> ReviewLedger.append(fact)
  -> CardScheduleStore.update(afterCard)
  -> SessionQueueIndex.advance
  -> return committed next state

DeltaSyncAdapter
  -> observes / exports / checkpoints ReviewLedger + CardScheduleStore changes
  -> may read sealed segments outside ordinary answer success gate
```

Review Ledger and Card Schedule Store are domain/persistence facts. Delta Sync Adapter is transport/storage maintenance.

## Key Decisions

1. **Ledger fact is the durable Review proof**
   - A Review answer is proven by idempotent Review fact evidence plus after-card schedule state.
   - Delta segment append is not the semantic proof of Review correctness.

2. **Delta sync must not reconstruct history per rating**
   - Ordinary consecutive Review answers in one runtime should not read historical sealed segments.
   - If delta evidence is unavailable, report sync/checkpoint state separately.

3. **Fail closed remains**
   - If Review Ledger append or Card Schedule Store update fails, answer fails.
   - If Delta Sync Adapter later fails, diagnostics and repair/retry own that state; no hidden success downgrade.

4. **Crash recovery uses ledger facts first**
   - Recovery should replay/reconcile Review Ledger and Card Schedule Store evidence before relying on derived projection or delta snapshots.

## Migration Plan

1. Write tests around current feedback path showing sealed segment reads on consecutive answers.
2. Define Review Ledger / Card Schedule Store terminology in docs and tests.
3. Refactor delta persist preflight so hot path uses same-runtime verified state or skips historical sealed reads when ledger/card facts are already authoritative.
4. Move delta checkpoint/snapshot maintenance after committed Review fact where safe.
5. Keep explicit diagnostics for pending/failed delta sync.

## Risks

- Existing delta tests may assume snapshot reconstruction is part of every append.
- Startup recovery has to remain conservative.
- Sync export cannot lose evidence when checkpoint work is deferred.

## Open Questions

- Should Review Ledger remain the existing `review_events` + journal store, or should it become a named storage Module with a narrower Interface?
- Should Card Schedule Store be an explicit Module over current SQL card state, or first be documentation/Interface around existing SQL writes?
