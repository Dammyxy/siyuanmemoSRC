## ADDED Requirements

### Requirement: Maintenance receipts use a Worker-owned stable frontier
Startup maintenance receipts SHALL be keyed by stable `pluginInstallationId + identityEpoch + maintenance kind/version + Worker-owned input frontier` evidence and SHALL NOT use an ephemeral runtime instance, renderer-side card enumeration, or a startup-specific core storage abstraction.

#### Scenario: Worker reports a maintenance frontier
- **WHEN** startup requests maintenance evidence
- **THEN** the Worker SHALL return a narrow frontier derived from authoritative generations, checkpoints, identity epoch, and maintenance input version as applicable
- **AND** the frontier SHALL not contain note content, card content, SQL rows, or host request bodies

#### Scenario: Core storage interface is reviewed
- **WHEN** implementation needs store identity for startup receipts
- **THEN** it SHALL use an application/backend port or Worker startup read model
- **AND** it SHALL NOT add or retain a startup-maintenance-named method on the core `UnifiedStorageManager` interface

### Requirement: Only an exact completed post-success receipt permits skipping
The fast path SHALL skip a maintenance kind only when a valid terminal-success receipt has a post-success frontier exactly matching the current frontier and the current receipt version.

#### Scenario: Completed receipt matches current frontier
- **WHEN** the receipt kind/version/scope is valid, terminal success is recorded, and its post-success frontier exactly matches the current Worker frontier
- **THEN** startup SHALL return a skipped/completed diagnostic for that maintenance kind
- **AND** it SHALL not enumerate all cards or execute the maintenance mutation

#### Scenario: Receipt is missing or malformed
- **WHEN** receipt evidence is absent, malformed, ambiguous, from an unknown version, or lacks terminal success
- **THEN** startup SHALL execute the existing bounded full maintenance path
- **AND** it SHALL not silently assume completion

#### Scenario: Current frontier changed
- **WHEN** truth generation, delta/checkpoint generation, identity epoch, or a relevant maintenance input version differs from the receipt's post-success frontier
- **THEN** the receipt SHALL be invalid for skipping and bounded maintenance SHALL run

#### Scenario: Receipt belongs to another durable identity scope
- **WHEN** a receipt's plugin installation or identity-epoch scope does not match the active verified scope
- **THEN** startup SHALL reject the receipt for fast-path purposes

#### Scenario: Plugin restarts with unchanged durable scope
- **WHEN** a new ephemeral runtime starts for the same verified plugin installation, identity epoch, kind/version, and unchanged frontier
- **THEN** the prior completed receipt MAY match
- **AND** the new runtime instance id SHALL not invalidate the warm-start fast path

### Requirement: Successful maintenance records the post-commit frontier
A maintenance receipt SHALL be written only after all owned mutations commit successfully and SHALL capture the frontier observed after those mutations.

#### Scenario: Maintenance changes canonical inputs
- **WHEN** schedule normalization, orphan repair, truth work, or another owned phase changes the relevant authoritative frontier
- **THEN** the completed receipt SHALL contain the post-commit frontier
- **AND** a receipt containing only the pre-scan frontier SHALL not be considered valid completion evidence

#### Scenario: A maintenance phase fails
- **WHEN** any owned phase fails or its mutation transaction does not commit
- **THEN** the system SHALL not write a terminal-success receipt
- **AND** the next startup SHALL retry or expose failure according to lifecycle policy

#### Scenario: Receipt persistence fails after maintenance succeeds
- **WHEN** all maintenance mutations commit but receipt persistence fails
- **THEN** the system SHALL emit an explicit safe diagnostic
- **AND** the next startup SHALL use the bounded full path rather than falsely skip

### Requirement: Receipt status is a genuinely cheap Worker-native read
The receipt/frontier status RPC SHALL read only the metadata needed for the fast-path decision and SHALL bypass external storage merge or main projection refresh only where that metadata read is independently safe.

#### Scenario: Matched receipt status is read
- **WHEN** startup reads status for a completed matching receipt
- **THEN** the Worker SHALL not enumerate cards, run schedule/orphan queries, rebuild the projection, merge external storage, or perform maintenance mutation

#### Scenario: One startup decision checks multiple maintenance phases
- **WHEN** schedule normalization and orphan repair use the same receipt/frontier snapshot
- **THEN** startup SHALL reuse one coherent status read for that decision
- **AND** it SHALL not issue redundant full status/preflight calls for each phase

#### Scenario: Status is requested while external storage changed
- **WHEN** external storage may have changed but the Worker-owned frontier cannot prove equivalence
- **THEN** status SHALL return mismatched/ambiguous evidence that forces the bounded full path
- **AND** it SHALL not hide the ambiguity by returning completed

#### Scenario: External change is accepted for merge
- **WHEN** an external storage change is observed or queued
- **THEN** the Worker-owned external-input dirty generation or pending-merge marker SHALL update atomically before a status read can report a receipt match
- **AND** status SHALL remain mismatched/ambiguous until the authoritative frontier proves the merge represented

#### Scenario: External merge commits
- **WHEN** the Worker-owned merge commits successfully
- **THEN** the authoritative generation/checkpoint and pending-merge marker SHALL advance through the same ownership path
- **AND** a later status read SHALL compare the receipt against that new frontier without performing another merge

#### Scenario: Mutating maintenance is applied
- **WHEN** startup applies a maintenance batch after the fast path is rejected
- **THEN** the mutation SHALL retain existing writer, identity, transaction, and storage-safety checks
- **AND** the status-read exemption SHALL not grant a mutation exemption

### Requirement: Receipt-backed maintenance phases have explicit readiness classifications
Schedule normalization and orphan-card repair SHALL each be classified from their own read/write invariant before their full paths are kept synchronous or moved after readiness.

#### Scenario: A phase is required for initial correctness
- **WHEN** tests prove malformed schedule or orphan state can make an initial read/write surface incorrect or unsafe
- **THEN** startup SHALL run the required bounded gate before exposing that surface as normal
- **AND** it MAY keep the affected surface explicitly unavailable instead of blocking unrelated plugin capabilities

#### Scenario: A phase is safe to defer
- **WHEN** tests prove initial consumers remain correct or explicitly pending without the full scan
- **THEN** the phase SHALL be returned as a deferred descriptor and submitted through the post-ready background registry
- **AND** its failure and completion SHALL remain visible in status

#### Scenario: Receipt evidence is ambiguous before classification
- **WHEN** receipt evidence cannot prove the phase complete and its invariant has not been proven deferred-safe
- **THEN** startup SHALL use the existing bounded synchronous behavior for that phase
- **AND** it SHALL neither silently skip nor detach the work

### Requirement: Startup maintenance uses operation-specific timeout budgets
Receipt reads, database readiness calls, and maintenance mutation batches SHALL use separate measured timeout contracts and SHALL NOT share a blanket five-minute request or host-effect timeout.

#### Scenario: Receipt status exceeds its short budget
- **WHEN** the cheap status read exceeds its bounded latency budget
- **THEN** the call SHALL fail with operation, phase, elapsed time, and safe timeout classification
- **AND** startup SHALL not wait for a generic 300-second timeout

#### Scenario: Database load exceeds its readiness budget
- **WHEN** `db.load` or `db.reload` exceeds the measured safety/readability budget
- **THEN** diagnostics SHALL identify the blocking startup phase
- **AND** the implementation SHALL classify, bound, or explicitly retain that phase as a safety gate rather than merely increasing the timeout

#### Scenario: Bounded mutation batch times out
- **WHEN** `storage.maintenance.applyBatch` exceeds the budget derived from its maximum batch and cancellation contract
- **THEN** the batch SHALL fail or cancel explicitly without a false success receipt
- **AND** retry/idempotency evidence SHALL prevent duplicate committed mutations

#### Scenario: Projection rebuild has a distinct budget
- **WHEN** `projection.rebuild` is required by a proven synchronous recovery/readability gate
- **THEN** it SHALL use an explicit operation-specific budget and phase diagnostic
- **AND** it SHALL not inherit a blanket startup five-minute timeout

#### Scenario: Request and host-effect layers enforce timeouts
- **WHEN** both transport request and host-effect timeout layers apply to an operation
- **THEN** their budgets and error classification SHALL be aligned so one layer does not obscure the actual timed-out phase
