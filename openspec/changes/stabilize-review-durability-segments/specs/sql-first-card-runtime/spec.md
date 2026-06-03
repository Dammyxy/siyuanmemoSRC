## ADDED Requirements

### Requirement: Formal Review feedback local durability gate
The system SHALL report committed success for formal `review.feedback` only after the review intent journal entry, SQL card/review-event mutation, SQL delta or checkpoint persistence, queue projection impact, Review truth v2 payload validation, and journal `projection-applied` status are locally durable or explicitly reconciled by idempotency.

#### Scenario: Successful rating survives restart
- **WHEN** a formal `review.feedback` request returns committed success for an Incremental Learning card
- **THEN** restarting SiYuan and replaying backend storage SHALL preserve the reviewed card state and SHALL NOT restore the pre-review ready queue count

#### Scenario: SQL delta persistence failure blocks success
- **WHEN** the SQL transaction updates the worker memory DB but SQL delta or checkpoint persistence fails
- **THEN** `review.feedback` SHALL return an explicit unavailable or failure result and SHALL NOT report committed success to Review UI

#### Scenario: Journal prepared but SQL not durable
- **WHEN** startup finds a formal Review journal entry in `prepared` status without a matching durable SQL review event or idempotency commit
- **THEN** the system SHALL reapply the entry idempotently or mark it failed with diagnostics before Review queues report ready

#### Scenario: SQL durable but journal status stale
- **WHEN** startup finds a matching durable SQL review event for a journal entry that was not marked `projection-applied` before crash
- **THEN** the system SHALL advance the journal entry to `projection-applied` by idempotency reconciliation and SHALL NOT duplicate the review event

#### Scenario: Required SQLite host effects are not suppressed
- **WHEN** a pending `review.feedback` command emits required SQL delta or checkpoint host effects
- **THEN** the browser transport SHALL execute those host effects and SHALL NOT reject them because the command is on the Review hot path

### Requirement: Review truth v2 complete after-card records
The system SHALL write Review truth v2 records for formal Review feedback that contain complete after-card scheduling state and enough identity to rebuild card rows, review-event rows, and queue projection impact after restart or projection rebuild.

#### Scenario: Truth v2 payload contains complete scheduling transition
- **WHEN** a formal review feedback mutation is prepared
- **THEN** the Review truth v2 payload SHALL include the before-card scheduling state, after-card scheduling state, rating, reviewed timestamp, scheduler identity, queue identity, source identity, review-event identity, idempotency key, and projection generation metadata

#### Scenario: Truth v2 validation precedes local success
- **WHEN** the Review truth v2 payload cannot be built or validated from the committed scheduling transition
- **THEN** `review.feedback` SHALL fail closed before reporting committed success

#### Scenario: Truth v2 can rebuild SQL projection
- **WHEN** SQL projection storage is rebuilt from Review truth v2 records
- **THEN** the rebuilt projection SHALL contain the reviewed card's after-state and the matching `review_events` row without relying on old in-memory Review session state

### Requirement: Async Review truth flush policy
The system SHALL flush sync-visible Review truth segments asynchronously after local Review feedback durability succeeds, using bounded batches and deterministic lifecycle triggers.

#### Scenario: Rating success does not wait for truth segment append
- **WHEN** local journal and SQL delta or checkpoint durability have succeeded for a formal rating
- **THEN** Review UI success SHALL NOT wait for sync-visible MessagePack truth segment append during the normal rating path

#### Scenario: Threshold flush batches projection-applied entries
- **WHEN** at least 8 Review journal entries are in `projection-applied` status and not yet `truth-flushed`
- **THEN** the truth flush runtime SHALL write them as a bounded batch and update their journal truth flush metadata

#### Scenario: Pending truth work is journal-backed
- **WHEN** local Review feedback durability succeeds but sync-visible truth flush has not completed
- **THEN** the pending truth work SHALL be recoverable from the durable Review journal and SHALL NOT depend on an in-memory pending queue

#### Scenario: Lifecycle flush triggers pending truth
- **WHEN** Review view exits, a queue completes, plugin unload starts, startup compensation runs, or long idle is reached
- **THEN** the truth flush runtime SHALL attempt to flush pending `projection-applied` entries without invalidating already durable local Review success

#### Scenario: Unload wait is bounded
- **WHEN** plugin unload or SiYuan exit starts with pending Review truth flush work
- **THEN** the runtime SHALL wait at most 1 second for the flush attempt and SHALL leave unflushed entries for startup compensation if the wait expires

### Requirement: SQLite delta v2 MessagePack segments
The system SHALL persist SQL transaction deltas in SQLite delta v2 MessagePack segment files with a bounded open segment, immutable sealed segments, and replay metadata sufficient to recover the worker SQL projection after restart.

#### Scenario: Each formal rating writes a durable delta entry
- **WHEN** a formal `review.feedback` transaction commits SQL changes without producing a full checkpoint
- **THEN** the system SHALL persist a SQLite delta v2 entry for that transaction before reporting committed success

#### Scenario: Later ratings can share one bounded open segment
- **WHEN** multiple rating transactions are committed before the open SQLite delta segment reaches its entry or byte threshold
- **THEN** the system MAY rewrite the same bounded open segment with additional entries instead of creating one file per rating

#### Scenario: Sealed segments are immutable
- **WHEN** an open SQLite delta segment reaches the configured entry or byte threshold
- **THEN** the system SHALL seal that segment, SHALL NOT rewrite it for later transactions, and SHALL start a new bounded open segment

#### Scenario: Durable checkpoint clears only same-domain covered delta
- **WHEN** the system writes a SQL checkpoint snapshot
- **THEN** it SHALL clear or supersede only the SQLite delta v2 entries covered by a durable checkpoint manifest in the same storage durability domain

#### Scenario: Volatile temp projection checkpoint does not clear durable delta
- **WHEN** a temp `siyuanmemo.db` volatile projection reaches the delta threshold or is explicitly persisted
- **THEN** the system SHALL keep durable SQLite delta v2 entries pending and replayable instead of clearing them from the petal delta manifest

#### Scenario: Old volatile checkpoint clear markers are recovered
- **WHEN** startup in `volatile-projection` mode sees a SQLite delta v2 manifest with `checkpoint.coveredSegmentPaths`
- **THEN** the system SHALL replay those referenced segment files if they exist and SHALL NOT trust the volatile checkpoint marker as durable delta clearance

#### Scenario: No v1 delta migration
- **WHEN** startup sees legacy `sqlite-delta-log.v1.json` while the v2 runtime is active
- **THEN** the system SHALL NOT migrate it in this change and SHALL either ignore it with diagnostics or fail closed according to the active storage policy

### Requirement: Restart replay uses durable Review projection sources
The system SHALL make projection-backed Review queue readiness depend on replaying durable SQL checkpoint, SQLite delta v2 segments, and Review journal reconciliation before reading queue counts or session entries.

#### Scenario: Projection replay precedes Review queue ready state
- **WHEN** SiYuan starts and backend storage exists for projection-backed Review queues
- **THEN** the backend SHALL replay SQL checkpoint and delta files and reconcile Review journal entries before reporting those queues ready

#### Scenario: Stale local queue fallback is forbidden
- **WHEN** projection replay or journal reconciliation is unavailable, divergent, or incomplete for a projection-backed Review queue
- **THEN** Review SHALL surface explicit preparing or unavailable state and SHALL NOT compute ready count from local queue materialization

#### Scenario: Startup truth compensation follows local recovery
- **WHEN** startup finds `projection-applied` Review journal entries that are not `truth-flushed`
- **THEN** the system SHALL schedule Review truth v2 flush compensation after local SQL projection recovery

## MODIFIED Requirements

### Requirement: SQL-first review card mutation persistence
The system SHALL provide a SQL-first mutation persistence path for review-facing card updates that commits card state, review-event index state, sync metadata, queue projection invalidation or patch decisions, local review journal status, and SQL delta or checkpoint durability as one observable result before formal Review success is reported.

#### Scenario: Review mutation updates SQL card state
- **WHEN** a review-facing mutation updates scheduling state for a card in a SQL-first slice
- **THEN** the system SHALL persist the updated card state to SQL and to a durable SQL delta or checkpoint before reporting mutation success

#### Scenario: Mutation writes durable review event index
- **WHEN** a formal review-facing mutation commits a rating
- **THEN** the system SHALL persist the matching `review_events` row and idempotency identity to SQL and to a durable SQL delta or checkpoint before reporting mutation success

#### Scenario: Mutation invalidates or patches queue projection
- **WHEN** a SQL-first review mutation changes card membership, due state, source existence, or priority fields used by queue projection
- **THEN** the system SHALL return projection impact that invalidates or patches affected queue projection reads and SHALL include that impact in the same local durability result

#### Scenario: Mutation failure does not leave hidden partial success
- **WHEN** SQL-first mutation persistence fails after local Review transaction state was prepared
- **THEN** the system SHALL surface failure to the Review Transaction Safety Envelope so compensation can restore visible session state

#### Scenario: Formal mutation success waits for journal projection-applied
- **WHEN** formal `review.feedback` is accepted with `commitPolicy = write-schedule`
- **THEN** the system SHALL mark the idempotent Review journal entry `projection-applied` only after durable SQL delta or checkpoint persistence succeeds, and SHALL report committed success only after that status is durable or reconciled

#### Scenario: Duplicate mutation reuses committed durable state
- **WHEN** a duplicate formal `review.feedback` arrives with the same idempotency key
- **THEN** the system SHALL return the existing committed result only if the durable SQL review event and journal state are compatible with the request

#### Scenario: Required durability writes are visible in diagnostics
- **WHEN** formal `review.feedback` performs journal, SQL delta, checkpoint, or truth-v2 validation work
- **THEN** diagnostics SHALL identify those steps as durability work and SHALL NOT classify their omission as a successful fast path
