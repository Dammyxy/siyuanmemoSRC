## ADDED Requirements

### Requirement: Worker owns every production storage mutation
The system SHALL route every production Card, Schedule, Queue, Review, SQLite delta, and MessagePack truth mutation through a Worker-owned storage command boundary.

#### Scenario: Renderer requests a formal mutation
- **WHEN** renderer UI or application code requests a formal storage mutation
- **THEN** it SHALL send a typed command to the Worker and SHALL NOT mutate SQLite, delta, truth, or manifests locally

#### Scenario: Worker is unavailable
- **WHEN** a formal mutation command cannot reach an active Worker writer
- **THEN** the system SHALL return explicit unavailable and SHALL NOT use renderer, kernel companion, or local snapshot fallback writes

### Requirement: Mutation families cut over without production dual write
The system SHALL migrate storage authority by mutation family and SHALL remove the superseded production writer for a family in the same implementation slice that enables Worker authority.

#### Scenario: A mutation family is cut over
- **WHEN** Review, Card/Schedule, Queue membership, Card CRUD, import, or repair is declared Worker-owned
- **THEN** every production caller in that family SHALL use the Worker command and the prior renderer write entry SHALL be deleted or made unreachable

#### Scenario: Another family is not yet migrated
- **WHEN** a separate mutation family remains outside the current slice
- **THEN** its status SHALL remain explicit and SHALL NOT cause the migrated family to retain a compatibility dual-write path

### Requirement: Host effects do not become storage authority
The system SHALL keep main-thread and kernel-companion file operations limited to typed transport or host-effect execution requested by the Worker.

#### Scenario: Worker persists a truth segment
- **WHEN** Worker storage code needs a SiYuan host file operation
- **THEN** the host bridge SHALL execute the requested read, write, rename, or delete effect without interpreting durability, manifest ownership, or domain merge policy

#### Scenario: Kernel companion is active
- **WHEN** kernel companion relays commands, wakes work, or reports writer status
- **THEN** it SHALL NOT open or mutate `siyuanmemo.db`, delta segments, truth segments, or truth manifests

### Requirement: Storage commands return explicit mutation receipts
The Worker storage command boundary SHALL return a typed result containing mutation identity, durability stage, journal sequence when allocated, affected aggregate identities, and explicit failure diagnostics.

#### Scenario: Mutation reaches replayable journal durability
- **WHEN** the Worker transaction and complete delta mutation are durably committed
- **THEN** the result SHALL identify the mutation as `journaled` and SHALL NOT represent it as canonical truth committed

#### Scenario: Mutation fails before journal durability
- **WHEN** the transaction or complete delta append fails
- **THEN** the result SHALL report failure and callers SHALL NOT advance visible authoritative state as though the mutation succeeded

### Requirement: Whole-database save is not an active persistence contract
The system SHALL NOT use renderer-side `saveStore()`, `UnifiedStorageManager.save()`, or equivalent whole-database export as an active production durability mechanism after the relevant mutation families are migrated.

#### Scenario: Application shuts down normally
- **WHEN** renderer shutdown begins after Worker-owned families have acknowledged their commands
- **THEN** shutdown SHALL coordinate Worker quiescence and SHALL NOT rely on a renderer whole-database save to make those mutations durable

#### Scenario: Migration requires bulk storage work
- **WHEN** a one-time import, migration, or repair needs bulk mutation
- **THEN** it SHALL execute as an explicit Worker-owned migration command with progress, idempotency, and failure diagnostics
