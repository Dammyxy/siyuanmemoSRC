## ADDED Requirements

### Requirement: Review activity is lifecycle-owned and observable
The system SHALL derive one observable effective Review activity snapshot from registered dialog and tab surface lifecycles instead of polling mutable manager getters.

#### Scenario: Dialog surface takes priority
- **WHEN** a Review dialog and one or more Review tabs are registered
- **THEN** the activity snapshot SHALL identify the Review dialog queue as active
- **AND** tab activity SHALL remain registered for selection after the dialog closes

#### Scenario: Most recently active tab is selected
- **WHEN** no Review dialog is active and multiple Review tabs are registered
- **THEN** the activity snapshot SHALL identify the queue of the most recently activated tab

#### Scenario: Surface lifecycle updates subscribers
- **WHEN** a Review surface opens, becomes effective, changes queue priority, or closes
- **THEN** subscribers SHALL receive the updated activity snapshot without polling
- **AND** repeated activity that does not change the effective snapshot SHALL NOT emit duplicate transition diagnostics

### Requirement: Browser projection work is admitted by Review activity
The system SHALL admit Browser projection background work according to the effective Review activity while preserving visible Browser and active Review queue readiness.

#### Scenario: Active and visible queue work remains eligible
- **WHEN** Review is active and Browser projection warmup includes the active Review queue or currently visible Browser queue
- **THEN** work for those queues SHALL remain eligible to run
- **AND** unrelated Browser projection work SHALL NOT compete immediately

#### Scenario: Non-active queue work waits without polling
- **WHEN** Review is active and Browser schedules work for a non-active, non-visible queue
- **THEN** the system SHALL retain the work as pending intent under a stable key
- **AND** SHALL NOT repeatedly reschedule it on a Review-period timer

#### Scenario: Queue transition releases newly eligible work
- **WHEN** the effective active Review queue changes to the queue of pending work
- **THEN** the system SHALL release that work once

#### Scenario: Idle transition releases background work
- **WHEN** the final Review surface closes
- **THEN** the system SHALL release all eligible pending Browser projection work once

### Requirement: Deferred Browser work is coalesced by stable key
The system SHALL keep at most one pending Browser projection work item for each stable work key.

#### Scenario: Repeated warmup intent is coalesced
- **WHEN** the same queue warmup key is scheduled repeatedly while it is ineligible
- **THEN** the system SHALL retain one pending warmup item
- **AND** SHALL execute it at most once when it becomes eligible

#### Scenario: Queue-count catch-up is coalesced
- **WHEN** repeated count requests include non-active queues during Review
- **THEN** the active Review queue count work SHALL remain immediately scoped
- **AND** the system SHALL retain one idle-only full count refresh for later release

#### Scenario: Disposed work does not run
- **WHEN** the Browser runtime or coordinator is disposed before pending work becomes eligible
- **THEN** its pending work SHALL be removed
- **AND** SHALL NOT execute after disposal

### Requirement: Projection readiness diagnostics describe state transitions
The system SHALL emit INFO diagnostics for semantic queue projection non-ready state transitions rather than for every repeated read.

#### Scenario: Repeated non-ready snapshot logs once
- **WHEN** the same queue returns the same semantic non-ready signature across repeated snapshot reads
- **THEN** the system SHALL emit one INFO non-ready diagnostic for that state

#### Scenario: Changed non-ready state logs again
- **WHEN** a queue's non-ready status, reason, projection identity validity, counters, cache state, or freshness changes
- **THEN** the system SHALL emit a new INFO diagnostic for the changed state

#### Scenario: Ready recovery resets diagnostic state
- **WHEN** a queue returns a ready snapshot after a non-ready state
- **THEN** the system SHALL clear the remembered non-ready signature
- **AND** a later regression to that non-ready state SHALL emit a new INFO diagnostic
