## ADDED Requirements

### Requirement: Worker SQLite startup separates readable load from pressure recovery
The Worker SQLite facade SHALL complete readable projection reconstruction and storage-pressure classification without synchronously relocating a hard-pressure legacy delta. When recovery is required it MUST return a content-safe recovery descriptor and retain Worker mutation authority in read-only mode.

#### Scenario: Hard-pressure legacy delta is present
- **WHEN** `db.load` verifies and replays the active delta but determines that legacy adoption or cleanup is required
- **THEN** load returns readable state plus a recovery descriptor without writing replacement delta segments during the startup request

#### Scenario: No storage recovery is required
- **WHEN** verified storage inventory is within writable limits and no blocking recovery evidence exists
- **THEN** load preserves the existing writable runtime behavior and returns no storage-pressure recovery descriptor

### Requirement: Worker SQLite file capabilities are explicit and verified
The Worker persistence bridge SHALL expose delta file deletion and directory inventory only when the active transport implements those effects. Missing, rejected, timed-out, or unverifiable host effects MUST fail the storage operation and MUST NOT be reported as successful cleanup.

#### Scenario: Browser host deletes a delta file
- **WHEN** Worker recovery requests deletion through an implemented Browser host effect
- **THEN** the host removes the scoped file, returns success, and the Worker verifies that the file is absent before clearing cleanup state

#### Scenario: Delete host effect is unavailable
- **WHEN** the transport does not implement deletion
- **THEN** the bridge does not advertise a usable delete capability and compaction returns a capability failure without publishing a destructive manifest transition

#### Scenario: Worker inventories the delta directory
- **WHEN** recovery requests a scoped SQLite delta inventory
- **THEN** the host returns normalized path and byte metadata only for that directory or returns a structured failure
