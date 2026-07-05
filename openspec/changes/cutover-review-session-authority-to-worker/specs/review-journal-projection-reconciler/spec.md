## ADDED Requirements

### Requirement: Projection reconciliation follows worker Review session facts
The system SHALL reconcile queue projection state from durable Review journal/review event evidence produced by worker-owned Review session authority, and SHALL NOT use projection reconciliation as Review session next-card authority.

#### Scenario: Worker session advances before projection catches up
- **WHEN** worker-owned Review session feedback commits a durable after-state journal fact and returns the next session card
- **AND** queue projection maintenance is still pending
- **THEN** the reconciler SHALL later update or refresh projection from durable Review evidence
- **AND** it SHALL NOT require the renderer to resubmit feedback or recompute next-card state from projection rows

#### Scenario: Projection still includes reviewed card after restart
- **WHEN** durable Review journal/review event evidence proves a card was reviewed but derived queue projection still includes that card
- **THEN** the reconciler SHALL repair or refresh projection rows from authoritative SQL/journal evidence
- **AND** it SHALL NOT change worker Review session authority semantics

#### Scenario: Projection evidence is missing
- **WHEN** durable Review evidence exists but projection dependencies are unavailable or stale
- **THEN** the reconciler SHALL report explicit projection stale or refresh-required state
- **AND** it SHALL NOT fall back to renderer local queue state or legacy snapshot reads

### Requirement: Reconciler preserves after-state journal semantics
The system SHALL preserve deterministic after-state Review journal facts during projection reconciliation.

#### Scenario: Journal entry contains after-card evidence
- **WHEN** a Review journal entry includes after-card and review event evidence
- **THEN** the reconciler SHALL use that evidence to prove the Review fact and projection impact
- **AND** it SHALL NOT recompute scheduler results from only card id, rating, and current time

#### Scenario: Matching durable event reconciles journal status
- **WHEN** a Review journal entry has matching durable `review_events` evidence by idempotency key, card identity, reviewed timestamp, rating, and queue/session identity
- **THEN** the reconciler SHALL advance journal/projection status without inserting a duplicate Review event
