## ADDED Requirements

### Requirement: Projection-backed review entry admission
The system SHALL admit projection-backed review sessions through a single Review Admission Module before opening Review UI or worker session state.

#### Scenario: Topbar and Browser toolbar share admission
- **WHEN** a user starts Retrieval Practice from either topbar or Browser toolbar
- **THEN** the system obtains review session projection identity through the same admission module before constructing the Review session

#### Scenario: Admission refreshes stale projection
- **WHEN** queue projection readiness reports refreshing, stale, or unavailable-but-recoverable state for a projection-backed Review queue
- **THEN** the system materializes the queue projection and verifies a ready policy hash and generation before opening Review

#### Scenario: Admission blocks unreadable projection
- **WHEN** admission cannot produce a ready projection policy hash and generation
- **THEN** the system SHALL fail closed and not open the Review session from stale rows

### Requirement: Explicit projection ticket for worker Review sessions
The system SHALL pass the admitted projection policy hash and generation from Review entry to worker `review.session.start`.

#### Scenario: Worker reads admitted projection
- **WHEN** worker `review.session.start` receives an admission ticket
- **THEN** it reads queue rows using the ticket policy hash and generation instead of reading the current generation by queue type

#### Scenario: Missing ticket fails closed
- **WHEN** worker-backed Retrieval Practice or Incremental Learning session start lacks a valid projection ticket
- **THEN** the session start SHALL return unavailable or throw an explicit admission error rather than selecting a stale projection implicitly
