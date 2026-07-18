## ADDED Requirements

### Requirement: The Worker must own one verified device mutation frontier
The system SHALL maintain one Worker-owned Verified Mutation Frontier per truth device that relates the active identity epoch, SQLite delta journal allocation, journaled mutation order, verified truth coverage, and recovery status. Renderer and kernel companion code MUST NOT create or advance this frontier.

#### Scenario: Frontier initializes for a new installation
- **WHEN** verified identity exists, the journal allocation starts at sequence 1, and no promotion coverage or journaled mutation exists
- **THEN** the Worker establishes a ready genesis frontier without inventing a covered mutation

#### Scenario: Existing frontier matches active identity and journal
- **WHEN** the persisted device frontier, verified active identity, journal allocation, and uncovered entries form one monotonic sequence
- **THEN** the Worker loads the frontier as ready and allows formal mutation admission

### Requirement: Epoch continuation must be proven before use
The system SHALL permit a new identity epoch to continue a device journal only from verified predecessor coverage. It MUST NOT reset, skip, renumber, or rebind formal mutation sequences to manufacture continuity.

#### Scenario: Prior epoch coverage immediately precedes the current epoch
- **WHEN** a same-device prior epoch proves coverage through sequence N, no uncovered foreign-epoch entry follows N, and the active epoch begins at sequence N+1
- **THEN** the Worker persists a verified epoch-transition baseline and promotes the active-epoch mutation at N+1 without rewriting its envelope

#### Scenario: Predecessor coverage is ambiguous
- **WHEN** prior epoch states conflict, the covered mutation evidence disagrees, or the active epoch does not begin immediately after verified coverage
- **THEN** the frontier enters recovery-required, formal writes remain disabled, and every journal and truth file is retained

#### Scenario: Foreign epoch has an uncovered mutation
- **WHEN** a non-active epoch owns an uncovered mutation in the continuation range
- **THEN** the Worker refuses the transition and MUST NOT skip or rebind that mutation

### Requirement: Frontier updates must remain monotonic
The Worker SHALL admit formal mutations only while the cached frontier is ready and SHALL accept journal and coverage observations only in monotonic order for the verified device and active epoch.

#### Scenario: Formal mutation receives the next journal sequence
- **WHEN** a ready frontier observes a journaled formal mutation at exactly the next allocation position
- **THEN** it advances its journal frontier in memory and preserves the mutation for ordered promotion

#### Scenario: Runtime observes a sequence gap or identity change
- **WHEN** an append, reload, or promotion result moves backward, skips an expected sequence, changes device, or changes epoch without transition proof
- **THEN** the Worker invalidates frontier readiness, closes the formal write gate, and records a stable recovery code

### Requirement: Promotion failure must be classified
Truth Promotion SHALL distinguish retryable publication failures from deterministic frontier failures. Deterministic identity, version, transition, and sequence-continuity failures MUST stop automatic scheduling rather than enter an unbounded fixed-delay retry loop.

#### Scenario: Journal sequence discontinuity is deterministic
- **WHEN** promotion observes a first pending sequence that cannot be connected to verified frontier coverage
- **THEN** it records one recovery-required frontier transition, cancels automatic retry, and exposes the expected and observed sequences in content-safe diagnostics

#### Scenario: Host publication fails transiently
- **WHEN** frontier continuity is verified but a truth segment or manifest host effect fails transiently
- **THEN** the Worker preserves the journaled mutation and schedules a coalesced retry with capped backoff

#### Scenario: Retry state changes
- **WHEN** promotion moves between ready, retrying, recovered, and recovery-required states
- **THEN** diagnostics record the state transition once rather than logging every unchanged poll or retry tick

### Requirement: Frontier migration must preserve old evidence
The system SHALL treat existing per-epoch promotion states as read-only migration evidence until a device frontier is verified. It MUST retain prior epoch namespaces for reconciliation and MUST fail closed on unsupported versions or unverifiable state.

#### Scenario: Compatible per-epoch state seeds the device frontier
- **WHEN** one supported same-device epoch state uniquely proves the journal coverage baseline
- **THEN** the Worker writes and verifies the device frontier while leaving the source epoch state intact

#### Scenario: Stored state version is unsupported
- **WHEN** the frontier or required predecessor promotion state uses an unknown version
- **THEN** startup reports recovery-required and does not normalize it to the current version or create a replacement frontier

### Requirement: Frontier diagnostics must be content safe
The system SHALL expose frontier status, device and epoch identifiers, journal and coverage sequences, transition classification, retry class, and stable error code without serialized note, card, SQL row, or mutation operation content.

#### Scenario: Maintenance inspects a blocked frontier
- **WHEN** startup or background maintenance requests frontier diagnostics after a deterministic failure
- **THEN** it receives stable sequence and identity evidence sufficient to distinguish transition failure from transient publication failure without receiving content payloads
