## ADDED Requirements

### Requirement: Slow Review session feedback exposes narrow session steps
The system SHALL include narrow `review.session.feedback` session-step timings in the existing slow worker summary when total session feedback time crosses the slow threshold, even when individual substeps are below the per-step slow threshold.

#### Scenario: Slow total flushes sub-threshold session steps
- **WHEN** a worker-backed Review feedback request has a slow `session-feedback-total`
- **THEN** the slow worker timing summary SHALL include measured session substeps such as preflight, commit, advance, undo-journal append, and state shaping

#### Scenario: Fast total remains quiet
- **WHEN** a worker-backed Review feedback request completes below the slow total threshold
- **THEN** the system SHALL NOT emit additional session substep timing entries solely for that fast request

### Requirement: Slow Review session feedback reports unattributed gap
The system SHALL report a `session-feedback-unattributed-gap` timing entry when total session feedback time materially exceeds the sum of measured session substeps.

#### Scenario: Slow total has unexplained time
- **WHEN** measured session substeps and host effects do not explain slow `review.session.feedback` total time
- **THEN** the slow worker timing summary SHALL include `session-feedback-unattributed-gap` with the unexplained duration

#### Scenario: Slow total is explained by measured work
- **WHEN** measured session substeps explain the slow `review.session.feedback` total time
- **THEN** the system SHALL NOT report a misleading positive unattributed gap
