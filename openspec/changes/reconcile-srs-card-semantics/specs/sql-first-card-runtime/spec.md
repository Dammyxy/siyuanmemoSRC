## ADDED Requirements

### Requirement: SQL-backed semantic reconciliation persistence
The system SHALL persist committed SRS semantic repairs through the SQL-first card runtime when SQL persistence owns active card rows and projection evidence.

#### Scenario: Semantic repair updates SQL card row
- **WHEN** semantic reconciliation commits a deterministic repair for a SQL-owned card
- **THEN** the system SHALL update the SQL card row fields needed for Browser, Review, Queue counters, and semantic resolution before reporting repair success

#### Scenario: Semantic repair updates projection evidence
- **WHEN** semantic reconciliation changes a card's effective semantic kind in SQL-owned storage
- **THEN** the system SHALL update or invalidate affected SQL projection evidence so Browser and Queue reads do not continue showing the stale kind

#### Scenario: Semantic repair writes receipt
- **WHEN** semantic reconciliation commits one or more SQL-owned repairs
- **THEN** the system SHALL write durable repair receipt evidence containing repaired, skipped, ambiguous, and failed counts with per-card diagnostics

#### Scenario: SQL repair failure fails closed
- **WHEN** SQL persistence fails while applying a semantic repair
- **THEN** the system SHALL return an explicit repair-unavailable diagnostic and SHALL NOT report hidden partial success

### Requirement: SQL audit reads semantic repair candidates without legacy snapshot fallback
The system SHALL read semantic repair candidates from SQL-first active card data when SQL persistence is available and SHALL NOT use retired legacy snapshot storage as an active repair source.

#### Scenario: Audit uses SQL card universe
- **WHEN** semantic reconciliation audits a library with SQL persistence available
- **THEN** the system SHALL read candidate active cards and their projection evidence from the SQL card universe

#### Scenario: Audit does not import retired snapshot
- **WHEN** SQL semantic audit cannot read required SQL data
- **THEN** the system SHALL return explicit unavailable diagnostics and MUST NOT decode or import retired unified-card snapshot storage

