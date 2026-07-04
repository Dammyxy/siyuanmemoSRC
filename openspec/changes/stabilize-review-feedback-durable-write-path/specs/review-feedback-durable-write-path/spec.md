## ADDED Requirements

### Requirement: Corrupt SQLite delta open segment recovery is bounded
The system SHALL treat a checksum mismatch in `sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack` as a bounded recovery condition for Review feedback persistence.

#### Scenario: Corrupt open segment is not replayed repeatedly
- **WHEN** `review.feedback` persistence detects a checksum mismatch for the SQLite delta v2 open segment
- **THEN** the system SHALL mark that open segment corrupt for the recovery attempt and SHALL NOT replay the same corrupt open segment during restore or checkpoint repair

#### Scenario: Checkpoint repair clears corrupt pending delta state
- **WHEN** a Review feedback transaction has committed in memory and the corrupt open segment prevents delta append
- **THEN** the system SHALL attempt a full durable SQLite checkpoint from the committed in-memory database, clear pending delta manifest state if the checkpoint succeeds, and report checkpoint-repair diagnostics

#### Scenario: Unsafe repair fails fast
- **WHEN** the system cannot prove a safe checkpoint repair after a corrupt open segment
- **THEN** the system SHALL return an explicit repair-required or backend-unavailable result without reporting the Review feedback commit as durable

### Requirement: Review feedback corrupt-delta failures stay within the hot-path budget
The system SHALL prevent corrupt SQLite delta state from causing long `review.feedback` restore/replay loops.

#### Scenario: Corrupt delta does not stall Review feedback for tens of seconds
- **WHEN** `review.feedback` encounters a corrupt SQLite delta v2 open segment
- **THEN** the operation SHALL complete with checkpoint-repaired, repair-required, or unavailable diagnostics without performing repeated full restore/replay attempts against the same corrupt file

#### Scenario: Timing diagnostics identify recovery mode
- **WHEN** `review.feedback` handles corrupt SQLite delta state
- **THEN** timing and storage diagnostics SHALL identify whether the operation used delta append, checkpoint repair, repair-required failure, or unavailable failure

### Requirement: Ordinary Review feedback persists a minimum durable commit
The system SHALL make ordinary formal Review feedback durable by persisting only the minimum authoritative commit data on the synchronous hot path.

#### Scenario: Minimum durable commit succeeds
- **WHEN** a formal Review feedback request is accepted for a card
- **THEN** the synchronous durable commit SHALL persist the card scheduler/current state, one append-only review fact or review event, and the commit idempotency identity before reporting committed success

#### Scenario: Derived work is reported separately
- **WHEN** the minimum durable Review feedback commit succeeds but queue projection, Browser projection, truth flush, or full checkpoint maintenance is not complete
- **THEN** the result SHALL report those derived or secondary effects as patched, deferred, stale, refresh-required, pending, or failed without blocking the committed result on their completion

#### Scenario: Minimum durable commit failure is fail-closed
- **WHEN** the minimum durable Review feedback commit cannot be proven
- **THEN** the system SHALL return commit-failed, repair-required, or unavailable diagnostics and SHALL NOT report committed success

### Requirement: Review feedback retry is idempotent
The system SHALL use the Review feedback idempotency identity as the retry boundary for durable commit recovery.

#### Scenario: Retry returns existing committed evidence
- **WHEN** a Review feedback request is retried with an idempotency key that already has matching durable review evidence
- **THEN** the system SHALL return the existing committed result without inserting a duplicate review event or reapplying scheduler mutation

#### Scenario: Mismatched retry fails closed
- **WHEN** a Review feedback retry uses an existing idempotency key but differs by card identity, rating, reviewed timestamp, or queue type
- **THEN** the system SHALL fail closed with an explicit conflict diagnostic instead of merging or overwriting the existing durable evidence
