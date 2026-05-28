## MODIFIED Requirements

### Requirement: Queue projection read Module
The system SHALL expose Queue Projection Readiness, projection rows, projection card hydration, projection counters, and Browser Read Model queue snapshot data through one read Module Interface consumed by Browser Queue View Lifecycle and Review queues.

#### Scenario: Queue rows read from projection storage
- **WHEN** a projection-backed queue is readable
- **THEN** Browser and Review SHALL read queue rows and counters from backend projection storage using the same projection identity

#### Scenario: Browser queue snapshot uses projection owner
- **WHEN** Browser requests matched row identity or count for a projection-backed queue
- **THEN** the Browser Read Model SHALL read projection rows from backend projection storage and SHALL NOT build Browser queue rows from local `queue.getCards()`

#### Scenario: Projection hydration detects missing cards
- **WHEN** projection rows reference cards that cannot be hydrated from the SQL card universe
- **THEN** the system SHALL return an explicit projection-unavailable or refresh-required result and SHALL NOT silently continue with incomplete rows

#### Scenario: Local queue path remains explicit
- **WHEN** a queue is not yet declared projection-backed by rollout policy
- **THEN** the system MAY use the existing local queue strategy, but diagnostics SHALL mark the read path as local queue rather than backend projection
