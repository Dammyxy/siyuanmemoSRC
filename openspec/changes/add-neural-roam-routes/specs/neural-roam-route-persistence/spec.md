## ADDED Requirements

### Requirement: NeuralRoam route metadata is SQL-backed
NeuralRoam SHALL persist route metadata in SQL.

#### Scenario: Route metadata is written
- **WHEN** a route is created, renamed, saved, deleted, or used
- **THEN** the system SHALL persist route metadata through the backend/application SQL ownership path
- **AND** SHALL NOT write route metadata directly from UI code

#### Scenario: Routes are listed
- **WHEN** routes are listed for Review or SRS Browser
- **THEN** the system SHALL read route metadata from SQL
- **AND** SHALL order routes with the current temporary route first when present, `默认航线` next, and ordinary routes by `lastUsedAt desc`

### Requirement: NeuralRoam route pool entries are SQL-backed
NeuralRoam SHALL persist route concept pool and station entries in SQL.

#### Scenario: Concept pool entry is added
- **WHEN** a concept is added to the active route
- **THEN** the system SHALL upsert a SQL route pool entry with kind `seed`

#### Scenario: Station entry is added
- **WHEN** a station is established for the active route
- **THEN** the system SHALL upsert a SQL route pool entry with kind `anchor`

#### Scenario: Route pool entries are read
- **WHEN** Review or SRS Browser needs concept pool or station entries
- **THEN** the system SHALL read entries filtered by route ID and kind

### Requirement: NeuralRoam route history events are SQL-backed
NeuralRoam SHALL persist route history events in SQL for paged reads.

#### Scenario: Route history event is appended
- **WHEN** Orbit or Hyperspace activates a node
- **THEN** the system SHALL append a SQL route history event with route ID, event ID, engine mode, node ID, optional card ID, title, activation kind, optional source node, and visited timestamp

#### Scenario: Route history is paged
- **WHEN** SRS Browser reads a route log
- **THEN** the system SHALL return route history events by route ID using paged reads

#### Scenario: Route history exceeds limit
- **WHEN** appending a route history event would exceed the configured route history limit
- **THEN** the system SHALL prune oldest route history rows for that route

### Requirement: NeuralRoam engine session snapshots are SQL-backed
NeuralRoam SHALL persist per-route engine session snapshots in SQL.

#### Scenario: Orbit session changes
- **WHEN** Orbit navigation state changes for a route
- **THEN** the system SHALL persist that route's Orbit session snapshot

#### Scenario: Hyperspace session changes
- **WHEN** Hyperspace navigation state changes for a route
- **THEN** the system SHALL persist that route's Hyperspace session snapshot

#### Scenario: Route is restored
- **WHEN** a route becomes active
- **THEN** the system SHALL restore the route's shared pool entries and per-engine session snapshots from SQL

### Requirement: Legacy NeuralRoam state migrates to SQL routes
The system SHALL migrate existing NeuralRoam queue state into SQL route storage.

#### Scenario: Legacy state exists
- **WHEN** the system reads a legacy NeuralRoam persisted state
- **THEN** it SHALL create or update `默认航线`
- **AND** SHALL migrate legacy seed pool, station pool, engine mode, Orbit session, Hyperspace source/station data, and Hyperspace session into SQL route storage

#### Scenario: Migration completes
- **WHEN** legacy state has been migrated
- **THEN** new writes SHALL use the SQL-backed route model
- **AND** SHALL NOT runtime-dual-write to the old queue-state shape

### Requirement: Route SQL operations stay inside backend ownership boundaries
NeuralRoam route SQL reads and writes SHALL follow the existing backend/application persistence ownership rules.

#### Scenario: UI manages routes
- **WHEN** Review or SRS Browser creates, switches, renames, deletes, saves, or reads routes
- **THEN** UI code SHALL call application/backend route commands or services
- **AND** SHALL NOT access SQL tables directly

#### Scenario: Boundary checks run
- **WHEN** route persistence code is added
- **THEN** existing UI SQL and backend ownership boundary checks SHALL continue to pass
