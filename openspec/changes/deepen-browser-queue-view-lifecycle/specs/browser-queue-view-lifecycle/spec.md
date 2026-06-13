## ADDED Requirements

### Requirement: Browser queue views use an application-owned lifecycle
Browser queue selection SHALL prepare and attach queue views through an application-owned Browser Queue View Lifecycle module before rows are handed to the grid.

#### Scenario: Ready queue projection attaches a datasource
- **WHEN** the user selects a queue whose Queue Projection Readiness is readable
- **THEN** the Browser Queue View Lifecycle creates or resolves a queue datasource and exposes it to the Browser grid without requiring the UI to inspect queue projection internals

#### Scenario: Preparing queue projection does not attach stale rows
- **WHEN** the selected queue projection is still preparing
- **THEN** the Browser Queue View Lifecycle reports a preparing state and does not attach stale local queue rows as a substitute

#### Scenario: Unavailable queue projection fails closed
- **WHEN** the selected queue projection owner reports unavailable or repair-required state
- **THEN** the Browser Queue View Lifecycle reports explicit unavailable or repair-required state and does not repair the projection from UI code

### Requirement: Stale Browser read results are rejected by lifecycle state
The Browser Queue View Lifecycle SHALL reject stale async queue read results using the active queue identity, projection identity, read-model metadata, and request generation.

#### Scenario: Older queue load finishes after a newer queue selection
- **WHEN** a previous queue load resolves after the user has selected another queue
- **THEN** the lifecycle discards the older result and keeps the current queue state unchanged

#### Scenario: Read-model metadata no longer matches current view
- **WHEN** a datasource reports metadata with an older query fingerprint, generation, read owner, or projection identity
- **THEN** the lifecycle rejects the metadata for current rendering and keeps newer Browser state authoritative

### Requirement: UI does not own queue projection repair or fallback
Browser UI code MUST NOT directly materialize queue projections, run projection repair, or replace unavailable projection reads with local queue scans.

#### Scenario: Projection read is unavailable
- **WHEN** the application/backend projection owner cannot produce a readable queue snapshot
- **THEN** the UI presents the lifecycle state from the application owner rather than invoking queue repair or local fallback itself

### Requirement: First-row rendering keeps asynchronous supplements separate
Queue counts, document counts, source-existence patches, and other supplements SHALL NOT block first-row rendering when the Browser Read Model can provide a readable page.

#### Scenario: Queue page is ready before counts
- **WHEN** the Browser Read Model returns a readable queue page before fresh counts arrive
- **THEN** the Browser grid can attach the page while counts continue through asynchronous lifecycle supplements
