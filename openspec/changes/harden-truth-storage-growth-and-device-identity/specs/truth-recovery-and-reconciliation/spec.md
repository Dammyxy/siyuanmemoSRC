## ADDED Requirements

### Requirement: Startup distinguishes disposable projection failure from canonical failure
The system SHALL classify startup storage evidence before enabling reads, writes, Review, or synchronization upload.

#### Scenario: Temporary SQLite is missing or corrupt
- **WHEN** canonical truth and required uncovered delta verify successfully but the temporary SQLite projection is missing or corrupt
- **THEN** startup SHALL discard or replace the projection and deterministically rebuild it without changing canonical truth

#### Scenario: Canonical evidence cannot be verified
- **WHEN** a required truth manifest, truth segment, uncovered delta mutation, checksum, or identity ownership record cannot be verified
- **THEN** startup SHALL NOT treat a usable temporary SQLite file as proof that writes may continue

### Requirement: Recovery uses only verified generations and replayable delta
The system SHALL recover current state from a verified checkpoint or snapshot generation plus intact subsequent truth changes and uncovered delta.

#### Scenario: Current generation is incomplete but previous is verified
- **WHEN** the current candidate generation fails verification and the previous generation is verified
- **THEN** recovery SHALL use the previous verified generation and replay valid subsequent evidence without publishing the incomplete generation

#### Scenario: Replay reaches the latest journal frontier
- **WHEN** all post-checkpoint delta mutations are complete and verifiable
- **THEN** recovery SHALL replay them in journal sequence and resume pending truth promotion before normal maintenance

### Requirement: Unprovable canonical integrity enters read-only recovery mode
The system SHALL enter explicit `STORAGE_RECOVERY_REQUIRED` when required uncovered or canonical evidence cannot be proven complete.

#### Scenario: Uncovered delta mutation is corrupt
- **WHEN** an uncovered mutation cannot be decoded, verified, or safely relocated
- **THEN** the system SHALL disable Review, edits, sync upload, and other formal writes and SHALL preserve the damaged evidence for diagnosis

#### Scenario: Last verified state is readable
- **WHEN** `STORAGE_RECOVERY_REQUIRED` has a usable last verified checkpoint or generation
- **THEN** the system SHALL permit read-only inspection, diagnostics, and backup export without presenting the state as fully current

#### Scenario: Operator requests normal write despite corruption
- **WHEN** a caller attempts a formal mutation while recovery-required state remains unresolved
- **THEN** the system SHALL return explicit recovery-required unavailable and SHALL NOT skip damaged evidence or write a new canonical frontier

### Requirement: Device-owned truth is synchronized without shared file writers
The system SHALL keep each device and identity epoch as the only writer of its own truth directory while allowing other devices to read those immutable manifests and segments for reconciliation.

#### Scenario: Two devices synchronize concurrently
- **WHEN** device A and device B publish their own truth segments
- **THEN** file synchronization SHALL preserve both device namespaces and SHALL NOT overwrite one namespace with the other

#### Scenario: Old identity epoch is discovered
- **WHEN** reconciliation discovers a prior local device directory after identity loss
- **THEN** the directory SHALL be treated as read-only input and SHALL NOT be adopted as the current writable namespace

### Requirement: Reconciliation operates on mutations and aggregates
The system SHALL reconcile canonical truth by stable mutation identity, aggregate identity, causal base revision, device identity, and identity epoch rather than by SQLite files or raw file modification time.

#### Scenario: Same mutation arrives twice
- **WHEN** two synchronized inputs contain the same `mutationId` and equivalent payload
- **THEN** reconciliation SHALL retain one logical mutation result

#### Scenario: Independent aggregates changed on different devices
- **WHEN** synchronized mutations affect different aggregate identities
- **THEN** reconciliation SHALL merge both changes without creating a conflict

#### Scenario: Review facts are independent append-only evidence
- **WHEN** distinct valid Review event mutations synchronize
- **THEN** reconciliation SHALL preserve both facts and SHALL not overwrite one event with another based on file time

### Requirement: Tombstones prevent stale resurrection
The system SHALL apply deletion tombstones using causal revision evidence and SHALL prevent causally older updates from restoring deleted aggregates.

#### Scenario: Old device sends a pre-delete aggregate state
- **WHEN** a synchronized aggregate update is causally older than a verified tombstone
- **THEN** reconciliation SHALL retain deletion and SHALL not recreate the aggregate

#### Scenario: Update is causally after deletion
- **WHEN** a domain command explicitly recreates an aggregate from a revision after the tombstone
- **THEN** reconciliation SHALL require the domain-specific recreation contract rather than treating the update as an ordinary stale write

### Requirement: Unsafe concurrent mutations become explicit aggregate conflicts
The system SHALL automatically merge only changes proven commutative and SHALL mark non-commutative concurrent mutations against the same aggregate as a conflict.

#### Scenario: Two devices change the same Card Aggregate from one base revision
- **WHEN** both mutations are valid but neither causally follows the other and their operations are not declared commutative
- **THEN** reconciliation SHALL preserve both mutation facts, mark the aggregate conflicted, and SHALL NOT silently choose last writer

#### Scenario: Conflicted aggregate receives a new write
- **WHEN** a formal mutation targets an aggregate with unresolved reconciliation conflict
- **THEN** the system SHALL reject or gate that aggregate mutation until deterministic resolution is recorded

#### Scenario: Operations are proven commutative
- **WHEN** a domain merge policy declares the concurrent operations commutative and validates both causal preconditions
- **THEN** reconciliation SHALL apply the deterministic domain merge and record its resolution evidence

### Requirement: Reconciliation publishes verified state and rebuilds projections
The system SHALL publish reconciliation output as verified canonical checkpoint or generation evidence before rebuilding temporary SQLite projections from that output.

#### Scenario: Reconciliation completes successfully
- **WHEN** all merge decisions, conflicts, tombstones, segments, and manifest checks verify
- **THEN** the system SHALL publish the reconciled generation and rebuild derived SQLite and queue projections from it

#### Scenario: Reconciliation publication fails
- **WHEN** output segments or manifest publication cannot be verified
- **THEN** the previous verified canonical state SHALL remain active and temporary projections SHALL NOT switch to the incomplete result

### Requirement: SQLite conflict copies and file-level last-writer-wins are non-authoritative
The system SHALL NOT resolve domain conflicts by selecting a SQLite database copy, newest file timestamp, largest file, or arbitrary device manifest.

#### Scenario: SiYuan creates a conflicted SQLite file copy
- **WHEN** synchronization produces multiple temporary SQLite database files
- **THEN** recovery SHALL ignore them as domain truth and SHALL rebuild one projection from reconciled canonical truth

#### Scenario: Two truth files have different timestamps
- **WHEN** device-owned truth segments contain concurrent valid mutations with different filesystem timestamps
- **THEN** reconciliation SHALL use mutation and causal metadata rather than timestamp-based last-writer-wins

### Requirement: Recovery and reconciliation diagnostics are auditable
The system SHALL expose selected checkpoint and generation, replay frontier, quarantined files, unresolved mutations, aggregate conflicts, identity epochs, merge decisions, and disabled capabilities.

#### Scenario: Recovery blocks writes
- **WHEN** the system enters recovery-required or aggregate-conflict state
- **THEN** diagnostics SHALL identify the evidence that failed, the last verified state, and the smallest safe next recovery action
