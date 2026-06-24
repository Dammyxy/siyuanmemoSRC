## ADDED Requirements

### Requirement: Browser queue datasource attaches without waiting for projection readiness
Browser queue selection SHALL create and attach the queue datasource when the Browser queue identity is valid and a datasource can be created, even when Queue Projection Readiness is still refreshing.

#### Scenario: Refreshing projection still attaches datasource
- **WHEN** a user selects a projection-backed Browser queue and Queue Projection Readiness returns `refreshing`
- **THEN** Browser SHALL attach the queue datasource and rebuild the grid datasource without waiting for readiness to become `ready`

#### Scenario: Invalid queue identity remains unavailable
- **WHEN** a user selects an unsupported Browser queue identity
- **THEN** Browser SHALL report an unavailable lifecycle state and SHALL NOT attach a datasource

### Requirement: Browser readiness diagnostics do not block first rows
Browser queue lifecycle SHALL treat Queue Projection Readiness as diagnostics and background warmup state, not as a synchronous first-row gate.

#### Scenario: Background warmup reports refreshing
- **WHEN** Browser open schedules queue projection warmup and one queue reports `refreshing`
- **THEN** Browser SHALL keep the active datasource attached and record the warmup diagnostic without clearing visible rows

#### Scenario: Ready identity updates lifecycle metadata
- **WHEN** Queue Projection Readiness or a live identity event reports a newer ready projection identity for the active queue
- **THEN** Browser lifecycle SHALL record the newer projection identity for stale-read rejection and future count refresh decisions

### Requirement: Browser queue lifecycle does not repair projections from UI
Browser UI and Browser lifecycle modules MUST NOT materialize queue projections, run local queue scans as fallback, or call lower-level queue repair APIs while attaching a queue datasource.

#### Scenario: Projection is stale during queue open
- **WHEN** Queue Projection Readiness indicates `projection_stale`
- **THEN** Browser SHALL attach the queue datasource through the normal read model path and SHALL NOT call local queue fallback or projection materialization from UI code

#### Scenario: Terminal projection owner failure
- **WHEN** the declared Browser read-model service is missing or returns an unrecoverable unavailable result before datasource creation is possible
- **THEN** Browser SHALL report explicit unavailable state instead of using a local queue fallback

### Requirement: Queue count refresh is scoped to readable readiness
Browser queue count refresh SHALL stay asynchronous and SHALL only force projection-backed count refresh when the lifecycle has evidence that the selected queue projection is readable.

#### Scenario: Queue opens while readiness refreshes
- **WHEN** Browser attaches a queue datasource while readiness is `refreshing`
- **THEN** Browser SHALL use passive count refresh and SHALL NOT force a projection-backed count refresh for that queue until a ready identity is observed

#### Scenario: Queue opens with ready identity
- **WHEN** Browser attaches a queue datasource and readiness has a ready projection identity
- **THEN** Browser MAY request a scoped queue count refresh for the ready queue
