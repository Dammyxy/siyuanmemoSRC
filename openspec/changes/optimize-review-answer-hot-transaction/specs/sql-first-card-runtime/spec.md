## MODIFIED Requirements

### Requirement: SQL Review feedback persistence exposes transaction and delta internals
The SQL-first Review feedback persistence Module SHALL provide internal timing evidence for SQLite transaction and SQLite delta persistence phases used by worker Review feedback, and ordinary Review feedback persistence SHALL avoid full-store and full-snapshot accounting work in the hot path.

#### Scenario: SQLite transaction phases are visible
- **WHEN** a persisted `review.feedback` transaction runs through SQL-first persistence
- **THEN** timing evidence SHALL distinguish transaction begin, transaction writer, change detection, delta capture, SQL commit, and total delta persist

#### Scenario: SQLite delta append phases are visible
- **WHEN** a `review.feedback` transaction appends SQLite delta evidence
- **THEN** timing evidence SHALL distinguish append preflight, pending-size accounting, delta entry build, segment encode, segment write, manifest write, and append-to-segments total

#### Scenario: Diagnostics do not change persistence semantics
- **WHEN** transaction-internal diagnostics are enabled
- **THEN** SQLite delta durability, checkpoint behavior, recovery behavior, and fail-closed hot-path semantics SHALL remain unchanged

#### Scenario: Review feedback mutation stamp is O(1)
- **WHEN** SQL-first Review feedback persistence marks Review mutation metadata
- **THEN** it SHALL update revision/modified timestamp/modified owner evidence without loading the full unified card store or recalculating full content hash

#### Scenario: SQLite delta pending accounting is O(1) on append
- **WHEN** a `review.feedback` transaction appends a SQLite delta entry
- **THEN** threshold checks SHALL use tracked pending-byte accounting plus the new entry byte estimate instead of serializing the whole pending snapshot
