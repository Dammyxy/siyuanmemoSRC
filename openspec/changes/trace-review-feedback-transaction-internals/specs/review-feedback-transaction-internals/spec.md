## ADDED Requirements

### Requirement: Review feedback transaction internals are attributable
The system SHALL expose narrow timing evidence for a worker-backed Review answer transaction when that transaction participates in backend worker timing.

#### Scenario: Scheduler and SQL phases are visible
- **WHEN** a Review answer is committed through worker `review.feedback`
- **THEN** timing evidence SHALL include distinct spans for card read, idempotency check, scheduler compute, scheduler commit, Review Ledger write, domain sync write, queue impact build, manual queue cleanup, undo journal write, and sync metadata touch

#### Scenario: Timing evidence stays behind the Review answer Module
- **WHEN** callers submit `review.feedback` or `review.session.feedback`
- **THEN** callers SHALL continue using one Review answer Interface and SHALL NOT orchestrate scheduler, SQL, undo journal, or delta substeps themselves

#### Scenario: Normal logs stay quiet
- **WHEN** Review feedback is fast enough not to trigger existing slow-summary reporting
- **THEN** the system SHALL NOT emit additional normal-path console logs solely for transaction-internal timing spans
