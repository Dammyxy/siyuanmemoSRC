## MODIFIED Requirements

### Requirement: SQL-first review card mutation persistence
The system SHALL provide a SQL-first mutation persistence path for review-facing card updates that commits card state, sync metadata, queue projection invalidation or patch decisions, queue-impact evidence, and commit status as one observable result consumable by the Review Answer Pipeline.

#### Scenario: Review mutation updates SQL card state
- **WHEN** a review-facing mutation updates scheduling state for a card in a SQL-first slice
- **THEN** the system SHALL persist the updated card state to SQL before reporting mutation success

#### Scenario: Mutation invalidates or patches queue projection
- **WHEN** a SQL-first review mutation changes card membership, due state, source existence, or priority fields used by queue projection
- **THEN** the system SHALL return projection impact that invalidates or patches affected queue projection reads

#### Scenario: Mutation failure does not leave hidden partial success
- **WHEN** SQL-first mutation persistence fails after local Review transaction state was prepared
- **THEN** the system SHALL surface failure to the Review Transaction Safety Envelope so compensation can restore visible session state

#### Scenario: Pipeline consumes mutation result without restitching evidence
- **WHEN** the Review Answer Pipeline receives a successful runtime answer result from the SQL-first mutation path
- **THEN** the result SHALL expose queue-impact evidence, affected queue types, counter snapshot, commit status, and commit idempotency key without requiring the caller to recompute them from queue state
