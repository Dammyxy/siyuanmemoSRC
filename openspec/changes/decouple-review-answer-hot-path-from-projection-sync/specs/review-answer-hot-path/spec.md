## ADDED Requirements

### Requirement: Review answers advance from a session frontier
The system SHALL use a session frontier as the immediate authority for Review card switching after rating, skipping, or session-local card removal.

#### Scenario: Rating returns next card without waiting for backend maintenance
- **WHEN** a user rates the current Review card and the session frontier has another eligible card
- **THEN** the Review UI SHALL receive and display the next card without waiting for queue projection rebuild, domain sync merge, canonical storage repair, or Browser count refresh

#### Scenario: Session frontier has no next card
- **WHEN** a user answers the current Review card and the session frontier has no eligible next card
- **THEN** the Review UI SHALL show the session-complete or no-card state while backend commit and projection maintenance continue independently

#### Scenario: Projection unavailable during answer
- **WHEN** queue projection is unavailable, stale, or generation-mismatched during an ordinary Review answer
- **THEN** the session frontier SHALL still decide the next card if it has one and SHALL mark projection state as stale or refresh-required

### Requirement: Durable review commit is explicit and asynchronous from UI switching
The system SHALL persist Review answers through an idempotent commit queue whose pending, applied, failed, and retry states are visible to Review session diagnostics.

#### Scenario: Commit is pending after UI advances
- **WHEN** the Review UI advances to the next card before the durable backend commit completes
- **THEN** the session SHALL record a `commit-pending` state tied to the answered card and idempotency key

#### Scenario: Commit succeeds after UI advances
- **WHEN** the durable backend commit completes after the UI has advanced
- **THEN** the session SHALL mark the answered card commit as applied and SHALL NOT re-answer, duplicate review events, or rewind the visible current card

#### Scenario: Commit fails after UI advances
- **WHEN** the durable backend commit fails after the UI has advanced
- **THEN** the session SHALL surface `commit-failed` with retry or explicit repair diagnostics and SHALL NOT silently report the answer as durable

### Requirement: Review hot-path excludes sync, repair, and full projection rebuild
The system SHALL keep ordinary Review answer switching independent from full domain sync merge, storage canonical repair, and full queue projection materialization.

#### Scenario: Domain sync is divergent during ordinary answer
- **WHEN** domain sync diagnostics report divergence while the user answers a Review card
- **THEN** ordinary UI card switching SHALL continue from the session frontier and SHALL expose sync divergence diagnostics without running a full pre-answer merge

#### Scenario: Canonical storage repair is needed
- **WHEN** storage detects missing Xiuyuan bindings, canonical payload drift, or repairable card DTO inconsistency during Review
- **THEN** the Review answer hot path SHALL mark `repair-required` or schedule explicit repair work and SHALL NOT run hidden repair before switching cards

#### Scenario: Projection maintenance is slow
- **WHEN** projection maintenance takes longer than the Review switch budget
- **THEN** the UI switch timing SHALL remain within the session-frontier budget and projection timing SHALL be reported separately

### Requirement: Review performance diagnostics separate user switching from backend work
The system SHALL report separate timings for UI switch, session frontier answer, durable commit, projection maintenance, domain sync, and repair work.

#### Scenario: Worker commit is delayed
- **WHEN** a test or live run delays backend commit by at least two seconds
- **THEN** diagnostics SHALL show delayed commit timing separately from Review UI switch timing

#### Scenario: Projection maintenance is deferred
- **WHEN** projection maintenance is deferred after a Review answer
- **THEN** diagnostics SHALL show projection state as deferred or stale without inflating the UI switch duration
