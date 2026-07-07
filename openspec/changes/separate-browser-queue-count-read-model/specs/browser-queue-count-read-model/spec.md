## ADDED Requirements

### Requirement: Browser queue counts do not instantiate full Queue Modules

The system SHALL provide Browser queue counts through a derived count read model for supported queues. Ordinary Browser count refresh MUST NOT instantiate full Queue Modules solely to read counts.

#### Scenario: Count refresh under active Retrieval Review
- **WHEN** a Retrieval Practice Review session is active and a Browser count refresh is triggered by Review feedback
- **THEN** the system SHALL refresh or patch the Retrieval count without creating Incremental Learning or FilterGroup Queue Modules

#### Scenario: Broad count refresh while Review is active
- **WHEN** a broad Browser count refresh is requested while Review pressure is active
- **THEN** immediate work SHALL be scoped to the active Review queue
- **AND** non-active queue count work SHALL be deferred until Review pressure clears

### Requirement: Review answer exposes active queue impact

The system SHALL expose affected queue types and active queue count evidence from Review feedback results so Review UI and Browser UI can update the current queue without broad derived refresh.

#### Scenario: Retrieval answer returns Retrieval impact
- **WHEN** a Retrieval Practice card is rated successfully
- **THEN** the feedback result SHALL identify Retrieval Practice as the affected queue
- **AND** SHALL provide count evidence or count delta sufficient to update the active Review queue display

#### Scenario: Missing count evidence fails explicitly
- **WHEN** active queue count evidence cannot be produced
- **THEN** the system SHALL report explicit unavailable/deferred diagnostics instead of falling back to stale Browser rows or instantiating unrelated queues

### Requirement: Non-active Browser derived work is deferred during Review pressure

The system SHALL treat non-active Browser queue count/readiness/materialization as derived work during active Review pressure.

#### Scenario: Non-active queues do not compete with rating
- **WHEN** the user is rating cards in Retrieval Practice
- **THEN** Incremental Learning, FilterGroup, and Final Drill Browser derived work SHALL NOT run synchronously on the rating hot path unless explicitly visible/active

#### Scenario: Deferred work catches up after Review
- **WHEN** Review pressure clears
- **THEN** deferred non-active Browser count/readiness work SHALL be eligible to run and update Browser counts/readiness explicitly
