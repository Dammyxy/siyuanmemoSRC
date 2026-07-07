## ADDED Requirements

### Requirement: Review session feedback latency is attributable
The system SHALL attribute slow `review.session.feedback` worker time to narrow Review session steps instead of reporting only a coarse `session-feedback-total`.

#### Scenario: Undo journal append is measured separately
- **WHEN** a worker-backed Review feedback request appends Review Transaction Undo Journal evidence
- **THEN** the slow worker timing summary SHALL include a distinct undo-journal append step when that append exceeds the Review session timing threshold

#### Scenario: Feedback total remains available
- **WHEN** `review.session.feedback` completes
- **THEN** the system SHALL still record total session feedback timing for comparison with narrower steps

#### Scenario: Diagnostics do not add normal log noise
- **WHEN** Review feedback steps are within the slow-summary threshold
- **THEN** the system SHALL NOT emit additional normal-path console logs solely for these timing spans

### Requirement: SQLite delta writes carry append substep metadata
The system SHALL attach SQLite delta purpose and substep metadata to open segment, sealed segment, and manifest writes used by Review feedback durable persistence.

#### Scenario: Delta writes are identified in host breakdown
- **WHEN** Review feedback writes SQLite delta open, sealed, or manifest files
- **THEN** the worker host-effect breakdown SHALL identify them with SQLite delta purpose and a specific append/write substep instead of `purpose=unknown substep=unknown`
