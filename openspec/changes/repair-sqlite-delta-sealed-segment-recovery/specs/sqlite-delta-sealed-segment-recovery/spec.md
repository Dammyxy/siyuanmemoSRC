# sqlite-delta-sealed-segment-recovery Specification

## ADDED Requirements

### Requirement: Sealed Segment Recovery Requires Exact Manifest Proof

When a SQLite delta manifest references a sealed segment path that cannot be read, the storage layer SHALL only recover from an alternate candidate path if the candidate bytes exactly match the manifest entry checksum and byte size.

#### Scenario: Legacy candidate matches manifest metadata

- **GIVEN** a SQLite delta manifest references `sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack`
- **AND** the referenced file is missing
- **AND** a legacy sibling file exists at `sqlite-delta-log.v2.sealed-1.msgpack`
- **AND** the legacy sibling byte size equals the manifest `byteSize`
- **AND** the legacy sibling checksum equals the manifest `checksum`
- **WHEN** the delta log snapshot is read
- **THEN** the storage layer recovers the sealed segment from the validated candidate
- **AND** replay uses the validated bytes
- **AND** future reads do not require the legacy path

### Requirement: Mismatched Sealed Segment Candidates Remain Unrecoverable

When a SQLite delta manifest references a sealed segment and available candidate bytes do not match the manifest checksum or byte size, the storage layer SHALL fail closed and SHALL NOT replay, delete, or ignore that sealed segment.

#### Scenario: Legacy candidate has wrong checksum or size

- **GIVEN** a SQLite delta manifest references `sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack`
- **AND** the referenced file is missing
- **AND** a legacy sibling file exists
- **AND** the legacy sibling checksum or byte size differs from the manifest entry
- **WHEN** the delta log snapshot is read
- **THEN** the storage layer reports an unrecoverable sealed segment failure
- **AND** the candidate is not replayed
- **AND** the manifest is not cleared
- **AND** Review feedback durability fails closed

### Requirement: Existing Sealed Segment Checksum Mismatch Is Not Auto-Repaired

When the manifest-path sealed segment file exists but its checksum differs from the manifest entry, the storage layer SHALL treat it as corruption and SHALL NOT replace it with unrelated candidates unless a future explicit recovery contract proves correctness.

#### Scenario: Manifest-path sealed segment is corrupt

- **GIVEN** a SQLite delta manifest references a sealed segment
- **AND** the referenced segment file exists
- **AND** the referenced segment file checksum differs from the manifest checksum
- **WHEN** the delta log snapshot is read
- **THEN** checksum mismatch is surfaced
- **AND** no fallback replay occurs
- **AND** no manifest-only repair occurs

### Requirement: Missing Durable Replay Evidence Blocks Review Success

Review feedback SHALL NOT report committed success when SQLite delta sealed segment recovery cannot prove durable replay evidence.

#### Scenario: Review feedback encounters unrecoverable sealed segment

- **GIVEN** Review feedback updates a card through the backend SQLite runtime
- **AND** SQLite delta replay or persist hits an unrecoverable sealed segment
- **WHEN** the feedback result is mapped back to the Review UI
- **THEN** the result is unavailable or repair-required
- **AND** it is not reported as committed success
- **AND** diagnostics identify the sealed segment path that blocked durability
