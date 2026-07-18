## ADDED Requirements

### Requirement: Review session feedback has non-blocking truth host effects
The system SHALL apply the Review feedback non-blocking domain-sync and truth host-effect contract to `review.session.feedback` as well as legacy `review.feedback`.

#### Scenario: Session feedback commits while truth publication is pending
- **WHEN** a Review session feedback request has valid session identity, card identity, writer authority, and durable mutation inputs
- **THEN** pending truth publication or passive domain-sync convergence work does not block or replace the session feedback commit

#### Scenario: Session feedback is the active worker timing scope
- **WHEN** the backend worker is handling `review.session.feedback`
- **THEN** host-effect suppression logic classifies the active request as protected Review feedback
