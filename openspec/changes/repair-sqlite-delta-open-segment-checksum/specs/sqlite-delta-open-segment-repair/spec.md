# sqlite-delta-open-segment-repair Specification

## ADDED Requirements

### Requirement: Corrupt Open Segment Repair Uses Manifest Metadata

When the SQLite delta manifest points to an open segment whose checksum no longer matches the segment bytes, checkpoint repair SHALL be able to clear that open segment using manifest metadata without decoding or replaying the corrupt segment payload.

#### Scenario: Hot Review checkpoint repair clears corrupt open segment

- **GIVEN** a persisted SQLite DB and a delta manifest with an open segment
- **AND** the open segment bytes no longer match the manifest checksum
- **WHEN** a hot `review.feedback` transaction commits and delta persistence selects `corrupt-open-segment-checkpoint-repair`
- **THEN** the full SQLite checkpoint is written
- **AND** the delta manifest no longer references the corrupt open segment
- **AND** reload does not replay the corrupt open segment
- **AND** the committed Review row remains present in the current repaired SQLite runtime

### Requirement: Failed Repair Remains Explicit

If the full checkpoint write or manifest clear fails during corrupt open-segment repair, the storage layer SHALL fail closed with an explicit repair-required error and SHALL NOT restore/replay the known-corrupt open segment.

#### Scenario: Checkpoint write fails during corrupt open segment repair

- **GIVEN** a corrupt open segment checksum mismatch
- **AND** the full SQLite checkpoint write fails
- **WHEN** the transaction attempts repair
- **THEN** the caller receives `SQLITE_DELTA_REPAIR_REQUIRED`
- **AND** restore replay of the known-corrupt open segment is skipped

### Requirement: Non-Open Segment Mismatches Remain Non-Repairable

Checksum mismatch for sealed segments SHALL remain fail-hard unless a future change explicitly defines safe recovery semantics.

#### Scenario: Sealed segment checksum mismatch

- **GIVEN** a manifest references a sealed segment
- **AND** that sealed segment checksum mismatches
- **WHEN** pending delta replay or append reads the segment
- **THEN** the error is surfaced
- **AND** no manifest-only repair is attempted
