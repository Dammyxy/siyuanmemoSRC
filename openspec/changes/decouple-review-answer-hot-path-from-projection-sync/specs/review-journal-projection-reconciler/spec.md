## ADDED Requirements

### Requirement: Review projection maintenance is not a switching dependency
The system SHALL reconcile Review journal entries and queue projection rows without requiring projection replacement or rebuild to complete before the Review UI switches to the next session card.

#### Scenario: Journal entry waits for projection maintenance
- **WHEN** a durable Review answer has been accepted and projection maintenance is still pending
- **THEN** the Review UI SHALL keep the advanced session card visible and the reconciler SHALL later apply or repair projection state from durable evidence

#### Scenario: Projection maintenance is unavailable
- **WHEN** projection dependencies are unavailable after a Review answer
- **THEN** the reconciler SHALL leave an explicit stale or refresh-required state and SHALL NOT cause Review switching to fall back to legacy local queue state

### Requirement: Reconciler consumes async commit evidence
The system SHALL let the Review journal projection reconciler consume asynchronously applied Review commit evidence without duplicating review events or requiring UI retry.

#### Scenario: Async commit evidence appears after UI advance
- **WHEN** a pending Review commit later produces a matching durable `review_events` row
- **THEN** the reconciler SHALL advance projection/journal state from that evidence without asking the UI to resubmit the answer

#### Scenario: Pending commit has no durable evidence
- **WHEN** a pending Review commit has no matching durable event and remains failed or unknown
- **THEN** the reconciler SHALL NOT remove the card from projection solely because the UI session advanced
