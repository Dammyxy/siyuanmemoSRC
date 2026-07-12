## ADDED Requirements

### Requirement: Backend database loading has no lifecycle side effects
`SrsBackendClient.loadDatabase()` and `reloadDatabase()` SHALL perform their backend RPC contract without submitting, scheduling, retrying, or completing startup background maintenance.

#### Scenario: ApplicationContext loads the database more than once
- **WHEN** composition performs an initial backend load and a later unified load or reload
- **THEN** each client call SHALL only return its load/reload result
- **AND** no maintenance job or timer SHALL be created as a side effect of those calls

#### Scenario: Backend runtime factory creates the client
- **WHEN** the backend runtime bundle constructs and initially loads `SrsBackendClient`
- **THEN** the factory SHALL NOT directly schedule Review truth flush or deferred startup maintenance

### Requirement: One composition owner submits maintenance after readiness
The system SHALL have exactly one composition-root-owned maintenance coordinator. It SHALL receive initial descriptors only after the selected startup mode reaches its explicit ready boundary and SHALL also accept descriptors explicitly returned by later post-ready reload orchestration.

#### Scenario: Plugin reaches normal readiness
- **WHEN** storage/identity gates pass, the projection is readable, settings and required runtime access modules are ready, and required startup handlers are registered
- **THEN** the composition root SHALL transition to ready once
- **AND** the startup maintenance coordinator SHALL submit the returned deferred descriptors once after that transition

#### Scenario: Startup fails before readiness
- **WHEN** a required startup dependency fails before the ready transition
- **THEN** the coordinator SHALL NOT submit deferred startup maintenance

#### Scenario: Startup enters read-only recovery
- **WHEN** startup reaches an explicit read-only recovery mode
- **THEN** the coordinator SHALL submit no normal mutation maintenance
- **AND** only read-only evidence/status/diagnostic or dedicated recovery operations MAY run under their explicit contracts

#### Scenario: Post-ready reload returns deferred descriptors
- **WHEN** an explicit post-ready reload caller receives deferred descriptors from the pure `reloadDatabase()` RPC
- **THEN** that caller SHALL hand the descriptors to the same composition-owned coordinator
- **AND** registry/frontier deduplication SHALL decide whether new work is required

### Requirement: Startup maintenance has stable registry-level deduplication
Every deferred startup maintenance submission SHALL carry a job-lifecycle dedupe identity based on work kind, ephemeral runtime instance, stable installation scope, identity epoch when relevant, and the maintenance frontier or phase input. The ephemeral runtime instance SHALL NOT be persisted as receipt matching scope.

#### Scenario: Equivalent work is already active
- **WHEN** an equivalent job is already accepted or running for the same dedupe identity
- **THEN** the registry SHALL coalesce the submission with the existing job
- **AND** it SHALL return or reference the existing lifecycle identity rather than execute duplicate work

#### Scenario: Completed work is submitted with unchanged frontier
- **WHEN** an equivalent job completed successfully and its maintenance frontier is unchanged
- **THEN** the registry SHALL preserve the completed/skipped result without executing the work again

#### Scenario: Maintenance frontier changes
- **WHEN** the relevant frontier or identity epoch changes after terminal completion
- **THEN** a new submission SHALL receive a distinct dedupe identity and MAY execute

#### Scenario: Failed job is retried
- **WHEN** a caller requests retry for a terminal failed job
- **THEN** the registry SHALL apply an explicit retry policy and increment attempt evidence
- **AND** it SHALL NOT create concurrent duplicate execution for the same dedupe identity

### Requirement: Job kinds and terminal states describe owned work accurately
Startup maintenance status SHALL use accurate work kinds and phases, and a job SHALL NOT report terminal success merely because it scheduled a timer, submitted an untracked child, or accepted work that has not reached an owned terminal state.

#### Scenario: Job owns only Review truth maintenance
- **WHEN** a startup job performs only Review truth promotion/backfill/flush work
- **THEN** its kind or named phase SHALL identify Review truth maintenance rather than claiming generic storage maintenance

#### Scenario: Parent job delegates to a registered child
- **WHEN** a parent startup job delegates a phase to another registry-managed job
- **THEN** status SHALL expose the child reference and the parent's explicit waiting/deferred state
- **AND** parent completion SHALL reflect the defined child terminal contract

#### Scenario: Batched flush uses a timer
- **WHEN** batching requires a delayed trigger
- **THEN** the trigger SHALL remain owned, observable, and cancelable by the background-work lifecycle
- **AND** no detached timer SHALL make a completed job spawn later work

#### Scenario: Deferred work fails
- **WHEN** an owned startup maintenance phase fails
- **THEN** status SHALL report failed state, attempt count, safe reason, phase, and terminal time
- **AND** it SHALL not convert the failure into a successful scheduling result

### Requirement: Shutdown prevents follow-up work
Plugin unload or background registry shutdown SHALL atomically stop new startup-maintenance follow-up submissions and SHALL settle queued/running lifecycle state explicitly.

#### Scenario: Unload occurs before a queued job starts
- **WHEN** plugin unload begins while startup maintenance is queued
- **THEN** the job SHALL become canceled, deferred, or shutdown-terminal according to registry policy
- **AND** it SHALL not start after shutdown

#### Scenario: Unload races with running work
- **WHEN** unload begins while a maintenance phase is running
- **THEN** the phase SHALL observe cancellation/shutdown at its supported boundary
- **AND** it SHALL not schedule another timer, retry, or child job after shutdown starts

#### Scenario: Plugin runtime starts again
- **WHEN** a later plugin runtime starts after the previous registry shut down
- **THEN** it SHALL use a new runtime scope while durable frontier/receipt evidence determines whether work is still required

### Requirement: Writer and follower modes preserve one mutation owner
Deferred startup maintenance SHALL preserve existing writer election and relay authority in both writer and follower modes.

#### Scenario: Writer runtime submits maintenance
- **WHEN** the active runtime owns Worker write authority
- **THEN** mutation work SHALL execute through Worker-owned SQLite/truth dependencies and existing identity checks

#### Scenario: Follower runtime observes pending maintenance
- **WHEN** a follower runtime reaches readiness while equivalent writer-owned maintenance exists
- **THEN** it SHALL observe or relay through the existing authority seam
- **AND** it SHALL NOT create a second SQLite/truth writer or duplicate job
