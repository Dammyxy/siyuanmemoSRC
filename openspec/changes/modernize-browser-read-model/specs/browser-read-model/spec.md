## ADDED Requirements

### Requirement: Browser Read Model exposes authoritative matched identity
The system SHALL expose a Browser Read Model that returns authoritative matched row identity, total count, read owner metadata, and query fingerprint or generation for deck, query, block-ID, and queue Browser views.

#### Scenario: Browser requests matched identity
- **WHEN** Browser requests a read-model snapshot for a supported view
- **THEN** the system SHALL return ordered row identities and total count from the declared read owner without requiring full Browser row hydration

#### Scenario: Browser owner metadata is visible
- **WHEN** Browser receives a read-model snapshot
- **THEN** the snapshot SHALL identify whether the owner was SQL card universe, queue projection, block-ID intersection, or an explicit local-queue policy

### Requirement: Browser Read Model hydrates requested rows by identity
The system SHALL hydrate full Browser rows only for requested row identities and SHALL preserve requested order for all found active rows.

#### Scenario: Page hydration preserves order
- **WHEN** Browser asks to hydrate a page of row identities
- **THEN** the system SHALL return full Browser rows in the requested order and SHALL NOT hydrate rows outside the requested identity set

#### Scenario: Missing rows are explicit
- **WHEN** requested row identities cannot be hydrated from the declared owner
- **THEN** the system SHALL return an explicit missing-row, unavailable, or refresh-required result and SHALL NOT silently replace them with stale local queue or legacy snapshot rows

### Requirement: Browser Read Model supports action targets without full-row scans
The system SHALL expose stable Browser action targets from snapshot lite rows or row-by-ID hydration without requiring full hydration of every matched row.

#### Scenario: Batch action target lookup
- **WHEN** Browser asks for action targets for selected row identities
- **THEN** the system SHALL return card ID, block ID, optional FSRS card ID, card type, and priority for the requested rows only

### Requirement: Browser Read Model carries source-existence state
The system SHALL represent source-existence state as part of Browser row read results while keeping source-existence refresh as explicit background work.

#### Scenario: Source-existence cache patches visible rows
- **WHEN** Browser hydrates visible rows and source-existence cache has known state for those block IDs
- **THEN** the system SHALL apply that known state to the returned rows without synchronously scanning every matched source block

#### Scenario: Source-existence refresh is not fallback
- **WHEN** source-existence refresh is scheduled for candidate block IDs
- **THEN** the read result SHALL remain based on the declared read owner and SHALL NOT treat refresh scheduling as a replacement read source

### Requirement: Browser Read Model fails closed for unsupported or unavailable owner reads
The system SHALL return explicit unsupported-query or unavailable diagnostics when the declared Browser read owner cannot serve the request.

#### Scenario: Unsupported filter shape
- **WHEN** Browser supplies a filter or sort shape that the declared read owner cannot express
- **THEN** the system SHALL return an explicit unsupported-query result or use a documented non-SQL/non-projection path identified in diagnostics

#### Scenario: Required owner unavailable
- **WHEN** a Browser view requires backend SQL or queue projection ownership and that owner is unavailable
- **THEN** the system SHALL return an explicit unavailable result and SHALL NOT silently read stale local queue or legacy snapshot data

### Requirement: Projection-backed queue Browser reads consume queue projection identity
The system SHALL read Browser queue snapshots for projection-backed queues from queue projection rows and hydrate Browser rows from projection-backed or SQL card-universe row hydration.

#### Scenario: Projection-backed queue avoids local queue cards
- **WHEN** Browser requests a queue snapshot for a queue declared projection-backed by rollout policy
- **THEN** the system SHALL read ordered row identities from queue projection storage and SHALL NOT call local `queue.getCards()` to build Browser rows

#### Scenario: Projection-backed queue reflects Review feedback
- **WHEN** Review feedback commits through worker-owned persistence and updates queue projection
- **THEN** a subsequent Browser queue read SHALL reflect the updated projection count and row identities from the same projection authority

#### Scenario: Local queue policy remains explicit
- **WHEN** Browser reads a queue that policy declares local-queue rather than projection-backed
- **THEN** the read result MAY use local queue cards and SHALL identify that owner as explicit local-queue policy
