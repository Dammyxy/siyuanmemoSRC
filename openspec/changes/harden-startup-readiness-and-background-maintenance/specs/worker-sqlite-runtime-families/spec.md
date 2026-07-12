## ADDED Requirements

### Requirement: Backend load RPC preserves the positional caller contract
The backend Worker adapter SHALL decode the positional parameter array emitted by `BackendRpcCaller.call()` for database load/reload without weakening validation of malformed requests.

#### Scenario: Caller sends a load request
- **WHEN** `BackendRpcCaller.call("db.load", request)` serializes params as `[request]`
- **THEN** `BackendCoreRpcAdapter` SHALL unwrap and validate the request before invoking the Worker database service

#### Scenario: Caller sends a reload request
- **WHEN** `BackendRpcCaller.call("db.reload", request)` serializes params as `[request]`
- **THEN** the adapter SHALL apply the same decoding and validation contract as `db.load`

#### Scenario: Parameter shape is malformed
- **WHEN** params are missing, contain an invalid request object, or do not match the supported positional contract
- **THEN** the adapter SHALL fail explicitly
- **AND** it SHALL not retry through a legacy or alternate RPC shape

### Requirement: Worker startup returns a typed readiness result
The Worker SQLite startup Interface SHALL return a typed result that distinguishes write-capable readiness, explicit read-only recovery/authority-unavailable disposition, and pending deferred maintenance descriptors.

#### Scenario: Worker reaches write-capable readiness
- **WHEN** identity and authoritative storage evidence are trusted, the projection is readable, and hard-pressure gates pass
- **THEN** `db.load` SHALL return write-capable readiness plus any deferred-safe maintenance descriptors

#### Scenario: Worker reaches recovery-required state
- **WHEN** truth, delta, identity, checkpoint, or projection continuity cannot be proven
- **THEN** `db.load` SHALL return or raise the existing explicit recovery-required contract before normal readiness
- **AND** it SHALL not silently continue with a null truth mutation callback

#### Scenario: Worker reloads the database
- **WHEN** `db.reload` is invoked
- **THEN** it SHALL apply the same readiness classification and return contract as `db.load`

### Requirement: Worker init phases are classified before deferral
Every phase executed by `WorkerSqliteDatabaseService.init()` SHALL have an explicit synchronous-gate or deferred-safe classification backed by its read/write invariant and focused regression tests.

#### Scenario: Authority validation or projection reconstruction is required
- **WHEN** truth/delta/identity validation, storage recovery, or Disposable SQLite Projection reconstruction is required for trustworthy readable state
- **THEN** the phase SHALL remain synchronous before normal readiness

#### Scenario: Hard storage pressure is detected
- **WHEN** bounded startup inventory detects hard pressure that must block writes
- **THEN** the Worker SHALL complete the required bounded gate or fail closed before write-capable readiness
- **AND** it SHALL not defer the hard-pressure decision

#### Scenario: Normal-pressure truth continuation is pending
- **WHEN** truth promotion/backfill continuation is not required for initial readable projection correctness and pressure is below the hard gate
- **THEN** the Worker MAY return it as a registry-managed deferred descriptor
- **AND** Worker writer authority, identity epoch, idempotency, and pending/error evidence SHALL remain intact

#### Scenario: Review reconciliation, snapshot restore, domain backfill, or baseline is considered for deferral
- **WHEN** implementation considers moving one of those phases out of `db.load`
- **THEN** focused tests SHALL first prove initial read models remain correct or explicitly pending, mutations remain fail-closed, and failure is visible
- **AND** an unproven phase SHALL remain synchronous

#### Scenario: Storage-growth baseline has a large backlog
- **WHEN** startup inventory finds a large baseline/promotion backlog below hard pressure
- **THEN** startup SHALL not unconditionally execute an unbounded or 10,000-item remediation loop before readiness
- **AND** bounded continuation MAY be deferred with explicit status

### Requirement: Worker exposes a cheap startup maintenance evidence read
The Worker startup/runtime family SHALL expose a narrow receipt/frontier read that does not enter the full storage-refresh or projection-maintenance path.

#### Scenario: Receipt status is requested
- **WHEN** the backend handles `storage.maintenance.status`
- **THEN** it SHALL read only receipt/frontier metadata needed for the decision
- **AND** it SHALL not merge external storage, enumerate cards, rebuild projection state, or run maintenance mutations

#### Scenario: Maintenance apply is requested
- **WHEN** the backend handles a mutating maintenance batch
- **THEN** it SHALL retain Worker writer, transaction, identity, and storage-safety ownership
- **AND** it SHALL not inherit the read-only status exemption

### Requirement: Deferred Worker maintenance remains registry-owned
Worker startup MAY return deferred descriptors, but scheduling, deduplication, cancellation, status, and shutdown SHALL remain owned by the application/kernel companion background-work lifecycle rather than `db.load` itself.

#### Scenario: Worker returns deferred work
- **WHEN** a phase is proven deferred-safe
- **THEN** `db.load` SHALL describe the work and its frontier without starting a detached timer or registry job

#### Scenario: Application submits the descriptor
- **WHEN** the composition root reaches its ready boundary
- **THEN** the background registry SHALL own execution and status while the Worker retains all SQLite/truth mutation authority
