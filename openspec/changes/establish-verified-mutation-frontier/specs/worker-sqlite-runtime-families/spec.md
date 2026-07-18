## ADDED Requirements

### Requirement: Verified mutation frontier behavior must delegate through a narrow Worker Module
The system SHALL delegate identity/epoch frontier initialization, formal mutation admission, journal observation, monotonic promotion-state advancement, and frontier diagnostics from `WorkerSqliteDatabaseService` to a dedicated Worker-owned Module with explicit dependencies. Ordered publication and failure classification SHALL remain behind `WorkerTruthPromotionModule`; the Worker facade MAY coordinate timers where promotion, storage-pressure maintenance, and shutdown share lifecycle state.

#### Scenario: Worker facade initializes storage
- **WHEN** `WorkerSqliteDatabaseService` loads or reloads a writable storage runtime
- **THEN** it composes the frontier runtime with verified identity, delta journal, promotion state, truth publisher, and diagnostic dependencies rather than implementing frontier arithmetic in the facade

#### Scenario: Frontier runtime performs persistent work
- **WHEN** the frontier runtime reads or writes promotion/frontier state or observes a committed delta sequence
- **THEN** it uses SQL and file-effect dependencies supplied by the Worker DB layer and MUST NOT create an independent database, renderer writer, or kernel writer path

#### Scenario: Public backend behavior remains compatible
- **WHEN** existing backend callers submit Review, Card, Queue, maintenance, or diagnostics commands while the frontier is ready
- **THEN** existing public request and success result shapes remain compatible while durability receipts retain their original mutation identity and journal sequence
