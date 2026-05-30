## ADDED Requirements

### Requirement: SQL DTO validation follows scheduling-state semantics
The SQL-first card runtime SHALL validate card DTO scheduling fields using the same empty-memory and review-memory semantics used by scheduling normalization and algorithm card state diagnostics.

#### Scenario: SQL save accepts valid unreviewed empty memory
- **WHEN** SQL persistence saves an unreviewed non-review card DTO with `difficulty = 0` and `stability = 0`
- **THEN** SQL validation SHALL accept the DTO as valid empty scheduling memory
- **AND** the SQL card universe SHALL preserve that empty-memory state

#### Scenario: SQL save rejects dirty reviewed memory
- **WHEN** SQL persistence saves an effective `fsrs-v6` reviewed card DTO whose FSRS memory is empty or outside valid bounds
- **THEN** SQL validation SHALL reject the DTO or require a scheduling canonicalization repair before save
- **AND** the error SHALL identify the card id and invalid scheduling fields

#### Scenario: SQL save accepts A-Factor review state with empty FSRS projection
- **WHEN** SQL persistence saves an effective `a-factor-v2` Topic or Concept card in review-like state with valid `aFactor` / `schedulerMeta.topic` state and `stability = 0`
- **THEN** SQL validation SHALL preserve the A-Factor scheduling state
- **AND** it SHALL NOT invent positive FSRS memory for compatibility columns
