## ADDED Requirements

### Requirement: Worker owns active Review session authority
The system SHALL use the backend worker as the only active authority for Review session cursor state, current card, next-card advancement, session-local counters, pending commit state, and Review session diagnostics.

#### Scenario: Rating advances from worker session state
- **WHEN** a user rates the current Review card in an active worker-owned Review session
- **THEN** the backend worker SHALL return the next session card or session-complete state from worker-owned session state
- **AND** the renderer SHALL display that worker result without computing the next card from renderer-owned cursor state

#### Scenario: Skip advances from worker session state
- **WHEN** a user skips the current Review card in an active worker-owned Review session
- **THEN** the backend worker SHALL apply the session skip rule and return the next session card or session-complete state
- **AND** the renderer SHALL NOT requery queue projection rows to decide the next card

#### Scenario: Session counters are local to worker session
- **WHEN** Review projection counters are stale, deferred, or refresh-required during an active Review session
- **THEN** the worker Review session SHALL provide session-local counters for the visible Review flow
- **AND** projection counter state SHALL be reported separately as derived-cache status

### Requirement: Renderer does not retain fallback Review cursor authority
The system SHALL NOT keep a runtime fallback where renderer-owned Review session cursor, local queue requery, projection patching, or legacy snapshot reads can become the active next-card authority after worker session authority is selected.

#### Scenario: Worker session authority unavailable
- **WHEN** the renderer attempts to start or continue a Review session and worker session authority is unavailable
- **THEN** the system SHALL return a typed unavailable state
- **AND** it SHALL NOT silently fall back to renderer local queue state, legacy snapshot storage, or projection row requery as a second authority

#### Scenario: Old renderer cursor modules remain during migration
- **WHEN** renderer cursor or projection patch modules still exist in the codebase during the cutover
- **THEN** production Review wiring SHALL NOT call them to decide post-feedback next-card advancement
- **AND** tests or static checks SHALL prove they are disconnected from the active Review feedback path

### Requirement: Review session starts may use projection but feedback does not depend on projection
The system SHALL allow Review session initialization to use queue projection rows/counters when projection is ready, while ordinary post-feedback advancement SHALL depend on worker session state rather than projection rows.

#### Scenario: Projection ready at session start
- **WHEN** a Review session starts and queue projection is readable for the requested queue and scope
- **THEN** the worker MAY initialize the session from projection rows and hydrated SQL card state
- **AND** subsequent feedback advancement SHALL use worker session state rather than re-reading projection rows

#### Scenario: Projection becomes stale after session start
- **WHEN** queue projection becomes stale, deferred, or generation-mismatched after the Review session has started
- **THEN** ordinary feedback SHALL continue from worker session state
- **AND** projection state SHALL be reported as derived-cache status without blocking next-card advancement

### Requirement: Review feedback success is gated by journal truth and worker memory state
The system SHALL define ordinary formal Review feedback success as durable after-state Review journal fact append plus worker in-memory SQL/session state update.

#### Scenario: Journal and worker state update succeed
- **WHEN** a user rates a formal Review card and durable after-state journal append succeeds
- **AND** worker in-memory SQL/session state updates succeed
- **THEN** the worker SHALL return committed success and the next session state
- **AND** it SHALL NOT wait for queue projection persistence, SQLite delta checkpoint, sealed-segment reads, main database snapshot persistence, Browser counter refresh, or truth segment flush

#### Scenario: Journal append fails
- **WHEN** a formal Review feedback cannot append its durable after-state journal fact
- **THEN** the worker SHALL fail the feedback closed
- **AND** it SHALL NOT report committed success from in-memory or projection-only state

#### Scenario: Worker in-memory state update fails
- **WHEN** durable journal append succeeds but worker in-memory SQL/session state update fails
- **THEN** the worker SHALL report failed or repair-required state
- **AND** it SHALL NOT let renderer cursor state mask the failed worker session update

### Requirement: Review journal entries store deterministic after-state facts
The system SHALL store Review journal entries as deterministic after-state facts, not merely user intent.

#### Scenario: Formal Review answer is journaled
- **WHEN** a formal Review answer is accepted by worker session authority
- **THEN** the durable journal entry SHALL include card identity, queue/session identity, rating, reviewedAt, idempotency key, before-card evidence, after-card evidence, review event evidence, and queue impact evidence

#### Scenario: Journal replay after restart
- **WHEN** pending or projection-applied Review journal entries are replayed after restart
- **THEN** replay SHALL apply recorded after-state facts or reconcile them with matching durable review event evidence
- **AND** it SHALL NOT recompute scheduling solely from `{ cardId, rating }`

### Requirement: Review session diagnostics separate authority and derived-cache states
The system SHALL expose Review session diagnostics that distinguish worker session authority state from durable journal, projection, SQLite checkpoint, and truth flush states.

#### Scenario: Projection maintenance pending
- **WHEN** projection maintenance has not caught up after a Review answer
- **THEN** Review session diagnostics SHALL report projection as stale, deferred, refresh-required, or pending
- **AND** the current visible session card SHALL remain governed by worker session authority

#### Scenario: SQLite checkpoint pending
- **WHEN** SQLite delta/checkpoint work is pending or slow after a Review answer
- **THEN** Review session diagnostics SHALL report checkpoint state separately
- **AND** the feedback success status SHALL remain based on journal truth and worker in-memory state
