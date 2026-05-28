## ADDED Requirements

### Requirement: Browser hierarchy uses count-only document reads
The system SHALL populate Browser document hierarchy counts from a count-only Browser Read Model path instead of requiring full Browser row hydration for every matched card.

#### Scenario: Global hierarchy avoids full-row hydration
- **WHEN** Browser opens the global card view with no active document selected
- **THEN** the document hierarchy SHALL request document/root counts from the application read model and SHALL NOT call row-by-ID hydration for all matched cards solely to count documents

#### Scenario: Filtered hierarchy uses same Browser scope
- **WHEN** Browser hierarchy is shown under a preset, search text, card type, queue, active document, or scope-doc filter
- **THEN** the count-only hierarchy request SHALL apply the same Browser scope normalization as the grid read model for that view

#### Scenario: Document titles are resolved separately
- **WHEN** hierarchy document counts include root IDs whose titles are not cached
- **THEN** the system SHALL resolve titles through a bounded title lookup without hydrating full Browser card rows

### Requirement: Browser first rows are independent from hierarchy counts
The system SHALL keep Browser first visible grid rows independent from document hierarchy count refresh and projection warmup background work.

#### Scenario: First grid rows render before hierarchy completes
- **WHEN** Browser grid read model returns the first page before hierarchy counts finish
- **THEN** Browser SHALL render first visible rows and keep hierarchy in a loading or partial state rather than blocking first-row display

#### Scenario: Hierarchy count failure is localized
- **WHEN** document hierarchy count refresh fails with an unavailable or unsupported diagnostic
- **THEN** Browser SHALL keep the grid datasource and visible rows intact and surface hierarchy count unavailability without clearing the grid

### Requirement: Projection-backed queue readiness is prewarmed
The system SHALL prewarm Queue Projection Readiness for projection-backed Browser queue views in the background after Browser open and after relevant projection invalidation events.

#### Scenario: Browser open schedules bounded projection warmup
- **WHEN** Browser opens with projection-backed queues available
- **THEN** the Browser Queue View Lifecycle SHALL schedule bounded background readiness checks for visible projection-backed queue entries without blocking grid first rows

#### Scenario: Active queue is warmed first
- **WHEN** Browser opens or receives a live identity event while a projection-backed queue is active
- **THEN** the active queue readiness check SHALL be prioritized before inactive queue prewarm checks

#### Scenario: Warmup does not attach stale datasource
- **WHEN** projection warmup reports refreshing, unavailable, or writer/backend unavailable
- **THEN** Browser SHALL record the diagnostic and SHALL NOT attach a local queue datasource or stale projection rows as a substitute

### Requirement: Queue selection consumes readiness without hidden fallback
The system SHALL treat queue selection as a consumer of Queue Projection Readiness and SHALL fail closed when the declared projection owner is preparing or unavailable.

#### Scenario: Queue selection sees warming projection
- **WHEN** a user selects a projection-backed queue whose projection warmup is still refreshing
- **THEN** Browser SHALL show an explicit refreshing state and retry according to readiness metadata rather than building rows from local `queue.getCards()`

#### Scenario: Queue selection sees ready warmed projection
- **WHEN** a user selects a projection-backed queue whose prewarm produced a ready identity
- **THEN** Browser SHALL attach the queue datasource using that projection identity or a fresh readiness confirmation and hydrate only requested page rows

### Requirement: Full-row snapshots are explicit Browser workflows
The system SHALL only hydrate all matched Browser rows for explicit workflows that require full row data and cannot be served by count-only reads, matched IDs, or action-target lookup.

#### Scenario: Default hierarchy does not schedule all-row snapshot
- **WHEN** Browser opens the global view and document hierarchy is visible
- **THEN** Browser SHALL NOT schedule the delayed all-rows snapshot merely to populate document counts

#### Scenario: Explicit all-row workflow may hydrate all rows
- **WHEN** a user triggers a workflow that explicitly requires all full Browser rows
- **THEN** Browser MAY run the all-row snapshot path and SHALL identify the triggering workflow in diagnostics
