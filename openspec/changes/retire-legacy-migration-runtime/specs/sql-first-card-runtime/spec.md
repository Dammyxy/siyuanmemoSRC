## MODIFIED Requirements

### Requirement: Legacy snapshot storage is restricted to migration and recovery
The system SHALL NOT use binary snapshot or legacy unified-card storage as an active startup, recovery, Browser, Queue, NeuralRoam, Review mutation, truth import, or projection rebuild data source after the one-time migration cutover has been retired.

#### Scenario: Active SQL-first path cannot silently read binary snapshot
- **WHEN** an active SQL-first Browser, Queue, NeuralRoam, or Review mutation path encounters SQL or truth unavailability
- **THEN** the system SHALL return explicit unavailable diagnostics instead of silently reading `unified-cards.msgpack`

#### Scenario: Startup after migration retirement cannot import legacy snapshot
- **WHEN** backend startup finds no usable MessagePack truth or SQL projection after the migration-retirement build
- **THEN** the system SHALL fail closed with an explicit migration-required or storage-unavailable diagnostic and MUST NOT decode `unified-cards.msgpack`

#### Scenario: Historical migration evidence remains passive
- **WHEN** migration receipts or diagnostics from an older build exist
- **THEN** the system MAY read them only as passive evidence and MUST NOT use them to trigger legacy source reads or record imports

#### Scenario: Runtime MessagePack allowlist excludes retired importers
- **WHEN** runtime MessagePack access is audited
- **THEN** legacy unified-card source detection and import runtime files SHALL NOT remain allowlisted as active MessagePack readers
