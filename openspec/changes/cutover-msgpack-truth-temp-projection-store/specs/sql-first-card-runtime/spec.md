## MODIFIED Requirements

### Requirement: Legacy snapshot storage is restricted to migration and recovery
The system SHALL restrict binary snapshot and legacy storage reads to explicit pre-truth migration, divergence detection, repair, compatibility, or not-yet-migrated paths and SHALL keep active SQL-first hot paths free of hidden legacy fallback.

#### Scenario: Active SQL-first path cannot silently read binary snapshot
- **WHEN** an active SQL-first Browser, Queue, NeuralRoam, or Review mutation path encounters SQL projection unavailability
- **THEN** the system SHALL return explicit unavailable diagnostics instead of silently reading `unified-cards.msgpack`

#### Scenario: Migration path can read legacy snapshot
- **WHEN** startup imports data from legacy binary storage before truth exists
- **THEN** the system MAY read legacy snapshot data and SHALL identify the read as migration behavior in code and tests

#### Scenario: Projection rebuild uses truth instead of legacy snapshot
- **WHEN** truth exists and SQL projection storage is missing, corrupt, stale, or schema-incompatible
- **THEN** the system SHALL rebuild SQL projection storage from truth and SHALL NOT read `unified-cards.msgpack` as a runtime fallback

#### Scenario: Legacy source read after truth is limited to divergence detection
- **WHEN** truth and a completed migration receipt exist
- **THEN** the system MAY read legacy source metadata or hash only to detect divergence and SHALL NOT import legacy records again

#### Scenario: Petal SQL DB is never SQL-first authority
- **WHEN** `storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db` exists
- **THEN** SQL-first runtime SHALL ignore it as active authority and SHALL NOT migrate or write it
