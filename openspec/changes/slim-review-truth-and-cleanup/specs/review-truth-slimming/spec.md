## ADDED Requirements

### Requirement: Review truth publication stores skinny facts
The system SHALL publish new `review-events` truth as Review fact records for Review truth outputs and SHALL NOT publish generic storage records that copy SQL mutation operations.

#### Scenario: Review output uses Review fact encoding
- **WHEN** truth promotion publishes a mutation whose `requiredTruthOutputs` include `family="review"` with `kind="event"` or `kind="metadata"`
- **THEN** the appended `review-events` records SHALL use supported Review truth record types and SHALL remain replayable by Review truth reconstruction without requiring embedded SQL operation arrays

#### Scenario: Review output does not copy SQL operations
- **WHEN** truth promotion publishes Review output for a mutation envelope that includes SQL `operations`
- **THEN** the new `review-events` truth records SHALL NOT include an `operations` field and SHALL NOT include a full `affectedAggregates` field copied from the mutation envelope

### Requirement: Review truth publication rejects bloated records
The system SHALL reject new `review-events` records that would reintroduce operation-bearing or oversized Review truth payloads before any segment or manifest is written.

#### Scenario: Operation-bearing Review record is rejected
- **WHEN** a new `review-events` publication candidate contains an `operations` field
- **THEN** publication SHALL fail before appending a truth segment and SHALL report the mutation id and Review truth bloat reason

#### Scenario: Oversized Review record is rejected
- **WHEN** a new `review-events` publication candidate exceeds the configured Review truth byte budget
- **THEN** publication SHALL fail before appending a truth segment and SHALL report the mutation id, record type, and encoded byte size

### Requirement: Legacy Review operation evidence remains replayable
The system SHALL keep existing operation-bearing `storage.review.*` truth records replayable through an explicit legacy adapter while preventing new publication from producing those records.

#### Scenario: Legacy operation evidence reconstructs Review events
- **WHEN** canonical truth reconstruction reads an existing `review-events` record whose type starts with `storage.review.` and whose payload contains SQL `operations`
- **THEN** reconstruction SHALL apply the operations through the legacy Review operation evidence adapter and include equivalent Review event rows in the reconstructed state

#### Scenario: New publication does not produce legacy storage records
- **WHEN** truth promotion publishes new Review output after this change
- **THEN** no appended `review-events` record SHALL have a type starting with `storage.review.`

### Requirement: Review truth cleanup rewrites bloated records through verified generation
The system SHALL provide Review truth cleanup that rewrites existing bloated `review-events` evidence into skinny Review fact records through a verified generation fence.

#### Scenario: Cleanup publishes verified skinny generation
- **WHEN** existing `review-events` storage is over budget because of operation-bearing records
- **THEN** cleanup SHALL replay old Review evidence, produce skinny Review fact records, verify equivalent Review projection rows, publish a new fenced `review-events` generation, and retain the previous generation until verification succeeds

#### Scenario: Cleanup failure leaves current generation unchanged
- **WHEN** Review truth cleanup cannot replay, normalize, verify, or publish the skinny generation
- **THEN** cleanup SHALL leave the current generation fence unchanged and SHALL report the failure without deleting existing Review truth evidence

### Requirement: Review rating leaves old hard pressure after cleanup
The system SHALL refresh storage inventory after successful Review truth cleanup so old `review-events` bloat no longer forces synchronous exact inventory during ordinary Review feedback.

#### Scenario: Ordinary Review feedback avoids old-bloat exact inventory
- **WHEN** Review truth cleanup has completed successfully and inventory is refreshed below hard pressure for `review-events`
- **THEN** ordinary `review.session.feedback` SHALL NOT synchronously collect exact storage inventory solely because of pre-cleanup Review truth bloat

#### Scenario: No blanket hard-pressure bypass
- **WHEN** `review-events` remains under genuine hard pressure after cleanup or due to new growth
- **THEN** the system SHALL continue applying storage-pressure admission policy and SHALL NOT grant a blanket bypass to Review feedback
