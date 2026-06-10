## ADDED Requirements

### Requirement: Projection-applied Review journal survives checkpoint failure
The system SHALL preserve `projection-applied` Review feedback journal entries when an explicit SQL checkpoint or volatile projection persist attempt fails after local Review feedback durability has already succeeded.

#### Scenario: Failed checkpoint leaves truth compensation pending
- **WHEN** a Review feedback journal entry is `projection-applied` and an explicit checkpoint write fails
- **THEN** the journal entry SHALL remain `projection-applied`, pending async Review truth flush compensation, and checkpoint diagnostics SHALL report the failure without clearing the entry

### Requirement: Restart reconciliation precedes Review queue readiness
The system SHALL replay durable SQL checkpoint/delta state and reconcile Review feedback journal entries before projection-backed Review queues report readable counts or session entries after restart.

#### Scenario: Truth-flushed Incremental Learning review stays out of ready count after restart
- **WHEN** a formal Incremental Learning review was locally durable, later truth-flushed, and backend storage is replayed as after SiYuan restart
- **THEN** the reviewed card SHALL remain out of the ready count and Review queue reads SHALL NOT use stale pre-review local queue state

### Requirement: Prepared Review journal reconciles with durable SQL idempotency
The system SHALL advance stale `prepared` Review feedback journal entries to `projection-applied` during restart reconciliation when durable SQL already contains the matching idempotent review event.

#### Scenario: Durable SQL event advances stale prepared journal without duplicate event
- **WHEN** startup finds a `prepared` Review feedback journal entry and durable SQL contains a matching `review_events` row for the same idempotency key and Review fact
- **THEN** the journal entry SHALL become `projection-applied`, the existing review event SHALL remain single, and no duplicate review event SHALL be inserted

### Requirement: Review restart readiness fails closed without stale fallback
The system SHALL surface explicit preparing or unavailable state for projection-backed Review queues when restart replay or Review journal reconciliation cannot prove a readable durable projection.

#### Scenario: Replay or reconciliation failure does not materialize stale Review queue counts
- **WHEN** durable SQL replay, SQLite delta replay, or Review feedback journal reconciliation is unavailable, divergent, or incomplete during startup
- **THEN** projection-backed Review surfaces SHALL report preparing or unavailable state with diagnostics and SHALL NOT compute ready count from local queue materialization, legacy snapshots, or stale in-memory session data
