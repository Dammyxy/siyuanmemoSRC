## Context

`review.session.feedback` currently has two durable SQL mutations:

- review commit persists card state / review evidence / queue projection impact
- session runtime appends a Review Transaction Undo Journal row after the visible session advances

The first mutation is already part of the SQLite delta hot path. The second mutation writes `review_transaction_undo_journal`, which exists in the schema but is absent from `SQLITE_DELTA_TABLE_REGISTRY`. In the worker runtime configured with `checkpointStorageClass: 'volatile-projection'`, that unsupported durable table can classify the transaction as a checkpoint and force `siyuanmemo.db` writes during ordinary scoring.

## Goals / Non-Goals

**Goals:**
- Make Review Transaction Undo Journal a registered durable-replay table in SQLite delta.
- Keep the review answer Module Interface small: callers ask for feedback/undo; storage internals own delta vs checkpoint behavior.
- Prove ordinary undo-journal append writes delta segment evidence, not the full DB file.
- Prove restart/replay restores undo-journal rows from delta evidence.

**Non-Goals:**
- Do not make undo journal best-effort or asynchronous after success.
- Do not remove undo journal durability.
- Do not redesign review scheduling, queue projection, or browser refresh logic.
- Do not hide unsupported durable tables behind fallback checkpoint behavior on the review hot path.

## Decisions

1. Register `review_transaction_undo_journal` as `durable-replay`.
   - Rationale: undo tokens are review hot-path truth evidence, not a derived cache.
   - Alternative rejected: leave as unsupported and suppress the checkpoint. That would make durability implicit and weaken fail-closed behavior.

2. Test at the SQLite delta Module seam.
   - Rationale: the bug is table coverage and replay classification. A focused persistence test catches the unsupported-table checkpoint without requiring full UI/session setup.
   - Alternative considered: browser/session e2e. Useful later for latency, but too broad for this storage contract.

3. Keep failure mode unchanged for unknown tables.
   - Rationale: only this known durable table enters the registry. Real unsupported durable mutations must still fail/diagnose instead of silently bypassing durability.

## Risks / Trade-offs

- Schema fingerprint drift -> regression test asserts actual table schema participates in delta and replays after reload.
- Large undo payloads can still grow open segment cost -> existing segment sealing/checkpoint thresholds remain authority.
- Undo consume updates the same table plus card/review-event/queue impact -> this change covers the table, but does not optimize every undo operation.
