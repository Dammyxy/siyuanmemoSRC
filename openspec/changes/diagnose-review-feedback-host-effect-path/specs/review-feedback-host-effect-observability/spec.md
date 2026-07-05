## ADDED Requirements

### Requirement: Slow Review feedback logs identify host effect paths
The system SHALL include concrete host-effect file identity in copyable slow Review feedback diagnostics when host SQLite effects dominate grading latency.

#### Scenario: Slowest host effect path appears in summary
- **WHEN** `review.feedback` emits a slow worker-handle summary and the timing payload includes a slowest host effect with `kind`, `durationMs`, `path`, and `storageClass`
- **THEN** the copyable summary SHALL include the host effect kind, duration, path, and storage class without requiring the operator to expand a nested console object

#### Scenario: Missing path remains explicit
- **WHEN** `review.feedback` emits a slow worker-handle summary but the slowest host effect has no path
- **THEN** the copyable summary SHALL make the path absence explicit rather than implying a main database, manifest, or segment path

### Requirement: Diagnostic logging stays behavior-neutral
The system SHALL NOT change Review feedback persistence, scheduling, queue membership, sync safety, or SQLite cache invalidation as part of host-effect observability.

#### Scenario: Review feedback result shape remains unchanged
- **WHEN** a card rating completes successfully
- **THEN** the Review feedback result and session advancement behavior remain unchanged except for additional slow diagnostic fields

#### Scenario: Persistence fail-closed paths remain unchanged
- **WHEN** SQLite diagnostics, replay, repair, discard, checkpoint, or corruption detection paths run
- **THEN** they retain their existing cold-read and fail-closed behavior independent of slow-log formatting

### Requirement: Logs support next root-cause classification
The system SHALL provide enough slow Review feedback evidence to classify the dominant host cost as delta manifest, open segment, sealed segment, main database, diagnostics, or another SQLite-backed file.

#### Scenario: Operator can classify a slow SQLite read
- **WHEN** an operator copies a slow `review.feedback` console line after this change
- **THEN** the line includes enough host-effect path information to decide which storage path needs the next fix or which path remains unknown
