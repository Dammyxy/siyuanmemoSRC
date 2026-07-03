## ADDED Requirements

### Requirement: Review feedback storage envelope owns storage-state assembly
The system SHALL provide an internal Review Feedback Storage Envelope module that owns `BackendReviewFeedbackStorageState` assembly for Review feedback results.

#### Scenario: Worker delegates envelope assembly
- **WHEN** the backend worker finishes a Review feedback attempt
- **THEN** it SHALL delegate local-intent, truth-flush, SQL projection, and SQL checkpoint storage-state assembly to the Review Feedback Storage Envelope module
- **AND** the broad worker DB module SHALL NOT contain the storage envelope status-mapping logic inline

#### Scenario: Envelope preserves mutation ownership
- **WHEN** Review feedback is committed, previewed, duplicated, or rejected
- **THEN** the envelope module SHALL only read supplied diagnostics and result metadata
- **AND** it SHALL NOT append journal entries, create truth candidates, write SQL projection rows, persist SQLite, flush MessagePack truth, or mutate queue state

### Requirement: Review feedback envelope remains fail-closed and contract-compatible
The Review Feedback Storage Envelope module SHALL preserve the existing `BackendReviewFeedbackStorageState` shape and fail-closed diagnostics.

#### Scenario: SQLite delta diagnostics are unavailable
- **WHEN** SQLite delta diagnostics cannot be read while building a Review feedback storage envelope
- **THEN** the envelope SHALL report SQL checkpoint status as `unknown` with the diagnostic error
- **AND** it SHALL NOT convert that diagnostic failure into committed success or fallback storage

#### Scenario: Journal diagnostics indicate pending truth flush
- **WHEN** journal diagnostics report pending Review feedback entries
- **THEN** the envelope SHALL report Review truth flush status as `pending` with pending count and oldest pending age

#### Scenario: Queue impact reports projection outcome
- **WHEN** Review feedback result includes queue impact
- **THEN** the envelope SHALL map hot-patchable, refresh-required, unavailable, and deferred outcomes to the existing SQL projection statuses

### Requirement: Review feedback storage envelope is directly testable
The Review Feedback Storage Envelope module SHALL expose enough dependency seams for focused tests to verify envelope assembly without constructing Review scheduler, queue, SQL mutation, or worker startup behavior.

#### Scenario: Focused test builds committed envelope
- **WHEN** a test supplies committed Review feedback result, journal diagnostics, and SQLite delta diagnostics
- **THEN** it SHALL verify local intent, truth flush, SQL projection, and checkpoint fields through the module interface

#### Scenario: Focused test builds diagnostic failure envelope
- **WHEN** a test supplies a SQLite delta diagnostics reader that throws
- **THEN** it SHALL verify explicit `unknown` checkpoint state and diagnostic error through the module interface
