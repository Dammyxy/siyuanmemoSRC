## ADDED Requirements

### Requirement: Review Session Counters Do Not Depend On Refreshing Projection
The system SHALL serve Review session counter and stats reads for SRS v2 queues from the Review session runtime when the backend projection is still refreshing.

#### Scenario: Initial review stats while projection is refreshing
- **WHEN** an SRS v2 Review dialog requests stats before the first card is selected and the backend projection counter is not ready
- **THEN** the stats read SHALL initialize the session runtime from the live queue cards and return a counter without reading projection counters

#### Scenario: Projection-owned queues still fail closed
- **WHEN** a non-session-backed projection queue cannot provide a counter snapshot
- **THEN** the system SHALL keep returning `QUEUE_COUNT_UNAVAILABLE` rather than silently inventing counts
