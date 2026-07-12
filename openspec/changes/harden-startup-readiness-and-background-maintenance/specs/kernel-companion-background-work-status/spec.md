## MODIFIED Requirements

### Requirement: Background work status read model
The system SHALL provide a read-only Kernel Companion Background Work status Module that reports normalized status for registry-managed maintenance jobs, including deduplicated post-ready startup maintenance and any registered child work.

#### Scenario: Status reports all current job kinds
- **WHEN** Review truth backfill, post-ready startup maintenance, Xiuyuan startup sync, or kernel transaction action polling jobs exist in the registry
- **THEN** the status read model SHALL return each job with kind, job id, state, reason, submitted time, updated time, attempt count, terminal time when available, stable dedupe evidence, and safe diagnostics

#### Scenario: Status can filter by job kind
- **WHEN** a caller requests status for one supported background-work kind
- **THEN** the status read model SHALL return only matching jobs
- **AND** it SHALL NOT mutate registry lifecycle state

#### Scenario: Status reports terminal failure
- **WHEN** a background-work job fails
- **THEN** the status read model SHALL expose failed state, reason or last error, attempt count, failed phase, and safe work-kind diagnostics

#### Scenario: Duplicate submission is coalesced
- **WHEN** the registry coalesces a startup maintenance submission with an equivalent accepted or running job
- **THEN** status SHALL expose the single lifecycle identity and safe dedupe/coalescing evidence
- **AND** it SHALL not show a second executing job

#### Scenario: Parent job waits for registered child work
- **WHEN** startup maintenance delegates an owned phase to another registry-managed job
- **THEN** status SHALL expose the child reference and an explicit parent waiting/deferred state
- **AND** it SHALL not report parent completion solely because the child was submitted

## ADDED Requirements

### Requirement: Startup maintenance status uses phase-accurate safe counters
The normalized status surface SHALL identify the actual startup maintenance work and SHALL report only counters and reasons owned by that lifecycle.

#### Scenario: Review truth maintenance is running
- **WHEN** a job owns Review truth promotion, backfill, or flush continuation
- **THEN** status SHALL identify that work kind or phase and MAY report safe pending/promoted/skipped/failed counts
- **AND** it SHALL not describe unrelated schedule, orphan, projection, or storage maintenance as completed

#### Scenario: Shutdown settles startup work
- **WHEN** plugin unload or registry shutdown cancels or defers a startup maintenance job
- **THEN** status SHALL expose the terminal or deferred shutdown reason
- **AND** no later unregistered timer result SHALL overwrite that state
