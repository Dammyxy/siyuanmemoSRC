## ADDED Requirements

### Requirement: Review startup maintenance uses Review-owned status
The system SHALL decide startup Review truth flush and SQL truth backfill scheduling from a Review-owned maintenance status Interface that reads only Review journal and Review truth-backfill diagnostics.

#### Scenario: Startup scheduling ignores broad diagnostics failures
- **WHEN** broad backend diagnostics would fail because SQLite delta diagnostics, Domain Sync diagnostics, or sync-conflict source scans are unavailable
- **THEN** startup Review truth scheduling SHALL still read Review maintenance status and schedule pending truth flush/backfill work when Review-owned diagnostics show pending work

### Requirement: Passive preflights do not scan sync-conflict source files
The system SHALL NOT scan host sync-conflict database source files for Browser/read-only preflights or Review-entry preflight status requests that explicitly skip main DB reads.

#### Scenario: Browser and queue reads do not block on conflict-source scan
- **WHEN** Browser deck rows, Browser counts, queue projection snapshots, or other read-only preflight paths read local projections
- **THEN** those reads SHALL NOT call `sqlite.readSyncConflictDatabaseSources` and SHALL NOT fail because that host effect times out

#### Scenario: Review entry guard does not block on conflict-source scan
- **WHEN** Review entry requests Domain Sync status with `review-feedback-preflight` and main DB reads disabled
- **THEN** the guard SHALL use local Domain Sync status and SHALL NOT call `sqlite.readSyncConflictDatabaseSources`

### Requirement: Explicit sync conflict workflows still scan and fail closed
The system SHALL preserve sync-conflict source scans for explicit conflict merge, summarize, cleanup-candidate listing, cleanup apply, and forced Review retry paths that require external source state.

#### Scenario: Explicit conflict-source operation keeps unavailable errors
- **WHEN** an explicit sync conflict workflow needs host conflict-source files and the host reader fails or times out
- **THEN** the workflow SHALL return explicit unavailable/failure diagnostics instead of pretending no conflict source exists
