## ADDED Requirements

### Requirement: Xiuyuan sync worker family delegates through a narrow runtime
The system SHALL delegate Xiuyuan sync local-facts read and plan-apply behavior from `WorkerSqliteDatabaseService` to a Xiuyuan-specific worker runtime Module while preserving existing public facade methods.

#### Scenario: Xiuyuan sync facade remains compatible
- **WHEN** backend Xiuyuan sync code invokes `WorkerSqliteDatabaseService.readXiuyuanSyncLocalFacts()` or `WorkerSqliteDatabaseService.applyXiuyuanSyncPlan()`
- **THEN** the methods return the same public result shapes while delegating implementation to the Xiuyuan sync runtime

#### Scenario: Xiuyuan sync runtime owns SQL apply helpers
- **WHEN** a Xiuyuan sync plan creates, updates, deletes, skips, compares, merges schedule state, writes tombstones, or advances sync checkpoints
- **THEN** Xiuyuan-specific helper logic is owned by the Xiuyuan sync runtime rather than by the broad database service

### Requirement: Xiuyuan sync extraction preserves existing authority boundaries
The system SHALL preserve existing Xiuyuan sync RPC, native Riff read, idempotency, and SQLite ownership boundaries during runtime extraction.

#### Scenario: RPC and planner contracts remain stable
- **WHEN** `xiuyuan.sync.execute` handles dry-run, non-dry-run, unavailable, duplicate, and failed requests
- **THEN** the backend RPC method string, request params, result shape, planner behavior, and idempotency cache semantics remain unchanged

#### Scenario: SQLite writes use supplied worker DB dependencies
- **WHEN** the Xiuyuan sync runtime reads or mutates SQLite-backed Xiuyuan/card/tombstone/checkpoint state
- **THEN** it MUST use dependencies supplied by `WorkerSqliteDatabaseService` and MUST NOT create an independent SQLite database ownership path

### Requirement: Xiuyuan sync extraction excludes unrelated runtime families
The system SHALL keep this extraction limited to the Xiuyuan sync worker family.

#### Scenario: Extraction scope is reviewed
- **WHEN** implementation moves Xiuyuan sync worker read/apply behavior
- **THEN** it excludes AI/Job/Hotspot, AI workbench, agent-owned paths, Review truth policy, queue projection policy, and Browser read-model behavior
