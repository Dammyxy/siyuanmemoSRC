## ADDED Requirements

### Requirement: Startup profile reports slow critical-path spans
The system SHALL report a sanitized startup profile when plugin startup exceeds the configured slow-start threshold.

#### Scenario: Slow startup emits top spans
- **WHEN** startup duration exceeds the slow-start threshold
- **THEN** the system SHALL report the slowest startup spans with operation name, duration, success state, and safe scalar diagnostics
- **AND** it SHALL NOT expose card content, block content, SQL payloads, prompt text, or host request bodies

#### Scenario: Fast startup stays quiet
- **WHEN** startup duration does not exceed the slow-start threshold
- **THEN** the system SHALL NOT emit slow-start profile output

### Requirement: Startup storage maintenance uses completed receipts
The system SHALL skip full startup storage maintenance scans when completed maintenance receipts or dirty signals prove the relevant store state has not changed.

#### Scenario: Schedule maintenance already complete
- **WHEN** startup schedule normalization has a completed receipt for the current store identity
- **THEN** startup SHALL return a skipped/completed schedule maintenance diagnostic without scanning every card

#### Scenario: Maintenance evidence missing
- **WHEN** startup maintenance receipt or dirty-signal evidence is missing, invalid, or ambiguous
- **THEN** startup SHALL run the existing bounded maintenance scan and update receipts after successful completion

### Requirement: Startup readiness excludes deferred-safe maintenance
The system SHALL make plugin startup ready after storage safety gates pass and the readable projection is initialized, without waiting for maintenance work that is explicitly safe to defer.

#### Scenario: Projection ready with deferred maintenance
- **WHEN** the backend Worker has validated storage evidence and initialized a readable projection
- **THEN** plugin startup SHALL be allowed to continue while deferred-safe maintenance runs as background work

#### Scenario: Recovery-required storage blocks startup
- **WHEN** startup detects recovery-required or untrusted storage evidence
- **THEN** startup SHALL fail closed or enter the existing read-only recovery state before reporting normal readiness

### Requirement: Deferred startup work is visible through background status
The system SHALL route deferred startup maintenance through a visible lifecycle/status Module.

#### Scenario: Deferred job fails
- **WHEN** deferred startup maintenance fails after plugin readiness
- **THEN** the background-work status read model SHALL expose failed state, reason, attempt count, and safe diagnostics

#### Scenario: Plugin unload during deferred startup work
- **WHEN** plugin dispose or unload begins while deferred startup work is queued or running
- **THEN** the background-work lifecycle SHALL cancel, defer, or shutdown the work explicitly without spawning hidden follow-up jobs
