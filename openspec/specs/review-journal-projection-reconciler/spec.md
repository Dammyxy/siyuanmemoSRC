# review-journal-projection-reconciler Specification

## Purpose
TBD - created by archiving change extract-review-journal-projection-reconciler. Update Purpose after archive.
## Requirements
### Requirement: Review journal projection reconciliation is owned by a focused module
The system SHALL provide an internal Review journal projection reconciler module that owns restart reconciliation for Review feedback journal entries and derived queue projection state behind a small public interface.

#### Scenario: Startup delegates reconciliation to the module
- **WHEN** SQL worker startup has replayed durable SQL checkpoint/delta state and reaches Review feedback journal projection reconciliation
- **THEN** startup SHALL call the Review journal projection reconciler before projection-backed Review queues report readable counts or session entries

#### Scenario: SQL worker authority stays unchanged
- **WHEN** the reconciler needs journal data, durable review event evidence, card query results, queue projection state, or a projection replacement transaction
- **THEN** it SHALL use dependencies supplied by the SQL worker startup owner and SHALL NOT change JSON-RPC method strings, SQL worker authority, writer relay ownership, or kernel sidecar ownership

### Requirement: Reconciler preserves existing durable-event evidence semantics
The reconciler SHALL only advance stale Review feedback journal state or replace queue projection rows when durable journal entries and matching `review_events` evidence prove the Review fact already exists.

#### Scenario: Matching durable event reconciles stale prepared entry
- **WHEN** a `prepared` Review feedback journal entry has a durable `review_events` row with the same idempotency key, card identity, reviewed timestamp, rating, and queue type
- **THEN** the reconciler SHALL advance the journal entry to `projection-applied` without inserting a duplicate Review event

#### Scenario: Mismatched durable event does not reconcile
- **WHEN** a journal entry's durable `review_events` row is missing or differs by card identity, reviewed timestamp, rating, or queue type
- **THEN** the reconciler SHALL leave that entry unreconciled and SHALL NOT replace queue projection rows for that unproven Review fact

### Requirement: Projection rebuild decisions remain fail-closed and behavior-preserving
The reconciler SHALL preserve existing restart behavior for derived Review queue projection replacement and SHALL propagate reconciliation failures instead of hiding them behind fallback or compatibility paths.

#### Scenario: Proven reviewed card is removed from stale projection
- **WHEN** journal and durable event evidence prove a Review already happened but the current queue projection still includes the reviewed card in the matching Review queue
- **THEN** the reconciler SHALL replace that queue projection from the authoritative card repository query so the reviewed card does not return to ready count after restart

#### Scenario: Missing work is a no-op
- **WHEN** no relevant Review feedback journal entries exist or required projection dependencies are unavailable
- **THEN** the reconciler SHALL complete without changing queue projection state

#### Scenario: Dependency failure propagates
- **WHEN** journal listing, durable event lookup, repository query, transaction execution, or queue projection replacement fails during reconciliation
- **THEN** the reconciler SHALL surface the failure to startup and SHALL NOT compute Review readiness from stale local queue state, legacy snapshots, or an alternate fallback path

