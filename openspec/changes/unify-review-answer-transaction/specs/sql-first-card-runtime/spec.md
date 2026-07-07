## MODIFIED Requirements

### Requirement: Worker review feedback commits atomically
The worker SQL-first Review runtime SHALL commit worker-backed Review answer scheduling state, Review Ledger evidence, domain sync evidence, queue-impact evidence needed by the answer result, and Review Transaction Undo Journal evidence in one durable `review.feedback` transaction when the answer is part of a worker session.

#### Scenario: Worker session answer persists undo evidence inline
- **WHEN** a worker-backed Review session answers the current card with a write-schedule policy
- **THEN** the worker persists the card schedule update, Review Ledger row, and Review Transaction Undo Journal row in the same `review.feedback` transaction before reporting success

#### Scenario: Session answer avoids post-commit undo append
- **WHEN** a worker-backed Review session answer succeeds
- **THEN** the session runtime advances its SessionQueueIndex and returns the undo token without running a separate `review.session.undo-journal.append` durable transaction

#### Scenario: Inline undo persistence fails closed
- **WHEN** the Review Transaction Undo Journal row cannot be inserted inside the answer transaction
- **THEN** the worker-backed answer fails instead of reporting success with missing durable undo evidence
