## ADDED Requirements

### Requirement: Consecutive Review session feedback remains available
The system SHALL accept consecutive `review.session.feedback` requests without allowing background truth publication, storage maintenance receipt writes, or storage pressure inventory to make the active Review session unavailable.

#### Scenario: User rates two cards consecutively
- **WHEN** a Review session commits feedback for one card and the user immediately rates the next card
- **THEN** the second `review.session.feedback` request completes through the same active backend session instead of failing with `REVIEW_SESSION_RUNTIME_UNAVAILABLE`

#### Scenario: Background truth publication is queued during rating
- **WHEN** Review truth publication is requested while a `review.session.feedback` request is in flight
- **THEN** truth publication waits for the protected feedback request to clear before performing host storage reads or writes

### Requirement: Review feedback hot path avoids exact storage inventory when not required
The system SHALL NOT perform exact storage pressure inventory for `review.session.feedback` when the current storage pressure admission state already proves that the mutation may proceed.

#### Scenario: Storage pressure admission is healthy
- **WHEN** storage pressure admission reports a current healthy state before a Review session feedback mutation
- **THEN** the feedback mutation proceeds without reading the full projection database, listing truth files, or reading sqlite-delta manifests for exact inventory

#### Scenario: Storage pressure admission requires recovery
- **WHEN** storage pressure admission requires recovery before a Review session feedback mutation
- **THEN** the system may run the existing storage recovery path and SHALL surface a normal persistence failure if the mutation cannot safely proceed

### Requirement: Startup maintenance apply does not force pre-request truth reconciliation
The system SHALL execute `storage.maintenance.applyBatch` as storage maintenance work without first running canonical truth reconciliation for the same request lifecycle.

#### Scenario: Startup maintenance writes its receipt
- **WHEN** startup storage maintenance applies a batch that includes receipt or accounting writes
- **THEN** the batch does not fail solely because pre-request canonical truth reconciliation encounters a previous-generation fence conflict

#### Scenario: Maintenance batch itself fails
- **WHEN** the storage maintenance batch cannot apply its intended mutations
- **THEN** the system surfaces the maintenance failure through the existing maintenance error path
