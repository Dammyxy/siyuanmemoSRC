## ADDED Requirements

### Requirement: SQL-first Review session feedback is repair-gate scoped
The system SHALL scope SQL-first Review session feedback to a valid repair gate so ordinary rating does not require full domain-sync pre-request merge.

#### Scenario: SQL-first rating uses gate instead of full merge
- **WHEN** SQL-first `review.session.feedback` receives an ordinary rating and the active Review-session repair gate is valid
- **THEN** the system SHALL use the gate decision for sync safety and SHALL NOT require full pre-request domain-sync merge before applying the rating

#### Scenario: SQL-first rating still commits durable truth
- **WHEN** SQL-first `review.session.feedback` applies a rating through a valid repair gate
- **THEN** the system SHALL still persist the scheduler update, review event, sync metadata, and projection impact evidence required by SQL-first mutation persistence

#### Scenario: SQL-first rating fails closed on unsafe gate
- **WHEN** SQL-first `review.session.feedback` receives an ordinary rating and the repair gate is missing, stale, blocking, or unavailable
- **THEN** the system SHALL return typed unavailable or conflict diagnostics instead of falling back to snapshot storage or local follower writes
