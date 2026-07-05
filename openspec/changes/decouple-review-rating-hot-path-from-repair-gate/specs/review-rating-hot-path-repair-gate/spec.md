## ADDED Requirements

### Requirement: Review rating consumes a repair gate
The system SHALL require ordinary Review rating feedback to consume an explicit Review-session repair gate decision instead of running full domain-sync repair or merge per rating.

#### Scenario: Rating proceeds with clean gate
- **WHEN** `review.session.feedback` receives an ordinary rating for the current session card and the Review-session repair gate is `clean`
- **THEN** the system SHALL apply the rating without running full domain-sync repair or merge as a pre-request side effect

#### Scenario: Rating proceeds with accepted repairable gate
- **WHEN** `review.session.feedback` receives an ordinary rating for the current session card and the Review-session repair gate is `accepted-repairable`
- **THEN** the system SHALL apply the rating without running full domain-sync repair or merge as a pre-request side effect

#### Scenario: Rating blocks without valid gate
- **WHEN** `review.session.feedback` receives an ordinary rating and no valid Review-session repair gate decision is available
- **THEN** the system SHALL fail closed with a typed unavailable or conflict result instead of running hidden repair work inside the rating click

### Requirement: Repair gate preserves conflict safety
The system SHALL block Review rating when the repair gate or current-card evidence indicates unresolved divergence that can affect the rated card.

#### Scenario: Blocking divergence prevents rating
- **WHEN** the repair gate state is `blocking`
- **THEN** `review.session.feedback` SHALL reject the rating with typed diagnostics and SHALL NOT commit a scheduler update or review event

#### Scenario: Current-card conflict prevents rating
- **WHEN** current-card diagnostics prove unresolved divergence for the card being rated
- **THEN** `review.session.feedback` SHALL reject the rating with typed current-card conflict diagnostics

#### Scenario: Unrelated repairable drift does not block rating
- **WHEN** diagnostics contain repairable drift that does not affect the current Review card and the gate has accepted that state for the session
- **THEN** the system SHALL allow ordinary rating and SHALL keep repairability visible outside the hot path

### Requirement: Repair work occurs outside the rating click
The system SHALL route repairable domain-sync merge and repair work through explicit lifecycle points outside ordinary Review rating feedback.

#### Scenario: Review preflight creates gate
- **WHEN** a Review session starts or resumes
- **THEN** the system SHALL evaluate domain-sync diagnostics sufficiently to create a repair gate decision before repeated rating clicks

#### Scenario: Explicit repair may run merge
- **WHEN** the user triggers repair, diagnostics, or manual sync resolution
- **THEN** the system MAY run full domain-sync merge or repair outside ordinary `review.session.feedback`

#### Scenario: Ordinary rating does not schedule hidden repair
- **WHEN** an ordinary rating consumes a valid repair gate
- **THEN** the system SHALL NOT perform hidden repair, full merge, or best-effort canonicalization before returning the feedback result

### Requirement: Hot-path diagnostics expose repair gate evidence
The system SHALL expose copyable timing diagnostics that prove whether ordinary Review rating skipped or ran pre-request merge and why.

#### Scenario: Merge skipped by gate
- **WHEN** ordinary `review.session.feedback` skips pre-request merge because a valid repair gate permits rating
- **THEN** the slow or diagnostic summary SHALL include skip evidence and the repair-gate reason

#### Scenario: Merge runs for explicit reason
- **WHEN** pre-request merge runs before a Review-related RPC
- **THEN** diagnostics SHALL state whether the reason was blocking gate, missing/stale gate, explicit repair/diagnostics command, or non-rating method

#### Scenario: Rating budget measured without repair
- **WHEN** validating the Review rating hot path with injected repairable drift and a valid gate
- **THEN** timing evidence SHALL attribute rating latency to rating commit/advance work rather than repairable domain-sync merge
