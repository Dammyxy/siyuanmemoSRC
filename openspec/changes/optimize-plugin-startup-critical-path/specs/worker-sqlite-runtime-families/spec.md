## ADDED Requirements

### Requirement: Worker SQLite startup distinguishes readiness from maintenance
The Worker SQLite runtime SHALL distinguish synchronous startup readiness work from deferred-safe maintenance work.

#### Scenario: Readable projection is ready
- **WHEN** storage evidence is trusted and the SQL projection repository can load the startup projection snapshot
- **THEN** `db.load` SHALL return the projection snapshot without waiting for deferred-safe maintenance work

#### Scenario: Storage evidence is untrusted
- **WHEN** truth, delta, identity, or projection evidence cannot be trusted according to existing recovery rules
- **THEN** the Worker SQLite runtime SHALL preserve fail-closed or read-only recovery behavior before `db.load` reports normal readiness

### Requirement: Worker startup maintenance preserves write authority
Deferred Worker startup maintenance SHALL use Worker-owned SQLite/truth dependencies and SHALL NOT create a second database ownership path.

#### Scenario: Deferred maintenance mutates storage
- **WHEN** deferred startup maintenance needs to replay, reconcile, promote, compact, or repair Worker-owned storage
- **THEN** it SHALL execute through Worker-owned runtime dependencies and existing writer authority checks
- **AND** it SHALL NOT write `siyuanmemo.db` from kernel companion or renderer-side ad hoc code

### Requirement: Hard storage pressure remains a synchronous gate
The Worker SQLite runtime SHALL keep hard storage pressure and recovery-required states out of deferred startup maintenance.

#### Scenario: Hard pressure remains after bounded maintenance
- **WHEN** startup detects hard storage pressure that cannot be safely deferred
- **THEN** startup SHALL fail closed with explicit storage pressure diagnostics before accepting normal write-capable readiness
