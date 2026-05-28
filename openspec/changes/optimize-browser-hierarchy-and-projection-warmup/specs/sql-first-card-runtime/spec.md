## MODIFIED Requirements

### Requirement: SQL-first Browser card universe reads
The system SHALL expose Browser deck pages, matched card IDs, row hydration by ID, Browser stats, source-existence status, and document hierarchy count reads from the SQL card universe when SQL persistence is available.

#### Scenario: Browser deck page uses SQL authority
- **WHEN** Browser requests a deck page with SQL persistence available
- **THEN** the system SHALL return total count and page rows from the SQL card universe without scanning all cards from binary snapshot storage

#### Scenario: Browser hydrate by IDs preserves requested order
- **WHEN** Browser requests rows by a list of card IDs or row IDs
- **THEN** the system SHALL hydrate rows from the SQL card universe and preserve the requested order for all found active cards

#### Scenario: Browser document hierarchy counts use SQL authority
- **WHEN** Browser requests document/root counts for a SQL-first deck, global, or supported query view
- **THEN** the system SHALL return count-only root rows from the SQL card universe and SHALL NOT hydrate every matching Browser row to compute counts

#### Scenario: Browser excludes missing source rows from normal views
- **WHEN** a card has `source_exists = 0` in SQL and Browser requests a normal deck view
- **THEN** the system SHALL exclude that card from normal active-card results and expose it only through explicit lost/missing-source views

### Requirement: Queue projection read Module
The system SHALL expose Queue Projection Readiness, projection rows, projection card hydration, projection counters, Browser Read Model queue snapshot data, and projection-backed document hierarchy count reads through one read Module Interface consumed by Browser Queue View Lifecycle and Review queues.

#### Scenario: Queue rows read from projection storage
- **WHEN** a projection-backed queue is readable
- **THEN** Browser and Review SHALL read queue rows and counters from backend projection storage using the same projection identity

#### Scenario: Browser queue snapshot uses projection owner
- **WHEN** Browser requests matched row identity or count for a projection-backed queue
- **THEN** the Browser Read Model SHALL read projection rows from backend projection storage and SHALL NOT build Browser queue rows from local `queue.getCards()`

#### Scenario: Browser queue document counts use projection owner
- **WHEN** Browser requests document/root counts for a projection-backed queue
- **THEN** the Browser Read Model SHALL compute counts from projection-backed row identity and SQL card-universe root IDs under the same projection identity

#### Scenario: Projection readiness can be prewarmed
- **WHEN** Browser asks to prepare a projection-backed queue before user selection
- **THEN** Queue Projection Readiness SHALL return ready, refreshing, or unavailable metadata without requiring Browser to attach a datasource or read local queue cards

#### Scenario: Projection hydration detects missing cards
- **WHEN** projection rows reference cards that cannot be hydrated from the SQL card universe
- **THEN** the system SHALL return an explicit projection-unavailable or refresh-required result and SHALL NOT silently continue with incomplete rows

#### Scenario: Local queue path remains explicit
- **WHEN** a queue is not yet declared projection-backed by rollout policy
- **THEN** the system MAY use the existing local queue strategy, but diagnostics SHALL mark the read path as local queue rather than backend projection
