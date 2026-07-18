## ADDED Requirements

### Requirement: Loadable projection startup avoids review-event replay
The Worker SHALL NOT replay `review-events` MessagePack records during `db.load` or `db.reload` when an existing SQLite projection is loadable.

#### Scenario: Existing projection with heavy review truth
- **WHEN** startup finds existing SQLite projection bytes and `review-events` truth segments are present
- **THEN** the Worker loads startup without reading those `review-events` segment records

#### Scenario: Projection rebuild still needs review truth
- **WHEN** startup cannot load an existing SQLite projection and must rebuild review-event indexes from truth
- **THEN** the Worker keeps the full truth replay path that includes `review-events`

### Requirement: Startup storage pressure uses cached startup evidence
The Worker SHALL initialize storage-pressure admission during startup from already-collected startup evidence instead of requiring an exact storage inventory before returning `db.load` or `db.reload`.

#### Scenario: Normal pressure startup
- **WHEN** startup evidence classifies storage pressure below hard pressure
- **THEN** `db.load` can return a readable startup result without listing truth inventory or reading the persisted projection again for exact inventory

#### Scenario: Hard pressure startup evidence
- **WHEN** startup evidence itself classifies storage pressure as hard
- **THEN** the Worker reports `read-only-storage-pressure` and emits the existing storage-pressure recovery deferred work

### Requirement: Exact storage-growth baseline runs after readiness
The Worker SHALL run exact storage-growth baseline inventory, bounded maintenance, and baseline migration marking after startup readiness through existing maintenance or storage-pressure recovery authority.

#### Scenario: Startup maintenance completes
- **WHEN** post-ready startup storage maintenance writes its completion receipt
- **THEN** the Worker establishes the exact storage-growth baseline before finishing that maintenance batch

#### Scenario: Storage pressure recovery completes
- **WHEN** storage-pressure recovery classifies pressure below hard or successfully clears hard pressure
- **THEN** the Worker marks the storage-growth baseline migration from exact evidence
