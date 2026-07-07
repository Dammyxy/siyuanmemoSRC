## 1. Regression Coverage

- [x] 1.1 Add SQLite delta regression test proving undo-journal append writes delta evidence without rewriting `siyuanmemo.db`
- [x] 1.2 Add reload/replay assertion proving undo-journal rows survive restart from delta evidence

## 2. Implementation

- [x] 2.1 Register `review_transaction_undo_journal` as a durable-replay SQLite delta table with schema-matched columns and primary key
- [x] 2.2 Preserve unsupported-table fail-closed behavior for other durable tables

## 3. Documentation

- [x] 3.1 Update domain/architecture docs for Review Transaction Undo Journal delta ownership
- [x] 3.2 Append DDD backlog task delta for fixed and deferred debt

## 4. Validation

- [x] 4.1 Run focused SQLite persistence tests
- [x] 4.2 Run hidden-fallback/boundary/build/OpenSpec validation and diff checks
