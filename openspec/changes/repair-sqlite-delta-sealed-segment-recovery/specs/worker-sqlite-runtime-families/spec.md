# worker-sqlite-runtime-families Specification Delta

## MODIFIED Requirements

### Requirement: Worker SQLite Review Feedback Durability Is Fail-Closed

The worker SQLite runtime SHALL only return committed Review feedback success after the feedback mutation has enough durable evidence to survive restart and replay. If SQLite delta checkpoint or segment replay cannot validate durable evidence, the runtime SHALL surface an explicit unavailable or repair-required outcome.

#### Scenario: SQLite sealed segment recovery is unrecoverable during feedback

- **GIVEN** a Review feedback request reaches the backend worker
- **AND** the SQLite runtime commits or replays through a manifest referencing an unrecoverable sealed segment
- **WHEN** durability classification runs
- **THEN** the worker does not return committed success
- **AND** the failure is classified as storage durability unavailable or repair-required
- **AND** derived queue or Browser projection work is not used as a substitute for durable evidence
