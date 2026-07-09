## ADDED Requirements

### Requirement: Background work status read model
The system SHALL provide a read-only Kernel Companion Background Work status Module that reports normalized status for registry-managed maintenance jobs.

#### Scenario: Status reports all current job kinds
- **WHEN** Review truth backfill, Xiuyuan startup sync, or kernel transaction action polling jobs exist in the registry
- **THEN** the status read model SHALL return each job with kind, job id, state, reason, submitted time, updated time, attempt count, terminal time when available, and safe diagnostics

#### Scenario: Status can filter by job kind
- **WHEN** a caller requests status for one supported background-work kind
- **THEN** the status read model SHALL return only matching jobs
- **AND** it SHALL NOT mutate registry lifecycle state

#### Scenario: Status reports terminal failure
- **WHEN** a background-work job fails
- **THEN** the status read model SHALL expose failed state, reason or last error, attempt count, and safe work-kind diagnostics

### Requirement: Background work status is read-only and content-safe
Background-work status SHALL NOT expose private content payloads or mutate background work lifecycle.

#### Scenario: Diagnostics contain source content
- **WHEN** raw job diagnostics contain unknown fields
- **THEN** the status read model SHALL preserve only safe scalar diagnostic evidence or redact unsupported content-bearing values
- **AND** it SHALL NOT expose card content, block content, SQL payloads, or host-effect request bodies

#### Scenario: Caller reads status during running work
- **WHEN** a caller reads status while a job is accepted or running
- **THEN** the read SHALL NOT cancel, defer, retry, submit, or shutdown any job

### Requirement: Optional backend/client status access remains narrow
If background-work status is exposed across the backend/client seam, it SHALL use a narrow read-only status Interface for Kernel Companion Background Work only.

#### Scenario: Client requests background-work status
- **WHEN** the backend/client runtime exposes background-work status
- **THEN** the client Interface SHALL return the normalized read model
- **AND** it SHALL NOT expose generic registry mutation methods
- **AND** it SHALL fail closed with explicit unavailable diagnostics when the registry is unavailable

