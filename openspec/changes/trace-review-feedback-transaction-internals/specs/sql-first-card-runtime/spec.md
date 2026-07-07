## ADDED Requirements

### Requirement: SQL Review feedback persistence exposes transaction and delta internals
The SQL-first Review feedback persistence Module SHALL provide internal timing evidence for SQLite transaction and SQLite delta persistence phases used by worker Review feedback.

#### Scenario: SQLite transaction phases are visible
- **WHEN** a persisted `review.feedback` transaction runs through SQL-first persistence
- **THEN** timing evidence SHALL distinguish transaction begin, transaction writer, change detection, delta capture, SQL commit, and total delta persist

#### Scenario: SQLite delta append phases are visible
- **WHEN** a `review.feedback` transaction appends SQLite delta evidence
- **THEN** timing evidence SHALL distinguish append preflight, pending-size estimates, delta entry build, segment encode, segment write, manifest write, and append-to-segments total

#### Scenario: Diagnostics do not change persistence semantics
- **WHEN** transaction-internal diagnostics are enabled
- **THEN** SQLite delta durability, checkpoint behavior, recovery behavior, and fail-closed hot-path semantics SHALL remain unchanged
