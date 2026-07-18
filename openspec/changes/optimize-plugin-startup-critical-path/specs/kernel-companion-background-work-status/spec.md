## ADDED Requirements

### Requirement: Startup maintenance background jobs are reported
The Kernel Companion Background Work status read model SHALL include deferred startup maintenance jobs that run after plugin readiness.

#### Scenario: Deferred startup maintenance is accepted
- **WHEN** startup submits deferred maintenance after plugin readiness
- **THEN** background-work status SHALL list the job with kind, job id, state, reason, submitted time, updated time, attempt count, and safe diagnostics

#### Scenario: Deferred startup maintenance completes
- **WHEN** a deferred startup maintenance job completes
- **THEN** background-work status SHALL report terminal completion and safe counters for skipped, repaired, promoted, or reconciled work

### Requirement: Startup maintenance status remains content-safe
Deferred startup maintenance status SHALL NOT expose private note content, card body payloads, SQL row payloads, or host-effect request bodies.

#### Scenario: Startup job diagnostics include content-bearing values
- **WHEN** raw startup maintenance diagnostics include content-bearing or unknown object values
- **THEN** the status read model SHALL redact or omit those values while preserving safe scalar evidence such as counts, duration, and reason
