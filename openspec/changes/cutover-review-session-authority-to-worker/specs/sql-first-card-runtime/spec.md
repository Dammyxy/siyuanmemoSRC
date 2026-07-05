## MODIFIED Requirements

### Requirement: Queue projection read Module
The system SHALL expose Queue Projection Readiness, projection rows, projection card hydration, and projection counters through one read Module Interface consumed by Browser Queue View Lifecycle, queue warmup, and Review session initialization. Queue projection SHALL remain a derived-cache read model and SHALL NOT act as the active post-feedback next-card authority for an already-started worker-owned Review session.

#### Scenario: Queue rows read from projection storage
- **WHEN** a projection-backed queue is readable
- **THEN** Browser and Review session initialization SHALL read queue rows and counters from backend projection storage using the same projection identity

#### Scenario: Projection hydration detects missing cards
- **WHEN** projection rows reference cards that cannot be hydrated from the SQL card universe
- **THEN** the system SHALL return an explicit projection-unavailable or refresh-required result and SHALL NOT silently continue with incomplete rows

#### Scenario: Local queue path remains explicit
- **WHEN** a queue is not yet declared projection-backed by rollout policy
- **THEN** the system MAY use the existing local queue strategy for session initialization, but diagnostics SHALL mark the read path as local queue rather than backend projection

#### Scenario: Active Review feedback does not use projection as next-card authority
- **WHEN** an already-started worker-owned Review session receives feedback for the current card
- **THEN** the system SHALL advance from worker session state and SHALL NOT require queue projection rows or counters to be synchronously read, patched, rebuilt, or persisted before returning the next card

### Requirement: SQL-first review card mutation persistence
The system SHALL provide a SQL-first mutation persistence path for review-facing card updates that commits worker in-memory card state, sync metadata, durable after-state Review journal facts, and queue projection impact as observable results. Ordinary worker-owned Review feedback SHALL NOT wait for queue projection persistence, SQLite delta checkpoint, full domain sync merge, Browser counter refresh, or canonical storage repair before returning committed success when durable journal append and worker in-memory state update have succeeded.

#### Scenario: Review mutation updates worker SQL card state
- **WHEN** a review-facing mutation updates scheduling state for a card in a SQL-first slice
- **THEN** the system SHALL update worker in-memory SQL card state before reporting worker Review feedback committed success

#### Scenario: Durable journal fact gates committed success
- **WHEN** a formal Review mutation is accepted
- **THEN** the system SHALL append a durable after-state Review journal fact before reporting committed success
- **AND** it SHALL fail closed if durable journal storage is unavailable

#### Scenario: Mutation invalidates, patches, or defers queue projection
- **WHEN** a SQL-first review mutation changes card membership, due state, source existence, or priority fields used by queue projection
- **THEN** the system SHALL return projection impact that patches, invalidates, refreshes, or defers affected queue projection reads as derived-cache state
- **AND** it SHALL NOT require projection persistence to prove worker Review session advancement

#### Scenario: Mutation failure does not leave hidden partial success
- **WHEN** SQL-first mutation persistence fails after worker Review session state was prepared
- **THEN** the system SHALL surface a failed commit or repair-required state to the worker-owned Review session
- **AND** renderer Review code SHALL NOT compensate by advancing from a separate renderer cursor authority

#### Scenario: Ordinary Review answer does not run full sync merge
- **WHEN** domain sync has divergent sources but the current card has no proven blocking conflict
- **THEN** the SQL-first review mutation path SHALL avoid a full pre-answer domain sync merge and SHALL expose sync divergence diagnostics separately
