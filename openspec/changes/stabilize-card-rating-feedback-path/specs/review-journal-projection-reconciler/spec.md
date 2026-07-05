## MODIFIED Requirements

### Requirement: Reconciler preserves existing durable-event evidence semantics
The reconciler SHALL only advance stale Review feedback journal state or replace queue projection rows when durable journal entries and matching `review_events` evidence prove the Review fact already exists.

#### Scenario: Matching durable event reconciles stale prepared entry
- **WHEN** a `prepared` Review feedback journal entry has a durable `review_events` row with the same idempotency key, card identity, reviewed timestamp, rating, and queue type
- **THEN** the reconciler SHALL advance the journal entry to `projection-applied` without inserting a duplicate Review event

#### Scenario: Matching durable event reconciles ambiguous retry evidence
- **WHEN** a retried Review rating has the same idempotency key and matching durable `review_events` evidence by card identity, reviewed timestamp, rating, and queue type
- **THEN** the reconciler SHALL expose the rating as duplicate committed evidence and SHALL NOT reapply scheduler mutation

#### Scenario: Mismatched durable event does not reconcile
- **WHEN** a journal entry's durable `review_events` row is missing or differs by card identity, reviewed timestamp, rating, or queue type
- **THEN** the reconciler SHALL leave that entry unreconciled and SHALL NOT replace queue projection rows for that unproven Review fact

#### Scenario: Pending truth flush does not override durable rating evidence
- **WHEN** a Review rating has proven SQL review event evidence but Review truth flush remains pending because of feedback pressure
- **THEN** the reconciler SHALL preserve the committed rating evidence and SHALL keep truth flush work pending for retry
