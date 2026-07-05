## ADDED Requirements

### Requirement: Append hot path preserves verified segment evidence
The SQLite delta persistence module SHALL preserve same-runtime verified segment evidence during ordinary Review feedback append reconstruction.

#### Scenario: Consecutive review feedback appends avoid open-segment reads
- **WHEN** two ordinary Review-style transactions append to the same SQLite delta open segment through `SqliteDatabaseService`
- **THEN** the second transaction MUST NOT issue a persisted `readBinary` for that open segment before appending

#### Scenario: Review feedback appends avoid sealed-segment reads after rollover
- **WHEN** ordinary Review-style transactions fill and seal the SQLite delta open segment
- **THEN** the next append MUST NOT issue a persisted `readBinary` for the just-written durable-checkpoint sealed segment before appending

#### Scenario: Explicit diagnostics still read durable evidence
- **WHEN** explicit SQLite delta diagnostics run after hot Review feedback appends
- **THEN** diagnostics MUST cold-read persisted segment evidence and MUST NOT rely only on append hot evidence

### Requirement: Checkpointability remains owned by the delta layer
The SQLite delta module SHALL keep checkpointability, snapshot reconstruction, segment identity matching, and hot-evidence invalidation decisions inside `SqliteDeltaCheckpointLayer`.

#### Scenario: Persist caller does not inspect delta internals
- **WHEN** `SqliteDatabaseService.persist()` checks whether pending delta evidence requires a checkpoint
- **THEN** it MUST call a delta-layer method rather than inspect manifest, segment, or cached evidence internals directly

### Requirement: Fail-closed recovery paths still invalidate hot evidence
The SQLite delta persistence module SHALL continue to invalidate append hot evidence before or during explicit recovery, replay, repair, discard, diagnostics, and corrupt segment handling paths.

#### Scenario: Corrupt open segment remains detectable after explicit cold read
- **WHEN** persisted open-segment bytes are corrupted before explicit diagnostics, replay, repair, or recovery
- **THEN** the module MUST clear append hot evidence and follow the existing repair or fail-closed path

#### Scenario: Volatile sealed segment corruption remains detectable
- **WHEN** volatile-projection storage has a persisted sealed segment whose checksum no longer matches the manifest
- **THEN** the append path MUST cold-read that sealed segment and fail closed rather than reuse same-runtime sealed evidence
