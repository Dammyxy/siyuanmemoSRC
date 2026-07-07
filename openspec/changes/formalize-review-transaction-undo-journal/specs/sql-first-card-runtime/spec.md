## MODIFIED Requirements

### Requirement: SQL-first review card mutation persistence
The system SHALL provide a SQL-first mutation persistence path for review-facing card updates that commits card state, sync metadata, queue projection invalidation or patch decisions, and worker-backed Review undo evidence as one observable result.

#### Scenario: Review mutation updates SQL card state
- **WHEN** a review-facing mutation updates scheduling state for a card in a SQL-first slice
- **THEN** the system SHALL persist the updated card state to SQL before reporting mutation success

#### Scenario: Mutation invalidates or patches queue projection
- **WHEN** a SQL-first review mutation changes card membership, due state, source existence, or priority fields used by queue projection
- **THEN** the system SHALL return projection impact that invalidates or patches affected queue projection reads

#### Scenario: Mutation failure does not leave hidden partial success
- **WHEN** SQL-first mutation persistence fails after local Review transaction state was prepared
- **THEN** the system SHALL surface failure to the Review Transaction Safety Envelope so compensation can restore visible session state

#### Scenario: Worker-backed mutation records undo evidence
- **WHEN** a worker-backed Review session mutation reports an undo token
- **THEN** the system SHALL have committed matching Review Transaction Undo Journal evidence in the same durable SQL-first mutation envelope
- **AND** it SHALL NOT report renderer-local undo capability as durable worker undo
