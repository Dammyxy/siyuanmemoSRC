## ADDED Requirements

### Requirement: SRS Review Kernel owns worker-backed Review sessions
The system SHALL provide one worker-owned SRS Review Kernel Interface for session start, current-state read, answer, skip, undo, and diagnostics.

#### Scenario: Review session starts
- **WHEN** application code resolves a valid Review Entry Target and the transport Adapter submits its normalized worker start command with required Review Admission evidence
- **THEN** the kernel creates or restores SessionQueueIndex state and returns authoritative current card/item identity and state, lookahead, counters, projection identity, and diagnostics
- **AND** application code resolves Review Content Target after consuming the kernel result

#### Scenario: Review session command is submitted
- **WHEN** answer, skip, or undo targets the authoritative current session item
- **THEN** the kernel returns one typed result containing updated session state and explicit command outcome

### Requirement: SRS Review Kernel owns accepted-answer transaction ordering
The system SHALL hide scheduler compute, Card Schedule Store persistence, Review Ledger append, domain-sync evidence, undo evidence, mutation stamp, durability, and SessionQueueIndex advancement behind the SRS Review Kernel Interface.

#### Scenario: Formal answer commits
- **WHEN** a formal answer passes ownership, current-target, rating, policy, and idempotency validation
- **THEN** Card Schedule Store, Review Ledger, required domain-sync evidence, undo evidence, and mutation stamp commit before SessionQueueIndex advances

#### Scenario: Required transaction step fails
- **WHEN** any authoritative write or durability step fails before commit
- **THEN** the kernel returns failure, keeps the visible session item stable, and MUST NOT report advancement

#### Scenario: Preview or drill is submitted
- **WHEN** commit policy is `preview-only` or `drill-only`
- **THEN** the kernel returns a non-formal result and MUST NOT append a formal Review Ledger fact or update Card Schedule Store

### Requirement: SRS Review Kernel commands are idempotent
The system SHALL detect duplicate commands by stable idempotency identity and SHALL reject incompatible reuse.

#### Scenario: Compatible answer is retried
- **WHEN** an answer repeats an existing idempotency key with compatible card, session, rating, queue, and commit policy
- **THEN** the kernel returns the existing committed result without appending a second Review Ledger fact or advancing SessionQueueIndex twice

#### Scenario: Idempotency key conflicts
- **WHEN** an existing idempotency key is reused with incompatible Review command identity
- **THEN** the kernel returns explicit idempotency conflict and MUST NOT mutate schedule or session state

### Requirement: Projection maintenance remains derived from Review truth
The system SHALL derive or enqueue queue projection impact after authoritative Review commit and SHALL NOT use BrowserProjectionIndex to select the next runtime-backed Review item.

#### Scenario: Projection impact is compatible
- **WHEN** the answer commits and projection identity is compatible
- **THEN** the kernel result includes patchable, deferred, or refresh-required queue impact

#### Scenario: Projection maintenance is unavailable after commit
- **WHEN** Review truth is durable but projection maintenance is unavailable
- **THEN** the kernel reports committed Review success plus explicit projection-unavailable or refresh-required impact and SessionQueueIndex remains next-item authority

### Requirement: Existing Review adapters remain thin
The system SHALL keep backend RPC and application Review adapters as transport/result mappers over the SRS Review Kernel.

#### Scenario: Backend Review RPC receives request
- **WHEN** backend review feedback or session command receives valid transport input
- **THEN** its Adapter invokes the SRS Review Kernel once and MUST NOT recreate transaction or session-advancement orchestration

#### Scenario: Review Attempt Kernel receives kernel result
- **WHEN** a non-session application Review caller uses `ReviewAttemptKernel`
- **THEN** it maps the SRS Review Kernel result to the existing application outcome and MUST NOT become a second transaction authority

### Requirement: SRS Review Kernel fails closed
The system SHALL expose typed invalid, unavailable, conflict, not-found, and durability outcomes without renderer, follower, or local fallback mutation.

#### Scenario: Worker or writer authority is unavailable
- **WHEN** a committed Review command cannot reach required worker or writer authority
- **THEN** the caller receives explicit unavailable and MUST NOT commit or advance locally

#### Scenario: Current target or admission is stale
- **WHEN** command target, admission identity, projection identity, or authoritative current session item does not match
- **THEN** the kernel returns explicit conflict and MUST NOT use latest-generation lookup, renderer cursor, or Browser projection fallback
