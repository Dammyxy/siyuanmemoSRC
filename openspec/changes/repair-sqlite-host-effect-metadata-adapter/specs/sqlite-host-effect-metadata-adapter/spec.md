## ADDED Requirements

### Requirement: SQLite host-effect metadata adapter preserves delta diagnostics

The worker SQLite persistence Adapter SHALL translate runtime SQLite delta diagnostics into worker host-effect metadata before crossing the persistence bridge.

#### Scenario: Runtime delta diagnostics label host effects

- **GIVEN** runtime SQLite delta persistence calls the worker file-service Adapter with `diagnostics.sqliteDeltaPurpose` and `diagnostics.sqliteDeltaSubstep`
- **WHEN** the Adapter forwards a SQLite `readBinary`, `writeBinary`, `readJSON`, or `writeJSON` host effect
- **THEN** the bridge metadata SHALL include the equivalent `purpose` and `substep`
- **AND** Review feedback slow-path logs SHALL no longer collapse these effects to `purpose=unknown substep=unknown` when runtime diagnostics were present

#### Scenario: Direct bridge metadata remains supported

- **GIVEN** a caller already passes direct `purpose` and `substep` bridge metadata
- **WHEN** the Adapter forwards the host effect
- **THEN** the Adapter SHALL preserve that direct metadata
- **AND** it SHALL NOT require the caller to wrap metadata in runtime diagnostics

#### Scenario: Durability behavior is unchanged

- **GIVEN** Review feedback commits through SQLite delta persistence
- **WHEN** metadata is normalized for host-effect attribution
- **THEN** the Adapter SHALL NOT skip persisted reads or writes
- **AND** it SHALL NOT convert durable failures into success
- **AND** it SHALL NOT add asynchronous commit behavior
