## ADDED Requirements

### Requirement: Consecutive Delta Appends Reuse Hot Snapshot
The system SHALL reuse an in-memory SQLite delta snapshot for consecutive committed transaction appends in the same runtime when no invalidating operation has occurred.

#### Scenario: Consecutive review feedback appends
- **WHEN** multiple committed transactions append to the SQLite delta layer consecutively
- **THEN** the second and later appends SHALL avoid re-reading the persisted manifest solely to reconstruct the same hot-path snapshot
- **AND** each append SHALL still durably write its segment and manifest evidence before reporting success

#### Scenario: Invalidation before recovery or checkpoint
- **WHEN** checkpoint, repair, reset, recovery, or replay code needs durable persisted evidence
- **THEN** the delta layer SHALL clear or bypass the hot snapshot cache and read persisted manifest/segment state

#### Scenario: Corrupt persisted evidence
- **WHEN** the persisted delta manifest or segment evidence is corrupt or missing on a cold read
- **THEN** the delta layer SHALL continue to fail closed instead of trusting stale cache data
