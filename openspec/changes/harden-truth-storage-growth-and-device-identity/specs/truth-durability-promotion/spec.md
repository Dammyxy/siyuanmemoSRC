## ADDED Requirements

### Requirement: Durability has journaled and truth-committed stages
The system SHALL distinguish replayable crash-journal durability from verified canonical truth durability for every formal mutation.

#### Scenario: Interactive mutation reaches journal durability
- **WHEN** the Worker SQL transaction and its complete verifiable delta mutation are durably committed
- **THEN** the system SHALL issue a `journaled` receipt that permits configured hot paths to return success while preserving pending truth-promotion status

#### Scenario: Canonical truth outputs are verified
- **WHEN** every canonical output required by the mutation has been written and verified
- **THEN** the system SHALL advance the same mutation receipt to `truth-committed`

#### Scenario: SQL commit exists without complete delta
- **WHEN** SQL state changes but the complete replayable delta mutation is not durably verified
- **THEN** the system SHALL NOT issue a `journaled` receipt

### Requirement: One business command is one atomic durability unit
The system SHALL assign one stable `mutationId` to all state changes produced by one business command and Worker transaction.

#### Scenario: Review answer changes multiple families
- **WHEN** one Review answer changes Schedule, Review Ledger, Undo, Queue impact, tombstones, or metadata
- **THEN** all required outputs SHALL belong to the same durability unit and SHALL reach `truth-committed` only together

#### Scenario: One required truth output fails
- **WHEN** some canonical outputs succeed and another required output fails verification
- **THEN** the mutation SHALL remain `journaled`, preserve retry evidence, and SHALL NOT advance coverage as partially committed

### Requirement: Truth promotion preserves journal sequence
The system SHALL use one Worker-owned Truth Promotion Module and one manifest writer to promote journaled mutations in journal-sequence order.

#### Scenario: Consecutive mutations are batched
- **WHEN** multiple consecutive journaled mutations are eligible for promotion
- **THEN** the Module MAY encode them into one segment and one manifest publication while preserving their sequence order

#### Scenario: A later mutation finishes encoding first
- **WHEN** asynchronous preparation for a later mutation completes before an earlier sequence
- **THEN** manifest publication SHALL wait until ordered promotion requirements are satisfied

### Requirement: Mutation promotion is idempotent
The system SHALL reuse stable mutation identity across retries and SHALL prevent duplicate logical truth commits.

#### Scenario: Promotion retries after an interrupted manifest write
- **WHEN** restart or retry encounters a `mutationId` already present in the verified generation
- **THEN** the system SHALL recognize the existing commit and SHALL NOT append a second logical event or changeset

#### Scenario: Duplicate command reaches the Worker
- **WHEN** the same idempotency key and mutation payload are submitted again
- **THEN** the system SHALL return the existing mutation outcome or continue its pending promotion instead of creating a new mutation

### Requirement: Coverage gates delta reclamation
The system SHALL track canonical truth coverage for every durability unit and SHALL reclaim a sealed delta segment only when every contained mutation is truth-committed or safely relocated.

#### Scenario: Sealed segment is fully covered
- **WHEN** all mutations in a sealed segment have verified canonical coverage
- **THEN** the segment MAY become eligible for retention-policy reclamation

#### Scenario: Sealed segment contains one uncovered mutation
- **WHEN** any mutation in a sealed segment remains only `journaled`
- **THEN** the segment SHALL remain or the uncovered mutation SHALL be copied and verified in a replacement recovery segment before deletion

### Requirement: Restart and shutdown preserve promotion progress
The system SHALL make promotion restartable and SHALL not require a clean renderer shutdown for correctness.

#### Scenario: Process stops during truth promotion
- **WHEN** shutdown or crash occurs before a batch receives a verified manifest publication
- **THEN** restart SHALL discover the uncovered journaled mutations and resume idempotent promotion

#### Scenario: Graceful shutdown begins
- **WHEN** Worker shutdown starts
- **THEN** the promotion Module SHALL stop accepting new maintenance batches and SHALL either finish the active publication or leave complete replayable journal evidence

### Requirement: Promotion diagnostics expose pressure and lag
The system SHALL report pending mutation count, oldest pending age, journal sequence frontier, truth coverage frontier, retry reason, and last successful promotion time.

#### Scenario: Truth host effect repeatedly fails
- **WHEN** promotion cannot write or verify canonical truth
- **THEN** diagnostics SHALL identify the blocked mutation and reason while retaining its delta evidence for retry
