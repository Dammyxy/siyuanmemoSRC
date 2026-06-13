## ADDED Requirements

### Requirement: Worker SQLite families delegate through narrow runtimes
The system SHALL delegate selected worker SQLite family behavior from `WorkerSqliteDatabaseService` to family-specific runtime Modules with explicit dependencies.

#### Scenario: Facade behavior remains compatible
- **WHEN** an existing backend runtime caller invokes a selected `WorkerSqliteDatabaseService` method
- **THEN** the method returns the same public result shape while delegating implementation to the selected family runtime

#### Scenario: Family runtime owns its state
- **WHEN** the selected family has counters, queues, recent-key maps, diagnostics, or normalization helpers
- **THEN** that family state is owned by the extracted runtime rather than by the broad database service

### Requirement: SQL transaction ownership remains centralized
The system SHALL keep SQLite transaction and repository ownership explicit when extracting worker runtime families.

#### Scenario: Extracted family writes through provided dependencies
- **WHEN** an extracted family runtime needs to read or write SQLite-backed state
- **THEN** it uses dependencies supplied by the worker DB layer and MUST NOT create an independent database ownership path

### Requirement: AI and agent families stay out of this extraction
The system SHALL NOT include AI workbench, AI/Job/Hotspot, or agent-specific behavior in this worker SQLite family extraction.

#### Scenario: Extraction scope is reviewed
- **WHEN** implementation selects worker DB families to extract
- **THEN** the selected files and tests exclude AI/Job/Hotspot and agent-owned paths
