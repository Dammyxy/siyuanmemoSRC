## ADDED Requirements

### Requirement: SQL migration imports DTO-only legacy cards
The system SHALL import active legacy cards from the canonical legacy card DTO set during initial SQL migration, even when the legacy `cards` map is empty, stale, or incomplete.

#### Scenario: Legacy store has DTOs but no domain cards
- **WHEN** initial SQL migration reads a legacy unified store where `cardDTOs` contains active cards and `cards` is empty
- **THEN** the system SHALL import those cards into SQL with both `payload_json` and `dto_json` populated

#### Scenario: Legacy DTO is preferred over stale domain card
- **WHEN** initial SQL migration reads a legacy unified store where `cardDTOs` and `cards` disagree for the same card identity
- **THEN** the SQL row SHALL preserve the canonical DTO-derived card semantics rather than stale domain-card metadata

#### Scenario: Malformed DTO import fails closed with backup
- **WHEN** a legacy DTO cannot be converted into a valid persisted SQL card during initial migration
- **THEN** migration SHALL fail closed after writing the legacy backup and SHALL NOT mark the initial SQL migration complete

### Requirement: SQL persistence preserves protected card semantic payload
The system SHALL persist protected card semantic payload in SQL full payload columns and SHALL NOT rely on projection columns as the only source of card semantics.

#### Scenario: SQL row keeps stable review-instance locator
- **WHEN** a card has `faceKey`
- **THEN** SQL full payload columns SHALL preserve `faceKey`
- **AND** hydration SHALL restore `faceKey` even when legacy `meta.faceIndex` or `meta.typeMarker` are also present for compatibility

#### Scenario: SQL row keeps full semantic payload
- **WHEN** a card with custom semantic metadata is written to SQL
- **THEN** the row SHALL preserve full semantic payload in `dto_json` and `payload_json` in addition to any projection columns

#### Scenario: SQL hydration restores semantic payload
- **WHEN** a card with protected semantic payload is read from SQL
- **THEN** the hydrated card SHALL restore protected semantic payload from the full JSON payload rather than from projection columns alone
