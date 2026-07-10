## MODIFIED Requirements

### Requirement: Review session advancement is application-owned
The system SHALL provide focused application-level Review session advancement Modules behind `UnifiedQueueStrategy` so Review callers consume one SRS Review Kernel result and do not need to know transaction stages, projection patching, rollback, Learn Ahead, NeuralRoam backend-advance policy, or temporary Semantic one-card review suppression details.

#### Scenario: strategy remains the Review-facing adapter
- **WHEN** Review UI or `UnifiedReviewAdapter` requests next-card, feedback, skip, back, snapshot, restore, Learn Ahead behavior, or temporary Semantic one-card review behavior
- **THEN** `UnifiedQueueStrategy` remains the public Adapter while delegating worker-backed commands to the SRS Review Kernel and non-kernel local advancement to focused Modules

#### Scenario: committed receipt advances runtime-backed session
- **WHEN** a runtime-backed Review answer returns a committed SRS Review Kernel result
- **THEN** SessionQueueIndex consumes updated card, queue impact, counter, undo, and next-item evidence without reconstructing transaction stages

#### Scenario: failed receipt preserves visible state
- **WHEN** the SRS Review Kernel returns conflict, unavailable, or durability failure
- **THEN** session advancement preserves or restores current visible state according to the explicit failure outcome and MUST NOT perform local schedule commit

#### Scenario: temporary Semantic review does not advance original queue
- **WHEN** a user scores a flashcard opened through Semantic temporary review while another Review queue item remains active
- **THEN** the system commits formal scheduling for the temporary card and returns to the original Review item without advancing the original queue

#### Scenario: temporary Semantic review suppresses duplicate current-session item
- **WHEN** a card scored through Semantic temporary review would later appear in the original Review session
- **THEN** the Review session advancement policy suppresses that card for the current session while preserving normal future queue calculation

### Requirement: Projection-backed Review advancement uses one patch-refresh policy
The system SHALL keep projection patch-refresh policy for non-runtime-backed Review sessions and background projection maintenance while runtime-backed Retrieval Practice and Incremental Learning advancement remains owned by SessionQueueIndex after session start.

#### Scenario: non-runtime projection patch applies
- **WHEN** a non-runtime-backed Review commit returns `projectionAction.status = patch-applied` with compatible projection impact
- **THEN** the projection advancement policy applies the session cache patch without forcing full reload

#### Scenario: non-runtime projection refresh is required
- **WHEN** a non-runtime-backed Review commit returns `refresh-required`, `generation-mismatch`, `unavailable`, or incompatible projection impact
- **THEN** the projection advancement policy returns refresh-required so the caller uses explicit Queue Projection Lifecycle repair

#### Scenario: runtime-backed answer commits while projection is unavailable
- **WHEN** Retrieval Practice or Incremental Learning has started through Review Admission and its SRS Review Kernel answer commits while BrowserProjectionIndex is refreshing or unavailable
- **THEN** SessionQueueIndex advances from worker session state and projection maintenance remains deferred/background

#### Scenario: static subset review ignores global projection patch
- **WHEN** a static subset Review queue declares local queue read policy while global FilterGroup or FinalDrill projection is enabled
- **THEN** the projection advancement policy does not apply global projection patch data to that static subset session
