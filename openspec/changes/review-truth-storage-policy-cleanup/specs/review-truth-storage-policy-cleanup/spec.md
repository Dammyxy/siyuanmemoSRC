## ADDED Requirements

### Requirement: Review truth flush preserves the journal-to-truth transition
The system SHALL flush `projection-applied` Review feedback journal entries into MessagePack `review-events` truth through the Review truth flush runtime and SHALL mark journal entries `truth-flushed` only when the truth evidence is already durable or proven duplicate.

#### Scenario: Successful journal flush writes truth before advancing status
- **WHEN** `review.truth.flush` processes a `projection-applied` Review journal entry that is not already present in `review-events` truth
- **THEN** the system SHALL append a Review truth record, persist the segment/manifest result through the truth store, and only then update the journal entry to `truth-flushed` with segment path diagnostics

#### Scenario: Duplicate truth evidence is idempotent
- **WHEN** `review.truth.flush` sees a `projection-applied` journal entry whose idempotency key already exists in replayed `review-events` truth
- **THEN** the system SHALL skip appending a duplicate Review truth record and SHALL mark the journal entry `truth-flushed` with duplicate diagnostics

#### Scenario: Flush dependency failure does not advance journal state
- **WHEN** Review journal listing, truth replay, truth append, manifest persistence, or journal status update fails during `review.truth.flush`
- **THEN** the system SHALL surface the failure and SHALL NOT hide it by reading legacy storage, stale SQL projection state, local queue state, or alternate fallback paths

### Requirement: Review SQL truth backfill preserves projection-ref storage policy
The system SHALL backfill SQL `review_events` rows without MessagePack refs into MessagePack `review-events` truth and SHALL patch SQL projection refs only for rows proven written or already represented by truth evidence.

#### Scenario: Backfill writes truth and patches SQL projection refs
- **WHEN** `review.truth.backfill` processes valid SQL `review_events` rows that lack `msgpack_ref`
- **THEN** the system SHALL append bounded `review-events` truth records and patch the matching SQL rows with `msgpack_ref`, `truth_hash`, `truth_schema_version`, and `projection_generation`

#### Scenario: Invalid SQL rows require repair
- **WHEN** a pending SQL `review_events` row is missing required event id, card id, reviewed timestamp, rating, or valid payload JSON
- **THEN** the system SHALL return a repair-required result for the invalid row ids and SHALL NOT append truth records or patch SQL refs for that batch

#### Scenario: Duplicate backfill evidence remains idempotent
- **WHEN** a pending SQL `review_events` row has an idempotency key already present in replayed `review-events` truth
- **THEN** the system SHALL report the row as duplicate evidence, SHALL NOT append a duplicate truth record, and SHALL NOT mutate Review scheduling, cards, queue projection rows, or kernel state

### Requirement: Review truth cleanup preserves runtime ownership and diagnostics
The cleanup SHALL preserve existing runtime ownership, public RPC method strings, and explicit diagnostics for Review truth maintenance.

#### Scenario: Public Review truth RPC contract remains stable
- **WHEN** this cleanup changes Review truth flush/backfill implementation or tests
- **THEN** the system SHALL keep `review.truth.flush` and `review.truth.backfill` JSON-RPC method strings, request/result shapes, backend Review RPC family ownership, writer relay ownership, kernel sidecar ownership, and SQL worker authority unchanged

#### Scenario: Diagnostics expose pending and failed maintenance
- **WHEN** startup or diagnostics reads Review truth maintenance state
- **THEN** the system SHALL expose pending SQL truth backfill count/check time, latest backfill result, sync-visible state, and latest error without treating unavailable diagnostics as successful cleanup

#### Scenario: Review button success boundary remains local durability
- **WHEN** Review feedback returns committed success to the user
- **THEN** the system SHALL NOT require asynchronous MessagePack truth flush/backfill completion before returning success, and SHALL keep truth maintenance as bounded background work after local journal and SQL projection durability requirements are met
