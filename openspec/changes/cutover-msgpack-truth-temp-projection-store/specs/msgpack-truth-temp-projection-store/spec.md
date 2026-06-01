## ADDED Requirements

### Requirement: Durable truth and temp projection are separated
The system SHALL store synchronized SiYuanMemo truth under plugin petal truth storage and SHALL treat `siyuanmemo.db` as a rebuildable temp projection instead of durable truth.

#### Scenario: Truth is stored under petal truth storage
- **WHEN** the runtime commits card memory or review-event truth
- **THEN** it SHALL write MessagePack truth artifacts under `storage/petal/siyuan-plugin-siyuanmemo/truth/**`

#### Scenario: Projection DB is not written under petal storage
- **WHEN** the runtime persists or rebuilds `siyuanmemo.db`
- **THEN** it SHALL NOT write `storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db`

#### Scenario: Temp persistence unavailable rebuilds in memory
- **WHEN** the host cannot provide a persistent workspace temp file path for the projection DB
- **THEN** the runtime MAY use an in-memory projection DB and SHALL rebuild it from truth on startup

#### Scenario: Legacy petal DB is ignored
- **WHEN** `storage/petal/siyuan-plugin-siyuanmemo/siyuanmemo.db` exists during startup
- **THEN** the runtime SHALL report a `legacy-petal-db-ignored` diagnostic and SHALL NOT read, migrate, delete, or write that DB

### Requirement: Legacy unified MessagePack migrates once into truth
The system SHALL migrate the published `unified-cards.msgpack` snapshot into truth once when no truth exists.

#### Scenario: First startup imports legacy unified cards
- **WHEN** truth is absent and `unified-cards.msgpack` is present
- **THEN** the runtime SHALL import active cards, tombstones, and source bindings into truth before opening Review or Browser

#### Scenario: Active cards import as snapshot facts
- **WHEN** a legacy active card is imported from `unified-cards.msgpack`
- **THEN** the runtime SHALL write a `card-memory.snapshot-imported` truth fact and SHALL NOT synthesize historical card lifecycle events

#### Scenario: Tombstones import as tombstone facts
- **WHEN** a legacy tombstoned card is imported from `unified-cards.msgpack`
- **THEN** the runtime SHALL write a `card-memory.tombstone-imported` truth fact and SHALL preserve tombstone identity

#### Scenario: Source bindings import as snapshot facts
- **WHEN** a legacy card source binding is imported from `unified-cards.msgpack`
- **THEN** the runtime SHALL write a `source-binding.snapshot-imported` truth fact

#### Scenario: Split legacy files are fallback source only
- **WHEN** `unified-cards.msgpack` is absent and older split legacy card files exist
- **THEN** the runtime MAY import `cards.msgpack` or `xiuyuan.msgpack` as a legacy fallback source with diagnostics

### Requirement: Migration receipt is truth-side authority
The system SHALL write the legacy migration receipt under truth/petal storage after truth segment and manifest commits succeed.

#### Scenario: Receipt is written after truth commit
- **WHEN** legacy migration writes all required truth segments and manifests successfully
- **THEN** the runtime SHALL write `truth/migrations/legacy-unified-cards-to-truth.v1.json`

#### Scenario: Receipt records source and truth metadata
- **WHEN** the migration receipt is written
- **THEN** it SHALL include migration id, status, source file, source hash, source byte length, migrated timestamp, device id, truth schema version, family names, generation ids, counts, segment references, and diagnostics

#### Scenario: Failed truth commit does not write completed receipt
- **WHEN** a legacy migration fails before all required truth manifests commit
- **THEN** the runtime SHALL NOT write a completed receipt and SHALL fail startup with `LEGACY_MIGRATION_FAILED`

#### Scenario: Truth without receipt is reconciled
- **WHEN** truth exists but the legacy migration receipt is missing
- **THEN** the runtime SHALL trust truth, rebuild projection from truth, and write a reconciled receipt without re-importing legacy MessagePack

### Requirement: Startup source priority prevents stale fallback
The system SHALL use truth as the highest authority, temp projection as a rebuildable index, and legacy MessagePack only as a pre-truth migration source or divergence-check source.

#### Scenario: Truth exists and projection DB is missing
- **WHEN** truth exists and the temp projection DB is missing
- **THEN** the runtime SHALL rebuild the projection DB from truth and SHALL NOT re-import `unified-cards.msgpack`

#### Scenario: Truth exists and projection DB is corrupt
- **WHEN** truth exists and the projection DB is corrupt or schema-incompatible
- **THEN** the runtime SHALL drop or ignore the projection DB and rebuild it from truth

#### Scenario: Truth exists and legacy source is unchanged
- **WHEN** truth exists, the migration receipt exists, and the legacy source hash still matches the receipt
- **THEN** the runtime SHALL ignore the legacy MessagePack as an import source

#### Scenario: Truth exists and legacy source changed
- **WHEN** truth exists, the migration receipt exists, and the legacy source hash differs from the receipt
- **THEN** the runtime SHALL fail closed with `LEGACY_DIVERGENCE_DETECTED` and SHALL NOT auto-merge the legacy source

### Requirement: Formal review logs migrate to review-events only
The system SHALL migrate formal legacy review logs into `review-events` truth and SHALL keep non-formal drill or reschedule logs out of review-event truth.

#### Scenario: Formal review log imports to review-events
- **WHEN** the legacy importer reads `review-logs/YYYY-MM.json` records from `reviewLogs` or `reviewLogsV2`
- **THEN** it SHALL write formal `review-events` truth records with stable idempotency keys

#### Scenario: Legacy idempotency key is preferred
- **WHEN** a formal legacy review record contains `commitIdempotencyKey` or `attemptId`
- **THEN** the importer SHALL use that value as the preferred idempotency identity

#### Scenario: Derived idempotency key is stable
- **WHEN** a formal legacy review record lacks a reusable idempotency identity
- **THEN** the importer SHALL derive `legacy-review-log:<year-month>:<cardId>:<reviewedAt>:<rating>:<attemptId-or-index>`

#### Scenario: Drill and reschedule logs stay legacy
- **WHEN** the legacy importer sees `drillLogsV2` or `rescheduleLogs`
- **THEN** it SHALL skip those records for `review-events` truth and SHALL report skipped counts in diagnostics

#### Scenario: Malformed review log is quarantined
- **WHEN** a legacy formal review record lacks required card id or reviewed timestamp
- **THEN** the importer SHALL quarantine that record and SHALL NOT write a `review-events` truth record for it

### Requirement: Empty scheduling memory is state-aware
The system SHALL preserve valid unreviewed empty scheduling memory and SHALL repair reviewed empty scheduling memory with configured ts-fsrs defaults plus diagnostics.

#### Scenario: New unreviewed card keeps empty memory
- **WHEN** a card has empty scheduling memory and unreviewed card state
- **THEN** the runtime SHALL preserve `stability=0` and `difficulty=0`

#### Scenario: Reviewed empty memory is repaired
- **WHEN** a reviewed card has empty scheduling memory during migration or projection rebuild
- **THEN** the runtime SHALL repair memory using `stability=1.2931` and `difficulty=5.11217071` and SHALL record a diagnostic

#### Scenario: Invalid scheduling state fails validation
- **WHEN** a card has scheduling memory that cannot be validated or repaired
- **THEN** the runtime SHALL fail closed with `TRUTH_VALIDATION_FAILED`

### Requirement: Truth segment manifests are commit points
The system SHALL make truth family manifests the only commit point for segment visibility.

#### Scenario: Reader uses manifest-listed segments only
- **WHEN** a truth reader loads a family generation
- **THEN** it SHALL read only segments listed by the committed manifest

#### Scenario: Orphan segment is ignored
- **WHEN** a segment exists on disk but is not referenced by the committed manifest
- **THEN** the reader SHALL ignore that segment and SHALL report an orphan-segment diagnostic

#### Scenario: Checksum mismatch fails closed
- **WHEN** a manifest-listed segment checksum does not match its content
- **THEN** truth loading SHALL fail closed with `TRUTH_VALIDATION_FAILED`

#### Scenario: Schema upgrade writes a new generation
- **WHEN** a truth schema upgrade is required
- **THEN** the writer SHALL create a new generation instead of mutating prior generation manifests in place

### Requirement: Truth writes require persistent local device identity
The system SHALL require one local-only persistent device identity for all truth families before writing truth.

#### Scenario: Device identity is available
- **WHEN** the runtime needs to write migration receipt, card-memory truth, or review-event truth
- **THEN** it SHALL use the truth-wide persistent local device id

#### Scenario: Device identity is local only
- **WHEN** the runtime persists the truth-wide device id
- **THEN** it SHALL store it outside synchronized petal truth storage

#### Scenario: Device identity unavailable fails closed
- **WHEN** a persistent local device id cannot be loaded or created
- **THEN** truth writes SHALL fail closed with `TRUTH_DEVICE_ID_UNAVAILABLE`

### Requirement: Multi-window authority gates truth and projection writes
The system SHALL allow only the active writer authority to append truth and update the projection DB.

#### Scenario: Writer commits truth and projection
- **WHEN** the active writer runtime handles a storage mutation
- **THEN** it SHALL append truth and update or invalidate the projection according to the storage transaction result

#### Scenario: Follower relays storage mutation
- **WHEN** a follower runtime receives a storage mutation request
- **THEN** it SHALL relay the command to the writer and SHALL NOT append truth or update the projection locally

#### Scenario: No writer available fails explicit
- **WHEN** a follower runtime cannot reach an active writer for a storage mutation
- **THEN** the command SHALL fail with explicit storage-unavailable diagnostics

### Requirement: Projection readiness gates Review and Browser
The system SHALL rebuild required projection indexes from truth and SHALL gate Review and Browser until card and review-event projection readiness is achieved.

#### Scenario: Required projection rebuild succeeds
- **WHEN** truth exists and required card plus review-event indexes can be rebuilt
- **THEN** Review and Browser SHALL open using the rebuilt projection

#### Scenario: Required projection rebuild fails
- **WHEN** card or review-event projection rebuild fails
- **THEN** Review and Browser SHALL remain unavailable and the runtime SHALL report `PROJECTION_REBUILD_FAILED`

#### Scenario: Optional projections rebuild later
- **WHEN** queue, arena, semantic, or other optional projections are stale during startup
- **THEN** the runtime MAY rebuild them in the background only if dependent surfaces remain explicitly refreshing or unavailable until ready

### Requirement: Storage failures are explicit and fail closed
The system SHALL surface storage initialization and migration failures with explicit error codes and SHALL NOT continue in a half-usable state.

#### Scenario: Truth migration fails
- **WHEN** legacy-to-truth migration fails
- **THEN** the plugin SHALL report storage unavailable with `LEGACY_MIGRATION_FAILED`

#### Scenario: Legacy source cannot be read
- **WHEN** required legacy source data cannot be read before truth exists
- **THEN** the plugin SHALL report storage unavailable with `SOURCE_READ_UNAVAILABLE`

#### Scenario: Projection rebuild fails
- **WHEN** required projection rebuild fails after truth loads
- **THEN** the plugin SHALL report storage unavailable with `PROJECTION_REBUILD_FAILED`

#### Scenario: Storage unavailable blocks active use
- **WHEN** storage initialization ends in a storage-unavailable error
- **THEN** the plugin SHALL refuse Review, Browser, and storage mutations until the error is repaired
