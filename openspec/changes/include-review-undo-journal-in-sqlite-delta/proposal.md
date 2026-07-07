## Why

Review scoring still pays a slow durable-write cost after the review commit is done because `review.session.feedback` appends the session undo journal through a second SQL transaction, but `review_transaction_undo_journal` is not covered by SQLite delta replay. In the worker volatile-projection runtime that makes the undo journal look like an unsupported durable table, so normal scoring can force a full `siyuanmemo.db` checkpoint/write.

## What Changes

- Include Review Transaction Undo Journal rows in the same SQLite delta durable replay contract as cards, queue state, and review events.
- Require ordinary review feedback undo-journal append to avoid full `siyuanmemo.db` checkpoint/write unless an explicit checkpoint or recovery condition requires it.
- Preserve fail-closed behavior for truly unsupported durable tables and for corrupt/missing delta evidence.
- Add regression coverage for append and reload/replay of undo journal rows from delta segments.

## Capabilities

### New Capabilities

### Modified Capabilities
- `sql-first-card-runtime`: Review feedback durable mutation now includes session undo journal delta coverage so undo evidence survives restart without forcing a full DB write on every answer.

## Impact

- Affected code: `src/infrastructure/persistence/sqlite/SqliteDeltaCheckpoint.ts`, SQLite persistence tests, worker review undo-journal persistence path.
- Affected docs: `CONTEXT.md`, `ARCHITECTURE.md`, `docs/DDD_RESCAN_BACKLOG.md`.
- No new dependency, no compatibility fallback, no async-only success path.
