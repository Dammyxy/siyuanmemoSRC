## Context

`stabilize-review-durability-segments` already established the broad Review durability design: formal `review.feedback` success is gated by local journal plus SQL delta/checkpoint durability, Review truth v2 is async, SQLite delta v2 owns restart replay, and projection-backed Review queues must fail closed when replay is not proven. After backend RPC method-family modularization, three focused restart/storage tests remain skipped in `worker/bootstrap/__tests__/BackendReviewSyncRpcAdapter.test.ts`.

This change is a narrow follow-up. It treats those skipped tests as the acceptance harness for the remaining gap below the RPC adapter seam. It does not introduce a new storage family or alter JSON-RPC routing. It tightens the restart order where SQL replay, journal reconciliation, truth-flush compensation, and Queue Projection Readiness meet.

## Goals / Non-Goals

**Goals:**

- Unskip and pass the three remaining Review storage/restart durability scenarios in the backend RPC adapter test suite.
- Preserve `projection-applied` Review journal entries after explicit checkpoint failure so async truth flush compensation can still run.
- Ensure a truth-flushed Incremental Learning review remains out of the ready count after restart replay.
- Reconcile stale `prepared` journal entries to `projection-applied` when durable SQL already contains the matching idempotent review event.
- Keep failure behavior explicit: preparing or unavailable state instead of local queue fallback when durable replay/reconciliation cannot prove readiness.

**Non-Goals:**

- No JSON-RPC method string, registry, or backend RPC family routing changes.
- No changes to SQL worker authority, writer relay ownership, or kernel sidecar ownership.
- No new MessagePack truth format, SQLite delta storage class, v1 migration, or native SQLite/WAL design.
- No fallback, compatibility, or dual-path behavior that can hide restart replay errors.
- No broad Review/truth/domain-sync refactor beyond the code needed for the three assertions.

## Decisions

1. Use the skipped tests as the implementation boundary.

   The change starts by removing `.skip` from one scenario at a time and driving each to green with the smallest production fix. This keeps the seam narrow and prevents the new change from absorbing the older durability roadmap.

   Alternative considered: fold the work back into `stabilize-review-durability-segments`. Rejected because that change is broad and nearly complete; the remaining work is now a targeted restart/storage hardening slice.

2. Restart reconciliation must run after durable SQL replay and before queue readiness reads.

   The startup path must first rebuild the worker SQL projection from durable checkpoint/delta state, then reconcile Review feedback journal entries, then expose projection-backed Review queue counts/session reads. Truth flush compensation can follow local recovery, but it must not be required before the ready count is correct.

   Alternative considered: let Review queue reads trigger lazy reconciliation. Rejected because it spreads readiness ordering across callers and makes stale queue counts possible during the first read.

3. Checkpoint failure must not clear locally durable journal compensation state.

   A failed explicit checkpoint can report diagnostics, but it must leave `projection-applied` journal entries pending for async Review truth flush. Clearing or downgrading that entry would convert a recoverable sync-visible truth backlog into silent data loss.

   Alternative considered: treat checkpoint failure as proof that projection state is unavailable and mark journal entries failed. Rejected because `projection-applied` means local SQL durability already succeeded; the failed checkpoint is a later maintenance operation.

4. Prepared journal reconciliation must be idempotency-first.

   On restart, a `prepared` journal entry with a matching durable SQL review event must advance to `projection-applied` and must not write another `review_events` row. The idempotency key is the authority for recognizing the committed Review fact.

   Alternative considered: replay every `prepared` entry as a new mutation. Rejected because it can duplicate review events and corrupt scheduling history.

5. Fail closed instead of rebuilding counts from stale local queue state.

   If SQL replay or Review journal reconciliation cannot prove a readable projection identity, projection-backed Review surfaces must report preparing or unavailable. They must not compute ready count from local queue materialization, legacy snapshots, or stale in-memory session data.

   Alternative considered: fall back to local queue cards to keep Review usable. Rejected because it can resurrect already-reviewed Incremental Learning cards after restart, which is the defect this change closes.

## Risks / Trade-offs

- [Risk] Focused fixes may expose older broad durability assumptions in adjacent tests. -> Mitigation: unskip and fix one acceptance scenario at a time, then run the full focused backend Review adapter suite.
- [Risk] Startup ordering changes can affect Browser queue views that also consume Queue Projection Readiness. -> Mitigation: keep changes inside Review storage/restart readiness and run boundary checks.
- [Risk] Idempotency reconciliation can mask divergent journal/request payloads if it only checks the key. -> Mitigation: require the durable SQL review event to match the journal entry's card, timestamp, and rating-relevant identity before advancing status.
- [Risk] Explicit unavailable state can surface more often during broken storage than stale counts did. -> Mitigation: this is intentional fail-closed behavior; diagnostics must identify replay or reconciliation failure.

## Migration Plan

1. Confirm proposal, design, spec, and tasks validate under OpenSpec before implementation.
2. Unskip the checkpoint-failure journal preservation scenario and fix only the checkpoint/journal cleanup path needed for it.
3. Unskip the truth-flushed Incremental Learning restart replay scenario and fix replay/reconciliation/readiness ordering needed for it.
4. Unskip the stale prepared journal plus durable SQL idempotency scenario and fix reconciliation without duplicate review events.
5. Run targeted Vitest after each slice, then `pnpm run check:boundaries`, `git diff --check`, and `pnpm build` if production runtime files changed.
6. Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` only if the runtime responsibility map or debt ledger changes.

Rollback path: revert this narrow change's production edits and re-skip only the three acceptance tests with explicit debt comments. Do not add a fallback path to preserve green tests.

## Open Questions

None. This change intentionally defers any broader Review truth compaction, native SQLite ownership, and old delta/truth migration decisions.
