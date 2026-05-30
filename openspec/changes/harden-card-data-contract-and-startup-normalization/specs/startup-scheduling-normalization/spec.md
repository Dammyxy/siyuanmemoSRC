## ADDED Requirements

### Requirement: Startup accepts valid empty scheduling memory
The system SHALL treat empty FSRS memory for an unreviewed non-review card as valid scheduling state during startup load, normalization, and SQL persistence.

#### Scenario: New card with empty memory does not abort startup
- **WHEN** startup scheduling normalization persists a card DTO with `state = New`, `reps = 0`, `lastReview = 0`, `stability = 0`, and `difficulty = 0`
- **THEN** SQL persistence SHALL accept the DTO as valid empty memory
- **AND** plugin initialization SHALL NOT fail with `Invalid difficulty: must be between 1 and 10`

#### Scenario: Empty memory is preserved as empty
- **WHEN** a valid unreviewed card has `difficulty = 0` and `stability = 0`
- **THEN** normalization SHALL NOT clamp difficulty to `1`
- **AND** the persisted card SHALL remain distinguishable from a reviewed card with established FSRS memory

### Requirement: Reviewed cards keep strict FSRS memory validation
The system SHALL reject or repair invalid reviewed FSRS memory and SHALL NOT treat empty review-state memory as valid merely because new-card empty memory is allowed.

#### Scenario: Review card with empty memory is invalid
- **WHEN** startup or SQL persistence sees an effective `fsrs-v6` card DTO with `state = Review` and `difficulty = 0` or `stability = 0`
- **THEN** the system SHALL route it through the existing scheduling repair/diagnostic path or return an explicit validation error
- **AND** it SHALL NOT silently persist the dirty review-state memory as valid

#### Scenario: A-Factor review-state cards do not require FSRS memory
- **WHEN** startup scheduling normalization persists an effective `a-factor-v2` Topic or Concept DTO with `state = Review`, valid topic scheduler metadata, and empty FSRS projection memory such as `stability = 0`
- **THEN** SQL persistence SHALL accept the DTO because A-Factor state owns the scheduling memory
- **AND** startup SHALL NOT synthesize fake positive FSRS `stability` merely to satisfy FSRS Review validation

#### Scenario: Out-of-range difficulty remains invalid
- **WHEN** a card DTO has negative difficulty or difficulty greater than `10`
- **THEN** SQL persistence SHALL reject the row or repair it only through a documented scheduling canonicalization rule
- **AND** the diagnostic SHALL include the affected card id and invalid field

### Requirement: Startup normalization failure is card-scoped and diagnostic
The system SHALL report unrecoverable scheduling normalization persistence failures with card-scoped diagnostics and SHALL avoid hiding persistence failure behind silent fallback.

#### Scenario: Unrecoverable DTO reports exact row
- **WHEN** startup scheduling normalization cannot persist because a DTO is unrecoverable
- **THEN** the emitted error SHALL include the card id and validation reasons
- **AND** startup SHALL fail closed rather than pretending normalization succeeded

#### Scenario: Recoverable DTO does not block unrelated startup
- **WHEN** all dirty scheduling rows are recoverable by canonicalization or valid empty-memory rules
- **THEN** startup normalization SHALL persist the repaired store
- **AND** ApplicationContext creation SHALL continue
