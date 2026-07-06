## ADDED Requirements

### Requirement: Review Ledger is the durable Review fact authority
The system SHALL represent accepted Review answers as idempotent durable Review Ledger facts containing enough after-state evidence to replay or reconcile the answer without recomputing from user intent alone.

#### Scenario: Review answer accepted
- **WHEN** an SRS Review Kernel accepts a formal rating answer
- **THEN** the system SHALL append or reconcile an idempotent Review Ledger fact with card identity, session identity, rating, reviewedAt, idempotency key, before-card evidence, after-card evidence, and review event evidence
- **AND** it SHALL NOT treat a SQLite delta segment append as the only proof of the Review fact

#### Scenario: Duplicate answer command
- **WHEN** the same answer idempotency key is received again
- **THEN** the system SHALL reconcile against existing Review Ledger evidence
- **AND** it SHALL NOT insert duplicate Review events or recompute a divergent after-state

### Requirement: Card Schedule Store is the current scheduling authority
The system SHALL persist the current card scheduling state through a Card Schedule Store owned by the Review/card runtime, separate from derived queue projection and delta-sync export state.

#### Scenario: Answer updates card schedule
- **WHEN** a Review answer is committed
- **THEN** the Card Schedule Store SHALL contain the after-answer schedule state before committed success is reported
- **AND** queue projection rows SHALL be treated as derived read model state

#### Scenario: Card schedule update fails
- **WHEN** the Card Schedule Store cannot persist the after-answer schedule state
- **THEN** the Review answer SHALL fail closed or return explicit repair-required state
- **AND** renderer/application code SHALL NOT mask the failure with projection-only advancement

### Requirement: Delta Sync Adapter does not block ordinary Review answer on historical sealed reads
The system SHALL keep SQLite delta snapshot reconstruction, sealed segment reads, checkpointing, and sync export behind a Delta Sync Adapter that does not block ordinary same-runtime Review answer success after Review Ledger and Card Schedule Store facts are durable.

#### Scenario: Consecutive Review answers in one runtime
- **WHEN** multiple Review answers commit in the same runtime after sealed delta segments already exist
- **THEN** ordinary answer hot path SHALL NOT read historical sealed `msgpack` segment files to prove the Review answer
- **AND** any delta sync/checkpoint state SHALL be reported separately in diagnostics

#### Scenario: Startup recovery
- **WHEN** the application starts after a crash or reload
- **THEN** recovery MAY read manifests, sealed segments, ledger facts, and card schedule state as needed to prove consistency
- **AND** this recovery verification SHALL remain separate from the ordinary per-answer hot path

#### Scenario: Delta sync export unavailable
- **WHEN** Review Ledger and Card Schedule Store commit succeeds but Delta Sync Adapter export/checkpoint work is unavailable
- **THEN** Review diagnostics SHALL report sync/checkpoint pending or failed state
- **AND** the system SHALL NOT erase or downgrade the durable Review fact
