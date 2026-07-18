## ADDED Requirements

### Requirement: Storage-pressure admission delegates through a narrow Worker Module
The system SHALL delegate storage-pressure baseline state, append observation, pressure reclassification, refresh coalescing, and mutation admission decisions from `WorkerSqliteDatabaseService` to a storage-pressure-specific Worker Module with explicit dependencies.

#### Scenario: Database facade admits a formal mutation
- **WHEN** `WorkerSqliteDatabaseService` prepares a formal SQLite transaction
- **THEN** it obtains the pressure decision from the storage-pressure admission Module while retaining ownership of the transaction and any required maintenance

#### Scenario: Admission state changes after durability
- **WHEN** SQLite delta persistence returns a verified receipt and post-append evidence
- **THEN** the storage-pressure admission Module owns the cached state transition rather than adding pressure counters to the database facade

#### Scenario: Exact inventory is needed
- **WHEN** startup, diagnostics, maintenance, or pressure verification requires exact evidence
- **THEN** the Module invokes its supplied inventory collector and MUST NOT create an independent SQLite or file-storage ownership path
