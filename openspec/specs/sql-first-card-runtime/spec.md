# sql-first-card-runtime Specification

## Purpose
Defines SQL-first card runtime ownership, rebuildability, and unavailable/fail-closed behavior for Browser, Queue, Review, NeuralRoam, Xiuyuan, and legacy-storage retirement.
## Requirements
### Requirement: SQL-first Browser card universe reads
The system SHALL expose Browser deck pages, matched card IDs, row hydration by ID, Browser stats, and source-existence status from the SQL card universe when SQL persistence is available.

#### Scenario: Browser deck page uses SQL authority
- **WHEN** Browser requests a deck page with SQL persistence available
- **THEN** the system SHALL return total count and page rows from the SQL card universe without scanning all cards from binary snapshot storage

#### Scenario: Browser hydrate by IDs preserves requested order
- **WHEN** Browser requests rows by a list of card IDs or row IDs
- **THEN** the system SHALL hydrate rows from the SQL card universe and preserve the requested order for all found active cards

#### Scenario: Browser excludes missing source rows from normal views
- **WHEN** a card has `source_exists = 0` in SQL and Browser requests a normal deck view
- **THEN** the system SHALL exclude that card from normal active-card results and expose it only through explicit lost/missing-source views

### Requirement: Explicit SQL expressibility and unavailable diagnostics
The system SHALL make SQL expressibility and unavailability explicit at the read Module Interface instead of silently falling back to full snapshot scans for active SQL-first paths.

#### Scenario: SQL cannot express a Browser query
- **WHEN** a Browser query contains filters that the SQL-first read Module cannot express
- **THEN** the system SHALL return an explicit unsupported-query result or route through a documented non-SQL path with diagnostics

#### Scenario: SQL read fails for required path
- **WHEN** SQL persistence is required for a Browser or card-universe read and the SQL read fails
- **THEN** the system SHALL return an unavailable diagnostic or fail-closed error instead of silently reading stale snapshot data

### Requirement: Queue projection read Module
The system SHALL expose Queue Projection Readiness, projection rows, projection card hydration, and projection counters through one read Module Interface consumed by Browser Queue View Lifecycle and Review queues.

#### Scenario: Queue rows read from projection storage
- **WHEN** a projection-backed queue is readable
- **THEN** Browser and Review SHALL read queue rows and counters from backend projection storage using the same projection identity

#### Scenario: Projection hydration detects missing cards
- **WHEN** projection rows reference cards that cannot be hydrated from the SQL card universe
- **THEN** the system SHALL return an explicit projection-unavailable or refresh-required result and SHALL NOT silently continue with incomplete rows

#### Scenario: Local queue path remains explicit
- **WHEN** a queue is not yet declared projection-backed by rollout policy
- **THEN** the system MAY use the existing local queue strategy, but diagnostics SHALL mark the read path as local queue rather than backend projection

### Requirement: SQL-first review card mutation persistence
The system SHALL provide a SQL-first mutation persistence path for review-facing card updates that commits card state, sync metadata, and queue projection invalidation or patch decisions as one observable result.

#### Scenario: Review mutation updates SQL card state
- **WHEN** a review-facing mutation updates scheduling state for a card in a SQL-first slice
- **THEN** the system SHALL persist the updated card state to SQL before reporting mutation success

#### Scenario: Mutation invalidates or patches queue projection
- **WHEN** a SQL-first review mutation changes card membership, due state, source existence, or priority fields used by queue projection
- **THEN** the system SHALL return projection impact that invalidates or patches affected queue projection reads

#### Scenario: Mutation failure does not leave hidden partial success
- **WHEN** SQL-first mutation persistence fails after local Review transaction state was prepared
- **THEN** the system SHALL surface failure to the Review Transaction Safety Envelope so compensation can restore visible session state

### Requirement: NeuralRoam card facts use SQL card universe
The system SHALL resolve NeuralRoam card facts such as concept-card identity, card type, priority, active-source status, and card IDs from the SQL card universe when SQL persistence is available.

#### Scenario: Concept-card identity reads from SQL
- **WHEN** NeuralRoam checks whether a node is a concept card and SQL persistence is available
- **THEN** the system SHALL determine card identity from SiYuanMemo SQL card records rather than querying a legacy SiYuan `fsrs_cards` table

#### Scenario: Graph structure may still use SiYuan block data
- **WHEN** NeuralRoam builds graph edges from backlinks, refs, block tree, or document tree
- **THEN** the system MAY query SiYuan block/ref APIs for graph structure while using SQL for SiYuanMemo card facts

#### Scenario: Missing SQL card facts are not replaced by legacy table facts
- **WHEN** SQL card-universe lookup reports a node is not a managed active card
- **THEN** NeuralRoam SHALL NOT treat a legacy `fsrs_cards` lookup as authoritative for active runtime card identity

### Requirement: Xiuyuan SQL persistence adapter
The system SHALL provide a SQL-first Xiuyuan persistence adapter for repository reads and later sync change application while preserving Xiuyuan aggregate semantics from ADR-004.

#### Scenario: Xiuyuan lookup by ID uses SQL adapter
- **WHEN** Xiuyuan repository reads by Xiuyuan ID and SQL persistence is available for the adapter
- **THEN** the system SHALL load the Xiuyuan aggregate from SQL without requiring a full `UnifiedStorageManager` card-store scan

#### Scenario: Xiuyuan lookup by block ID uses indexed data
- **WHEN** Xiuyuan repository reads by block ID and SQL persistence is available for the adapter
- **THEN** the system SHALL use indexed SQL card/Xiuyuan data to locate matching aggregates

#### Scenario: Xiuyuan domain invariants remain stable
- **WHEN** a Xiuyuan aggregate is loaded through SQL-first persistence
- **THEN** the aggregate SHALL preserve faces, card IDs, template ID, block IDs, ownership metadata, and scheduling links expected by ADR-004

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
### Requirement: SQL-first optimization is backed by runtime profile evidence
The system SHALL require real-database Runtime SQL profile evidence before adding indexes, replacing active read Interfaces, or retiring old compatibility paths for SQL-first card runtime surfaces.

#### Scenario: Optimization follows measured bottleneck
- **WHEN** a SQL-first Browser, Queue Projection, Review feedback, or Xiuyuan path is proposed for optimization
- **THEN** the change SHALL reference Runtime SQL profile evidence showing the measured bottleneck, query plan, or budget failure that justifies the optimization

#### Scenario: No profile bottleneck means no speculative index
- **WHEN** the Runtime SQL profile shows a SQL-first path is within budget and its query plan is acceptable
- **THEN** the system SHALL NOT add a new index or read Interface solely as speculative cleanup
