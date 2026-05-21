## ADDED Requirements

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
The system SHALL restrict binary snapshot and legacy storage reads to explicit migration, recovery, compatibility, or not-yet-migrated paths and SHALL keep active SQL-first hot paths free of hidden legacy fallback.

#### Scenario: Active SQL-first path cannot silently read binary snapshot
- **WHEN** an active SQL-first Browser, Queue, NeuralRoam, or Review mutation path encounters SQL unavailability
- **THEN** the system SHALL return explicit unavailable diagnostics instead of silently reading `unified-cards.msgpack`

#### Scenario: Migration path can read legacy snapshot
- **WHEN** startup or explicit migration imports data from legacy binary storage
- **THEN** the system MAY read legacy snapshot data and SHALL identify the read as migration or recovery behavior in code and tests
