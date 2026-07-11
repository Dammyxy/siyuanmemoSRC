## ADDED Requirements

### Requirement: Canonical truth uses domain-appropriate durable forms
The system SHALL preserve Review history as append-only facts and SHALL preserve Card/Schedule and Queue current state as compactable snapshots, changesets, and tombstones.

#### Scenario: Temporary SQLite is removed
- **WHEN** the temporary `siyuanmemo.db` projection is missing or intentionally deleted
- **THEN** the system SHALL be able to reconstruct formal current state from verified canonical truth plus uncovered replayable delta

#### Scenario: A Card Aggregate is deleted
- **WHEN** a Card Aggregate deletion becomes truth-committed
- **THEN** canonical truth SHALL retain a tombstone sufficient to prevent stale replay or synchronized state from reviving the aggregate

### Requirement: Card and Schedule snapshots use bounded immutable segments
The system SHALL store Card and Schedule as one Card Aggregate in medium-grained immutable snapshot segments bounded by aggregate count and encoded byte size.

#### Scenario: Segment reaches either partition limit
- **WHEN** adding another aggregate would exceed the configured aggregate-count or encoded-byte limit
- **THEN** the writer SHALL close the current segment and place the aggregate in another segment

#### Scenario: One aggregate changes
- **WHEN** one Card Aggregate changes between compactions
- **THEN** the system SHALL record a changeset without rewriting an entire database-sized snapshot

#### Scenario: Dataset contains many cards
- **WHEN** the number of cards grows substantially
- **THEN** the system SHALL not create one truth file per card and SHALL keep segment count subject to the storage budget

### Requirement: Snapshot publication is generation-fenced
The system SHALL write, verify, and publish immutable snapshot generations without modifying the active verified generation in place.

#### Scenario: New generation is complete
- **WHEN** every required segment and checksum for a new generation is verified
- **THEN** the system SHALL publish one fenced manifest transition that makes the new generation current

#### Scenario: Compaction stops before publication
- **WHEN** process failure occurs before the new manifest transition is verified
- **THEN** readers SHALL continue using the previous verified generation and incomplete files SHALL remain non-authoritative

### Requirement: Delta and checkpoint history is finite
The system SHALL treat SQLite delta as a finite crash-recovery journal and SHALL reconstruct current state from the latest verified checkpoint plus subsequent uncovered delta.

#### Scenario: New verified checkpoint covers old delta
- **WHEN** a checkpoint is verified and every earlier mutation has canonical truth coverage
- **THEN** older delta segments SHALL become eligible for retention-policy reclamation

#### Scenario: New device initializes
- **WHEN** a new device needs current truth state
- **THEN** it SHALL load a current verified checkpoint or snapshot generation plus subsequent truth changes and SHALL NOT require replay from the first historical delta

#### Scenario: Checkpoint retention runs
- **WHEN** a newer checkpoint and generation are verified
- **THEN** the system SHALL retain current and previous verified recovery generations and SHALL reclaim older covered generations according to policy

### Requirement: Storage budget controls file count and disk growth
The system SHALL classify storage pressure as normal, soft, high, or hard using configurable counts, bytes, and age metrics for delta, truth segments, snapshots, and temporary projections.

#### Scenario: Soft threshold is reached
- **WHEN** any configured soft threshold is reached
- **THEN** the system SHALL schedule prompt background promotion or compaction and expose a pressure diagnostic without blocking normal commands

#### Scenario: High threshold is reached
- **WHEN** any configured high threshold is reached
- **THEN** the system SHALL perform bounded synchronous promotion or compaction before accepting mutation growth beyond the high-pressure policy

#### Scenario: Hard threshold cannot be reclaimed safely
- **WHEN** storage remains above a hard threshold and uncovered data prevents safe reclamation
- **THEN** new growth-producing mutations SHALL fail with explicit `STORAGE_PRESSURE` and the system SHALL NOT delete uncovered data

### Requirement: Compaction reclaims only verified obsolete files
The system SHALL delete a delta, changeset, snapshot, manifest, or orphan file only after proving that a verified current generation and required recovery generation no longer depend on it.

#### Scenario: Segment contains uncovered mutation evidence
- **WHEN** a candidate segment contains any mutation without verified canonical coverage
- **THEN** compaction SHALL preserve the segment or relocate and verify that evidence before deletion

#### Scenario: Orphan file is discovered
- **WHEN** startup or maintenance finds a file not referenced by a verified manifest
- **THEN** the system SHALL quarantine, verify, adopt, or delete it through an explicit orphan decision and SHALL NOT silently treat it as current truth

### Requirement: Existing installations establish a safe budget baseline
The system SHALL perform a one-time measured promotion and compaction migration before enforcing hard budgets on installations already above target counts.

#### Scenario: Existing storage exceeds initial hard threshold
- **WHEN** an upgraded installation starts with legacy covered segments above the new hard threshold
- **THEN** migration SHALL first classify coverage and compact safely rather than immediately blocking all writes solely because of pre-existing covered files

### Requirement: Storage diagnostics report actionable budget evidence
The system SHALL report file counts, encoded bytes, oldest segment age, current and previous generation identity, uncovered mutation count, compaction status, and pressure state by truth family and device.

#### Scenario: User investigates storage growth
- **WHEN** storage diagnostics are requested
- **THEN** the result SHALL identify which family, device, generation, or uncovered mutation prevents reclamation
