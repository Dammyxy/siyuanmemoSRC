## ADDED Requirements

### Requirement: Active Review pressure defers non-current Browser repair
The system SHALL prevent non-current Browser projection warmup and repair from competing with active Review feedback.

#### Scenario: Deferred warmup checks Review pressure again
- **WHEN** Browser schedules deferred warmup for a non-current queue while Review is active
- **AND** the deferred timer fires while Review is still active
- **THEN** the system SHALL NOT run readiness repair for that non-current queue
- **AND** SHALL keep or re-arm the deferred warmup until Review pressure clears

#### Scenario: Current queue remains eligible
- **WHEN** Browser warmup targets the queue visible in Browser or matching the active Review queue
- **THEN** the system MAY run readiness checks immediately
- **AND** SHALL continue to report explicit readiness status.

### Requirement: Review feedback storage envelope avoids heavyweight SQLite diagnostics
The system SHALL avoid full host-backed SQLite diagnostics reads in ordinary formal Review feedback responses.

#### Scenario: Ordinary Review feedback returns hot-path storage state
- **WHEN** a formal `review.feedback` commit has written journal evidence and the hot-path SQL persistence result is known
- **THEN** the response storage envelope SHALL be built from hot-path evidence
- **AND** SHALL NOT require full SQLite delta manifest reads before returning.

#### Scenario: Explicit diagnostics remain full fidelity
- **WHEN** a diagnostics or repair API requests SQLite delta diagnostics
- **THEN** the system MAY read the persisted SQLite delta manifest and legacy metadata
- **AND** SHALL keep those reads outside ordinary per-answer feedback latency.
