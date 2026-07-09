## ADDED Requirements

### Requirement: Background work registry lifecycle
The system SHALL provide a Kernel Companion Background Work Registry Module with a single lifecycle Interface for long maintenance jobs: submit, status, cancel, defer, and shutdown.

#### Scenario: Submit starts accepted work
- **WHEN** a caller submits supported background work before shutdown
- **THEN** the registry records a job with kind, job id, accepted state, submitted time, updated time, and diagnostics

#### Scenario: Shutdown blocks new work
- **WHEN** registry shutdown has started
- **THEN** new submit requests fail closed with explicit unavailable diagnostics and do not start background work

#### Scenario: Cancel prevents retry work
- **WHEN** a pending or running job is canceled
- **THEN** the registry marks it canceled and MUST NOT schedule follow-up retries for that job

#### Scenario: Defer preserves diagnostics without running
- **WHEN** a job is deferred
- **THEN** the registry records deferred state, reason, and diagnostics without executing heavy work during shutdown

### Requirement: Review truth backfill registry job
The system SHALL route startup Review truth SQL backfill through the Kernel Companion Background Work Registry while keeping unload Review truth quick flush separate.

#### Scenario: Startup pending rows submit backfill job
- **WHEN** Review truth maintenance status reports pending SQL rows
- **THEN** SrsBackendClient submits a `review-truth-backfill` background job instead of running backfill from the unload quick-flush path

#### Scenario: Before unload does not run backfill job
- **WHEN** before-unload Review truth flush runs while a backfill job is pending or deferred
- **THEN** only `review.truth.flush` may run and `review.truth.backfill` MUST NOT start because of unload

#### Scenario: Backfill job uses existing backend owner
- **WHEN** a Review truth backfill job executes
- **THEN** it calls the existing backend Review truth backfill owner and MUST NOT write scheduler state, Riff/card state, msgpack truth, or SQLite data from `kernel.js`

### Requirement: Background work diagnostics
The system SHALL expose explicit background-work status diagnostics for Review truth backfill jobs.

#### Scenario: Status reports terminal result
- **WHEN** a Review truth backfill job completes, fails, defers, or is canceled
- **THEN** status reports terminal state, updated time, attempt count, last error if any, and Review truth backfill counters when available

#### Scenario: In-flight pressure stays explicit
- **WHEN** backend unavailability or host-effect timeout prevents Review truth backfill
- **THEN** the job records failed or deferred diagnostics and MUST NOT hide the failure behind local fallback behavior
