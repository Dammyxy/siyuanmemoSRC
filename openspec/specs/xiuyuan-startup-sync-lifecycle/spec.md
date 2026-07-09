# xiuyuan-startup-sync-lifecycle Specification

## Purpose
TBD - created by archiving change deepen-xiuyuan-startup-sync-lifecycle. Update Purpose after archive.
## Requirements
### Requirement: Xiuyuan startup sync exposes staged lifecycle diagnostics
Xiuyuan startup sync SHALL report startup lifecycle phase diagnostics for scan, plan, apply, and checkpoint/finalization when it runs as Kernel Companion Background Work.

#### Scenario: Startup full sync records phases
- **WHEN** `XiuyuanSyncService.start()` submits a due startup full sync
- **AND** the background work handler runs to completion
- **THEN** the job diagnostics SHALL include `syncType: 'full'`
- **AND** the diagnostics SHALL identify the latest completed startup sync phase
- **AND** startup SHALL remain non-blocking

#### Scenario: Startup incremental sync records startup options
- **WHEN** startup incremental sync is configured and full sync is not due
- **AND** the background work handler runs
- **THEN** the job diagnostics SHALL include `syncType: 'incremental'`
- **AND** the sync request SHALL keep `source: 'startup'`
- **AND** the sync request SHALL keep `persistIdleCheckpoint: false`

### Requirement: Xiuyuan startup sync observes cooperative cancellation
Xiuyuan startup sync SHALL check background-work cancellation between lifecycle phases and stop before issuing the next phase after cancellation or shutdown.

#### Scenario: Cancellation before planning
- **WHEN** a `xiuyuan-startup-sync` job is canceled after scan input completes but before planning starts
- **THEN** planning SHALL NOT execute
- **AND** the job SHALL remain canceled or return a canceled terminal result
- **AND** diagnostics SHALL preserve the last completed phase

#### Scenario: Cancellation before apply
- **WHEN** a `xiuyuan-startup-sync` job is canceled after change-set planning but before apply starts
- **THEN** write/apply side effects SHALL NOT execute
- **AND** diagnostics SHALL preserve planned change-set evidence when available

#### Scenario: Cancellation after apply starts
- **WHEN** cancellation occurs after backend or SiYuan writes have already been issued
- **THEN** the job SHALL NOT claim those writes were physically interrupted
- **AND** late completion SHALL NOT overwrite an already canceled registry state

### Requirement: Existing Xiuyuan sync ownership remains unchanged
Xiuyuan startup lifecycle staging SHALL preserve existing Xiuyuan/backend ownership for planning, native Riff compatibility, card writes, and SQLite writes.

#### Scenario: Backend unavailable during startup sync
- **WHEN** backend sync authority is required but unavailable during a startup sync phase
- **THEN** the job SHALL fail or defer with explicit unavailable diagnostics
- **AND** it SHALL NOT run hidden local fallback or compatibility writes

#### Scenario: Manual sync runs
- **WHEN** a caller invokes manual full or incremental sync outside startup
- **THEN** manual sync behavior SHALL remain unchanged by the startup lifecycle Module

