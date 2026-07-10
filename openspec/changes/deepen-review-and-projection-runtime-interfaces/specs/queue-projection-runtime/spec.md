## ADDED Requirements

### Requirement: Queue projection lifecycle has three external operations
The system SHALL expose Queue Projection Lifecycle through `read`, `repair`, and `observe` operations or an equivalent Interface with no broader caller knowledge.

#### Scenario: Caller reads projection state
- **WHEN** Browser, Review Admission, diagnostics, or maintenance requests readiness, snapshot, or rows
- **THEN** the caller uses the lifecycle read operation and receives a typed `ready`, `refreshing`, or `unavailable` result

#### Scenario: Caller repairs projection state
- **WHEN** an authorized application workflow decides a projection requires materialization, rebuild, invalidation, or refresh
- **THEN** it uses the lifecycle repair operation and receives a typed repair receipt

#### Scenario: Caller observes identity
- **WHEN** a projection commits ready or invalidated identity
- **THEN** lifecycle observers receive the canonical queue, policy, generation, reason, and source event

## MODIFIED Requirements

### Requirement: Queue projection runtime owns projection readiness
The system SHALL provide an application-owned Queue Projection Lifecycle module that passively returns explicit queue projection readiness outcomes for projection-backed queues without requiring Browser or Review callers to infer readiness from generic backend errors.

#### Scenario: projection is ready
- **WHEN** a projection-backed queue has a readable snapshot with valid policy identity and generation
- **THEN** the lifecycle read operation returns `ready` with the queue identity, policy identity, and generation

#### Scenario: projection is refreshing
- **WHEN** projection materialization or refresh is already in progress
- **THEN** the lifecycle read operation returns `refreshing` with retry guidance and MUST NOT start a second repair operation

#### Scenario: projection is unavailable
- **WHEN** projection readiness cannot be established because the queue is invalid, backend is unavailable, or the latest explicit repair failed
- **THEN** the lifecycle read operation returns `unavailable` with an explicit cause and recoverability flag

### Requirement: Queue projection runtime owns materialization and echo
The system SHALL route projection materialization through an explicit Queue Projection Lifecycle repair command using backend worker or writer relay only, and SHALL store any materialized echo only for the committed policy identity and generation returned by that writer path.

#### Scenario: writer materialization succeeds
- **WHEN** an authorized repair command materializes a missing or stale projection through backend worker or writer relay
- **THEN** it records a materialized echo for the returned committed policy identity and generation

#### Scenario: follower reads writer echo
- **WHEN** a follower window has a materialized echo for the requested queue projection generation
- **THEN** passive snapshot and row hydration reads for that same generation may use the echo without performing follower-local projection writes

#### Scenario: projection state invalidates
- **WHEN** a Review commit, full invalidation, or queue invalidation affects a queue projection
- **THEN** the lifecycle clears the matching materialized echo and publishes invalidated identity before later reads

### Requirement: Queue projection runtime owns snapshot and row hydration reads
The system SHALL read projection snapshots and hydrate projection rows through passive Queue Projection Lifecycle reads while preserving active-source semantics and explicit unavailable errors.

#### Scenario: snapshot read succeeds
- **WHEN** a projection-backed queue snapshot is ready
- **THEN** the lifecycle returns a cloned projection snapshot with rows and counters normalized for application callers

#### Scenario: row hydration succeeds
- **WHEN** projection row ids are requested and backend rows are ready
- **THEN** the lifecycle returns hydrated cards in requested order

#### Scenario: row hydration needs repair
- **WHEN** row hydration returns a non-ready projection status
- **THEN** the lifecycle read returns `refreshing` or `unavailable` and MUST NOT initiate materialization; an authorized caller may issue a separate repair command
