## ADDED Requirements

### Requirement: Review Transaction Undo Journal participates in SQLite delta replay
The system SHALL persist Review Transaction Undo Journal mutations through SQLite delta durable replay so normal `review.session.feedback` undo-token evidence survives restart without forcing a full `siyuanmemo.db` checkpoint solely because `review_transaction_undo_journal` changed.

#### Scenario: Undo journal append uses delta on review feedback hot path
- **WHEN** `review.session.feedback` appends a Review Transaction Undo Journal row and SQLite delta persistence is enabled
- **THEN** the system SHALL write delta segment evidence for `review_transaction_undo_journal`
- **AND** the system SHALL NOT write `siyuanmemo.db` solely because the undo journal table changed

#### Scenario: Undo journal row replays after restart
- **WHEN** a persisted SQLite delta segment contains a Review Transaction Undo Journal row and the runtime reloads from the last checkpoint/base database
- **THEN** the replayed SQLite database SHALL contain the undo journal row with its undo token, transaction id, session id, queue type, status, timestamps, and payload JSON intact

#### Scenario: Unsupported durable tables remain fail-closed
- **WHEN** a review hot-path transaction mutates a durable table that is not registered for SQLite delta replay
- **THEN** the system SHALL continue to classify that mutation as unsupported instead of silently treating it as undo-journal delta coverage
