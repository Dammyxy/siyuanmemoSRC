## MODIFIED Requirements

### Requirement: SQL-first review card mutation persistence
The system SHALL provide a SQL-first mutation persistence path for review-facing card updates that commits card state, sync metadata, minimum durable Review feedback evidence, and queue projection invalidation or patch decisions as one observable result.

#### Scenario: Review mutation updates SQL card state
- **WHEN** a review-facing mutation updates scheduling state for a card in a SQL-first slice
- **THEN** the system SHALL persist the updated card state to SQL before reporting mutation success

#### Scenario: Mutation persists minimum Review feedback evidence
- **WHEN** formal Review feedback updates scheduling state for a card in a SQL-first slice
- **THEN** the synchronous mutation result SHALL prove persisted scheduler/card state, append-only review fact or review event evidence, and commit idempotency identity before reporting committed success

#### Scenario: Mutation reports secondary work separately
- **WHEN** SQL-first Review mutation persistence proves the minimum durable Review feedback commit but queue projection, Browser projection, truth flush, Xiuyuan sync, native-Riff sync, or full checkpoint maintenance remains incomplete
- **THEN** the mutation result SHALL report that secondary work separately and SHALL NOT treat it as hidden committed-success evidence

#### Scenario: Mutation invalidates or patches queue projection
- **WHEN** a SQL-first review mutation changes card membership, due state, source existence, or priority fields used by queue projection
- **THEN** the system SHALL return projection impact that invalidates or patches affected queue projection reads

#### Scenario: Mutation failure does not leave hidden partial success
- **WHEN** SQL-first mutation persistence fails after local Review transaction state was prepared
- **THEN** the system SHALL surface failure to the Review Transaction Safety Envelope so compensation can restore visible session state

#### Scenario: Mutation recovery failure fails closed
- **WHEN** SQL-first mutation persistence cannot prove durable commit because host-effect timeout, corrupt delta repair failure, or in-memory restore failure prevents recovery
- **THEN** the system SHALL return explicit unavailable or repair-required diagnostics and SHALL NOT report mutation success
