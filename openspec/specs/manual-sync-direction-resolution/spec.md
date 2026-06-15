# manual-sync-direction-resolution Specification

## Purpose
Define the user-directed manual recovery flow for SiYuanMemo sync conflict database copies, including preview, safe direction selection, backup-backed replacement, backend reload consistency, and immutable conflict source handling.
## Requirements
### Requirement: Conflict resolution preview
The system SHALL provide a manual sync conflict resolution preview before applying any direction choice.

#### Scenario: Conflict sources are available
- **WHEN** the user opens manual sync conflict resolution and SiYuanMemo conflict database copies are discovered
- **THEN** the system displays each source with source identity, file size, file modified time when available, review event count, card count, latest review timestamp, latest card timestamp, and parse status

#### Scenario: No conflict sources are available
- **WHEN** the user opens manual sync conflict resolution and no SiYuanMemo conflict database copies are discovered
- **THEN** the system reports that no conflict databases were found and does not mutate the current database

#### Scenario: A conflict source cannot be parsed
- **WHEN** a discovered conflict database copy cannot be opened or summarized
- **THEN** the system marks that source as unavailable for replacement and smart merge while keeping other readable sources selectable

### Requirement: Direction selection
The system SHALL let the user choose between smart merge, keeping the current local database, replacing with a selected conflict copy, and canceling.

#### Scenario: User chooses smart merge
- **WHEN** the user selects smart merge for one or more readable conflict sources
- **THEN** the system merges those sources through the backend-owned sync conflict merge path and reports merged review events, ignored review events, merged cards, ignored cards, and skipped sources

#### Scenario: User chooses keep current local
- **WHEN** the user selects keep current local
- **THEN** the system leaves the current database unchanged, leaves conflict files untouched, and reports that no merge or replacement was applied

#### Scenario: User cancels resolution
- **WHEN** the user cancels the manual sync conflict resolution flow
- **THEN** the system closes the flow without mutating the current database or conflict files

### Requirement: Full replacement safeguards
The system SHALL protect the current local database before replacing it with a selected conflict copy.

#### Scenario: User confirms replacement
- **WHEN** the user selects a readable conflict copy and confirms replacement
- **THEN** the system creates a timestamped backup of the current local database before replacing it with the selected conflict copy

#### Scenario: User does not confirm replacement
- **WHEN** the user selects replacement but declines the confirmation prompt
- **THEN** the system leaves the current database and conflict files unchanged

#### Scenario: Backup fails before replacement
- **WHEN** the system cannot create a backup of the current local database
- **THEN** the system aborts replacement and reports the backup failure without changing the current database

#### Scenario: Replacement succeeds
- **WHEN** the system successfully replaces the current local database with the selected conflict copy
- **THEN** the system reports the selected source and backup path to the user

### Requirement: Backend state consistency after replacement
The system SHALL keep backend SQLite state consistent with the selected database after a full replacement.

#### Scenario: Database is replaced
- **WHEN** the active `siyuanmemo.db` is replaced by a selected conflict copy
- **THEN** the backend worker reloads or recreates SQLite state from the replaced file before accepting further DB-backed requests

#### Scenario: Reload fails after replacement
- **WHEN** backend reload fails after the database file was replaced
- **THEN** the system reports the reload failure and backup path, and it does not silently continue with stale in-memory SQLite state

### Requirement: Conflict files remain immutable
The system SHALL NOT delete, move, or rewrite SiYuan sync conflict database copies during manual direction resolution.

#### Scenario: Smart merge completes
- **WHEN** smart merge completes successfully
- **THEN** the original conflict database files remain available in the SiYuan sync conflict directory

#### Scenario: Replacement completes
- **WHEN** replacement with a selected conflict copy completes successfully
- **THEN** the selected conflict database file remains available in the SiYuan sync conflict directory
