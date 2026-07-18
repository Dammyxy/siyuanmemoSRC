## ADDED Requirements

### Requirement: Review blocks storage recovery writes before session admission
The system SHALL NOT admit a feedback-capable Review session when backend startup readiness disables formal writes because storage recovery is required.

#### Scenario: Recovery-required startup blocks Review entry
- **WHEN** a Review entrypoint requests admission and the backend reports startup writes are not capable
- **THEN** the application rejects Review admission with a recovery-required error before creating a Review session

#### Scenario: Rating is not attempted during recovery-required startup
- **WHEN** startup storage recovery disables formal writes
- **THEN** Review feedback code MUST NOT call the backend `review.feedback` mutation as part of a user-visible Review session

### Requirement: Recovery inspection remains separate from Review
The system SHALL keep storage recovery inspection reads separate from feedback-capable Review behavior.

#### Scenario: Browser can inspect recovery queue state
- **WHEN** Browser queue reads have a trusted local recovery queue cache while backend writes are disabled
- **THEN** Browser may return read-only recovery rows or counts with metadata identifying the recovery read path

#### Scenario: Recovery inspection is not Review admission
- **WHEN** Browser returns read-only recovery rows or counts
- **THEN** that result MUST NOT be treated as a valid Review admission ticket

### Requirement: Worker storage write protection remains authoritative
The system SHALL keep worker-side formal write gates active while startup storage recovery is required.

#### Scenario: Direct write still fails closed
- **WHEN** a backend mutation reaches the worker while startup storage recovery is required
- **THEN** the worker rejects the mutation with storage recovery required rather than accepting or replaying it
