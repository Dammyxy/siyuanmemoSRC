## ADDED Requirements

### Requirement: New undo journals persist compact ordered frontiers
The system SHALL persist new worker-backed Review undo journal entries with schema-versioned identity frontiers rather than complete queued-card snapshots.

#### Scenario: Rating records identity frontier
- **WHEN** a worker-backed Review rating records undo evidence for an ordered session frontier
- **THEN** each persisted frontier SHALL contain the ordered remaining card IDs, current card ID and block ID, avoid-once IDs, and projection metadata
- **AND** the frontier SHALL NOT contain complete queued or current card objects
- **AND** complete reviewed-card `beforeCard` and `afterCard` schedule evidence SHALL remain available in the journal entry

#### Scenario: Skip records identity frontier
- **WHEN** a worker-backed Review skip records undo evidence
- **THEN** it SHALL use the same compact frontier schema and ordered identity semantics as rating undo evidence

### Requirement: Compact frontier restoration uses authoritative cards
The system SHALL restore a compact Review session frontier by hydrating its recorded identities from the authoritative SQLite card repository.

#### Scenario: Restart-safe undo restores exact session order
- **WHEN** undo consumes a compact journal after the in-memory Review session has been lost
- **THEN** the system SHALL restore the reviewed card's before schedule before frontier hydration when necessary
- **AND** it SHALL hydrate all recorded identities from SQLite in their recorded order
- **AND** current card, lookahead, avoid-once state, counters, and projection metadata SHALL match the recorded pre-answer frontier
- **AND** Browser projection SHALL NOT provide card or order authority

#### Scenario: Missing card fails closed
- **WHEN** any required compact frontier card cannot be hydrated from SQLite
- **THEN** undo SHALL fail with an explicit unavailable or invalid-evidence diagnostic
- **AND** the system SHALL NOT install a partial in-memory session frontier

#### Scenario: Current block identity mismatch fails closed
- **WHEN** the hydrated current card's block ID does not match the recorded current block ID
- **THEN** undo SHALL fail closed before replacing the session frontier

### Requirement: Legacy full-card journals remain readable
The system SHALL support already-persisted schema-v1 Review undo journal entries through a one-way normalization boundary.

#### Scenario: Valid v1 journal is normalized
- **WHEN** undo reads a valid schema-v1 journal containing complete frontier cards
- **THEN** the journal boundary SHALL derive the ordered IDs and current identity metadata
- **AND** the session runtime SHALL restore it through the same authoritative hydration path as schema v2

#### Scenario: Malformed legacy journal is rejected
- **WHEN** a schema-v1 frontier lacks a valid required card identity
- **THEN** normalization SHALL fail explicitly
- **AND** no schedule, ledger, projection, or session mutation SHALL be reported as a successful undo

### Requirement: Representative Review feedback stays within the delta budget
The system SHALL keep the serialized SQLite delta entry for a representative 113-card Review feedback mutation below 65,536 bytes.

#### Scenario: Representative rating meets budget
- **WHEN** a Review feedback transaction includes a schema-v2 undo journal for a representative 113-card session
- **THEN** the serialized SQLite delta entry, including changes and mutation-envelope evidence, SHALL be less than 65,536 bytes
- **AND** the entry SHALL retain complete reviewed-card before/after schedule evidence
