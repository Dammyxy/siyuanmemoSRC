## ADDED Requirements

### Requirement: Normal startup readiness requires verified authority
The system SHALL derive plugin startup readiness from a typed disposition that distinguishes verified write authority, recovery-required evidence, and transient authority unavailability; it MUST NOT collapse those states into a boolean identity-ready flag.

#### Scenario: Verified identity permits write-capable readiness
- **WHEN** IndexedDB and localStorage Truth Device Identity evidence agree on `pluginInstallationId` and `identityEpoch`, authoritative truth/delta evidence is trusted, the Disposable SQLite Projection is readable, and no hard-pressure gate remains
- **THEN** startup MAY report write-capable normal readiness
- **AND** the verified `deviceId` and `identityEpoch` SHALL be supplied to every truth mutation path

#### Scenario: Conflicting identity authorities require recovery
- **WHEN** Truth Device Identity resolution returns `identity-recovery-required` because the two authority copies conflict
- **THEN** startup SHALL expose `STORAGE_RECOVERY_REQUIRED` with a safe identity-conflict reason
- **AND** it SHALL NOT report normal write-capable readiness

#### Scenario: Invalid identity evidence requires recovery
- **WHEN** either authoritative identity record is structurally invalid or its continuity cannot be proven
- **THEN** startup SHALL enter the explicit read-only recovery path or fail closed according to the active storage recovery contract
- **AND** it SHALL NOT generate a replacement identity as a compatibility fallback

#### Scenario: Identity authority read is transiently unavailable
- **WHEN** IndexedDB or localStorage identity authority cannot be read because of a transient access failure
- **THEN** startup SHALL enter read-only `STORAGE_RECOVERY_REQUIRED` with a retryable `IDENTITY_AUTHORITY_UNAVAILABLE` subreason
- **AND** it SHALL remain distinguishable from durable identity conflict, valid first-install absence, and verified identity
- **AND** it SHALL NOT enable truth writes

#### Scenario: First-install identity creation succeeds
- **WHEN** both identity authorities validly prove first-install absence and the authoritative identity creation protocol writes and verifies matching copies
- **THEN** startup SHALL continue using the newly verified identity and epoch

#### Scenario: First-install identity creation cannot be verified
- **WHEN** first-install identity creation cannot write or re-read matching authoritative copies
- **THEN** startup SHALL NOT report write-capable normal readiness
- **AND** it SHALL expose an explicit recovery or authority-unavailable reason

### Requirement: Startup disposition gates truth and journal mutation
The typed startup disposition SHALL be evaluated before Review journal replay mutation, truth promotion/backfill, or any other Canonical Truth write.

#### Scenario: Journal work encounters unverified identity
- **WHEN** pending Review journal or Review truth work is discovered while startup disposition is not write-capable
- **THEN** the work SHALL remain pending with a safe recovery/unavailable reason
- **AND** it SHALL NOT be deleted, marked successful, advanced under an unverified epoch, or written through a fallback identity

#### Scenario: Identity becomes verified later
- **WHEN** a later retry proves matching identity authority and the pending Review work still has valid durable evidence
- **THEN** the Worker-owned writer path MAY resume that work exactly once using the verified identity and epoch
- **AND** idempotency checks SHALL prevent duplicate Review facts

#### Scenario: Database reload follows the same gate
- **WHEN** the plugin invokes `db.reload` after startup or recovery
- **THEN** reload SHALL apply the same typed identity, storage evidence, pressure, and mutation gates as `db.load`
- **AND** it SHALL NOT reintroduce storage merge before identity resolution

### Requirement: Read-only recovery exposes a closed capability matrix
Read-only `STORAGE_RECOVERY_REQUIRED` SHALL allow only evidence/status/diagnostic operations and SHALL deny normal runtime mutation until a dedicated recovery transition proves authority.

#### Scenario: Caller reads recovery evidence
- **WHEN** startup is in identity-conflict, identity-invalid, or identity-authority-unavailable recovery
- **THEN** identity/storage evidence reads, retryable identity verification, background status, and safe diagnostics SHALL remain available

#### Scenario: Caller requests a normal mutation
- **WHEN** read-only recovery receives Review feedback, truth replay/promotion/backfill/flush, schedule/orphan apply, sync mutation, maintenance apply, or projection rebuild through the normal runtime
- **THEN** the operation SHALL fail closed with the active recovery reason
- **AND** it SHALL not enqueue deferred mutation work

#### Scenario: Dedicated recovery is requested
- **WHEN** a dedicated recovery operation is invoked
- **THEN** it SHALL use its own existing authority/continuity checks before any mutation or transition to writable readiness
- **AND** ordinary startup background jobs SHALL not be labeled recovery-safe by default

### Requirement: Startup readiness reports incomplete maintenance explicitly
Normal projection readability SHALL remain distinguishable from completion of deferred maintenance.

#### Scenario: Readable projection has pending deferred work
- **WHEN** all synchronous safety gates pass and the initial projection is readable but deferred-safe maintenance remains
- **THEN** startup MAY report normal readiness
- **AND** it SHALL expose deferred work descriptors or status references rather than implying maintenance completion

#### Scenario: Required reconciliation remains unproven
- **WHEN** a queue or read model depends on reconciliation that has not been proven safe to defer
- **THEN** startup SHALL keep that reconciliation synchronous or expose the affected read model as pending/unavailable
- **AND** it SHALL NOT expose stale counts as normal-ready data

### Requirement: Slow-start diagnostics cover the complete startup attempt
The system SHALL retain bounded startup-only timing evidence independently of the opt-in full runtime diagnostics setting and SHALL report it only after the outer `plugin.onload` attempt is terminal.

#### Scenario: Full diagnostics disabled during slow startup
- **WHEN** full runtime performance diagnostics are disabled and total `plugin.onload` duration exceeds the slow-start threshold
- **THEN** the slow-start report SHALL contain non-empty startup spans for the complete attempt
- **AND** it SHALL include the closed outer `plugin.onload` span and relevant child spans

#### Scenario: Fast startup remains quiet
- **WHEN** total `plugin.onload` duration is at or below the configured threshold and startup succeeds
- **THEN** the system SHALL discard the startup-only buffer without emitting a slow-start report

#### Scenario: Slow startup fails
- **WHEN** startup fails after exceeding the slow-start threshold
- **THEN** the outer startup owner SHALL close the failed span and emit a safe failure profile before discarding the buffer

#### Scenario: ApplicationContext contributes child spans
- **WHEN** `ApplicationContext.create()` runs inside `plugin.onload`
- **THEN** it SHALL contribute one consistently named child span
- **AND** it SHALL NOT emit the final startup report or create a duplicate span for the same interval

### Requirement: Startup-only diagnostics are bounded and content-safe
The startup-only diagnostics buffer SHALL have a fixed per-attempt bound and SHALL accept only allow-listed operation names and safe scalar metadata.

#### Scenario: Span volume exceeds the buffer bound
- **WHEN** startup records more spans or metadata than the configured buffer permits
- **THEN** the buffer SHALL truncate or aggregate deterministically without unbounded memory growth
- **AND** the report SHALL indicate safe truncation evidence

#### Scenario: Startup metadata contains content-bearing values
- **WHEN** instrumentation attempts to record card text, block text, SQL payloads, host-effect request bodies, error objects, or unknown nested values
- **THEN** the startup buffer SHALL omit or redact those values
- **AND** it SHALL preserve only allow-listed scalar diagnostics such as counts, phase, duration, and safe reason codes

#### Scenario: A new startup attempt begins
- **WHEN** startup is retried or a new plugin runtime is created
- **THEN** the system SHALL use a fresh buffer with no spans or metadata from the preceding attempt
