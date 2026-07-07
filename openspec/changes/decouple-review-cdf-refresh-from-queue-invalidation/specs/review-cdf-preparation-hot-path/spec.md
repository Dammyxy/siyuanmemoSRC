## ADDED Requirements

### Requirement: Review CDF preparation avoids hidden queue creation
The system SHALL prepare CDF-related Review card evidence without synchronously creating unrelated queue Modules during ordinary Review scoring.

#### Scenario: Retrieval Practice scoring prepares a CDF card
- **WHEN** a user scores a card in the Retrieval Practice queue and the next card requires CDF preparation
- **THEN** the Review hot path SHALL NOT create or load FilterGroup, NeuralRoam, or other non-active queue Modules solely because of CDF preparation

#### Scenario: CDF preparation needs metadata repair
- **WHEN** CDF live-relation preparation detects metadata repair work while Review is switching cards
- **THEN** the system SHALL defer or report the repair work instead of synchronously writing card metadata before the next card is visible

### Requirement: Review CDF duplicate safety remains fail-closed
The system SHALL preserve current-card duplicate safety while keeping repair writes out of the scoring hot path.

#### Scenario: Current card is a noncanonical CDF duplicate
- **WHEN** CDF preparation evidence proves the currently visible Review card is a noncanonical duplicate
- **THEN** the Review session SHALL exit or skip that card before it is scored and SHALL NOT require unrelated queue Module creation to make that decision

#### Scenario: Duplicate repair requires writes
- **WHEN** duplicate reconciliation identifies write repair actions for cards other than the visible Review card
- **THEN** the Review hot path SHALL expose deferred repair evidence and SHALL NOT perform broad queue invalidation before card switching

### Requirement: Review CDF preparation diagnostics are separated
The system SHALL report CDF preparation, deferred repair, and queue-impact timings separately from Review answer switching.

#### Scenario: CDF repair is deferred
- **WHEN** Review card preparation defers CDF repair work
- **THEN** diagnostics SHALL include a deferred CDF repair marker without inflating the Review answer switch duration

#### Scenario: CDF preparation is slow
- **WHEN** CDF read preparation exceeds the Review switch budget
- **THEN** diagnostics SHALL attribute the delay to CDF preparation and SHALL NOT report it as Browser count refresh or unrelated queue refresh
