## MODIFIED Requirements

### Requirement: Reconciler preserves existing durable-event evidence semantics
The reconciler SHALL only advance stale Review feedback journal state, apply Review undo reversal evidence, or replace queue projection rows when durable journal entries and matching `review_events`/Review Ledger evidence prove the Review fact or reversal already exists.

#### Scenario: Matching durable event reconciles stale prepared entry
- **WHEN** a `prepared` Review feedback journal entry has a durable `review_events` row with the same idempotency key, card identity, reviewed timestamp, rating, and queue type
- **THEN** the reconciler SHALL advance the journal entry to `projection-applied` without inserting a duplicate Review event

#### Scenario: Mismatched durable event does not reconcile
- **WHEN** a journal entry's durable `review_events` row is missing or differs by card identity, reviewed timestamp, rating, or queue type
- **THEN** the reconciler SHALL leave that entry unreconciled and SHALL NOT replace queue projection rows for that unproven Review fact

#### Scenario: Durable undo reversal reconciles derived state
- **WHEN** Review Transaction Undo Journal evidence and matching Review Ledger reversal evidence prove an answer was undone
- **THEN** the reconciler SHALL derive queue projection and active Review counts from the restored Card Schedule Store state and non-reversed Review facts
- **AND** it SHALL NOT keep the reviewed card excluded solely because stale projection rows still reflect the original answer

### Requirement: Projection rebuild decisions remain fail-closed and behavior-preserving
The reconciler SHALL preserve existing restart behavior for derived Review queue projection replacement and SHALL propagate reconciliation failures instead of hiding them behind fallback or compatibility paths.

#### Scenario: Proven reviewed card is removed from stale projection
- **WHEN** journal and durable event evidence prove a Review already happened but the current queue projection still includes the reviewed card in the matching Review queue
- **THEN** the reconciler SHALL replace that queue projection from the authoritative card repository query so the reviewed card does not return to ready count after restart

#### Scenario: Proven undone card is restored to projection when due
- **WHEN** durable undo evidence proves a Review answer was reversed and the restored Card Schedule Store state makes the card due for the matching Review queue
- **THEN** the reconciler SHALL rebuild or invalidate projection state so the card can appear in ready counts again
- **AND** it SHALL NOT rely on stale Browser projection rows as undo evidence

#### Scenario: Missing work is a no-op
- **WHEN** no relevant Review feedback journal entries, Review Ledger facts, or Review Transaction Undo Journal records exist
- **THEN** the reconciler SHALL complete without changing queue projection state

#### Scenario: Dependency failure propagates
- **WHEN** journal listing, durable event lookup, undo journal lookup, repository query, transaction execution, or queue projection replacement fails during reconciliation
- **THEN** the reconciler SHALL surface the failure to startup and SHALL NOT compute Review readiness from stale local queue state, legacy snapshots, or an alternate fallback path
