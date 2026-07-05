## ADDED Requirements

### Requirement: Domain sync repair preview stays available
The system SHALL build a domain sync repair preview without throwing when repairable review/card divergence exists.

#### Scenario: Repair preview hashes plan and fingerprints
- **WHEN** worker SQLite domain sync repair preview scans repairable card evidence
- **THEN** it returns a preview result with a stable plan id, scheduler evidence, and persisted plan metadata instead of throwing a missing hash-method error

### Requirement: Review safety blocks only actionable sync risk
The system SHALL block Review for source errors, direction conflicts, divergent ledger state, or repairable review-history drift that can affect the current Review card.

#### Scenario: Reps-only repairable drift does not block Review
- **WHEN** domain sync diagnostics report only `review-event-count-exceeds-card-reps` repairable divergence
- **THEN** Review safety allows Review while keeping repair diagnostics available

#### Scenario: Current-card newer review history blocks Review
- **WHEN** domain sync diagnostics report `review-history-newer-than-card-state` for the current Review card
- **THEN** Review safety blocks Review until repair or conflict handling resolves the risk

#### Scenario: Other-card newer review history does not block current Review
- **WHEN** domain sync diagnostics report newer review history only for cards other than the current Review card
- **THEN** Review safety allows the current Review action
