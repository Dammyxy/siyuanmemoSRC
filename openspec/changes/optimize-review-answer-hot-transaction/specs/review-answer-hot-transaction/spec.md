## ADDED Requirements

### Requirement: Review answer transaction avoids global work
The system SHALL commit worker-backed Review answers without performing work proportional to the full card store or full accumulated SQLite delta history.

#### Scenario: Review answer uses O(1) mutation stamp
- **WHEN** a worker-backed `review.session.feedback` answer commits with `commitPolicy='write-schedule'`
- **THEN** the transaction SHALL update Review mutation metadata without loading the full unified store or recalculating a full store content hash

#### Scenario: Review answer keeps one durable transaction
- **WHEN** a worker-backed Review answer writes card schedule, Review Ledger, domain sync evidence, mutation stamp, and answer undo evidence
- **THEN** those writes SHALL remain inside one durable `review.feedback` SQL/delta transaction

#### Scenario: Review answer Interface stays deep
- **WHEN** callers submit `review.feedback` or `review.session.feedback`
- **THEN** callers SHALL NOT orchestrate mutation stamp, undo evidence, delta accounting, or SQLite append substeps themselves

### Requirement: Review answer hot path remains observable
The system SHALL keep slow Review answer diagnostics able to prove that global work stayed out of the hot path.

#### Scenario: Full-work regression is visible in tests
- **WHEN** Review answer transaction tests run
- **THEN** they SHALL fail if the hot path uses full-store load/hash metadata work or full-snapshot pending-byte estimation
