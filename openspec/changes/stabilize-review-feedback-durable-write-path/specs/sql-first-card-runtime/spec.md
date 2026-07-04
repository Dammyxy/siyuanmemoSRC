## MODIFIED Requirements

### Requirement: SQL-first review card mutation persistence
The system SHALL provide a SQL-first mutation persistence path for review-facing card updates that commits minimum authoritative Review feedback state before success, while reporting queue projection invalidation, projection patching, and secondary durability work as separate observable effects.

#### Scenario: Review mutation updates SQL card state
- **WHEN** a review-facing mutation updates scheduling state for a card in a SQL-first slice
- **THEN** the system SHALL persist the updated card state to SQL before reporting mutation success

#### Scenario: Formal Review feedback records durable review evidence
- **WHEN** a SQL-first formal Review feedback mutation is reported as committed
- **THEN** the system SHALL have persisted one append-only review fact or review event with the commit idempotency identity before reporting success

#### Scenario: Mutation invalidates or patches queue projection
- **WHEN** a SQL-first review mutation changes card membership, due state, source existence, or priority fields used by queue projection
- **THEN** the system SHALL return projection impact that invalidates, patches, defers, or refreshes affected queue projection reads without requiring ordinary Review feedback to finish a full projection rebuild before committed success

#### Scenario: Mutation failure does not leave hidden partial success
- **WHEN** SQL-first mutation persistence fails after local Review transaction state was prepared
- **THEN** the system SHALL surface failure to the Review Transaction Safety Envelope so compensation can restore visible session state or mark the commit failed, pending retry, unavailable, or repair-required
