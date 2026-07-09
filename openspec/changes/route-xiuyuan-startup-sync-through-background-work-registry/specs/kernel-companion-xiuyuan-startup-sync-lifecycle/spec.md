## ADDED Requirements

### Requirement: Xiuyuan startup sync uses background work lifecycle
Xiuyuan startup sync SHALL submit startup full or incremental sync through the Kernel Companion Background Work registry.

#### Scenario: Startup full sync is due
- **WHEN** `XiuyuanSyncService.start()` completes legacy card-type attr migration and full sync is due
- **THEN** the registry SHALL record an accepted or running `xiuyuan-startup-sync` job with `syncType: 'full'`
- **AND** startup SHALL NOT wait for that full sync to finish

#### Scenario: Startup incremental sync is configured
- **WHEN** full sync is not due and plugin-start incremental sync is enabled
- **THEN** the registry SHALL record an accepted or running `xiuyuan-startup-sync` job with `syncType: 'incremental'`
- **AND** the backend/local sync request SHALL keep `source: 'startup'`
- **AND** the backend/local sync request SHALL keep `persistIdleCheckpoint: false`

### Requirement: Xiuyuan startup sync shutdown is explicit
Xiuyuan startup sync SHALL use registry lifecycle state for shutdown and stop boundaries without claiming physical interruption of already-issued writes.

#### Scenario: Registry shutdown before startup sync starts
- **WHEN** the registry shuts down after accepting a `xiuyuan-startup-sync` job but before its handler runs
- **THEN** the job SHALL become deferred
- **AND** the sync operation SHALL NOT execute

#### Scenario: Service stop while startup sync runs
- **WHEN** `XiuyuanSyncService.stop()` runs while a startup sync job is running
- **THEN** the active job SHALL become canceled
- **AND** late handler results SHALL NOT change the job to completed

### Requirement: Existing Xiuyuan sync ownership remains unchanged
Xiuyuan startup sync SHALL keep sync planning and write ownership with existing Xiuyuan/backend sync owners.

#### Scenario: Startup full sync executes
- **WHEN** the startup full sync job runs
- **THEN** it SHALL call the existing `fullSync()` path
- **AND** it SHALL NOT move Riff/card writes or SQLite writes into the registry or kernel companion

#### Scenario: Startup incremental sync executes
- **WHEN** the startup incremental sync job runs
- **THEN** it SHALL call the existing `incrementalSync()` path with startup options
- **AND** backend unavailable behavior SHALL remain explicit unavailable/fail-closed without local fallback

