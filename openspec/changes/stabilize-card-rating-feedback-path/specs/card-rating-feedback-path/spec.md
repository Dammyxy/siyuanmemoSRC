## ADDED Requirements

### Requirement: Card rating reports only proven outcomes
The system SHALL report a Review card rating as successful only when the backend Review feedback path has proven a committed or duplicate committed outcome for that rating.

#### Scenario: Rating commit success is proven
- **WHEN** a user rates a card and backend `review.feedback` persists the minimum durable Review feedback evidence
- **THEN** the Review surface SHALL receive a committed result and may advance to the next card

#### Scenario: Rating commit cannot be proven
- **WHEN** backend `review.feedback` cannot prove the rating's minimum durable Review feedback evidence
- **THEN** the Review surface SHALL receive an explicit retryable, unavailable, conflict, or repair-required result and SHALL NOT treat the rating as committed

#### Scenario: Duplicate rating retry is recognized
- **WHEN** a user retries a rating with an idempotency key that already has matching durable Review evidence
- **THEN** the system SHALL return duplicate committed success without reapplying scheduler mutation or inserting a duplicate review event

#### Scenario: Mismatched retry fails closed
- **WHEN** a retry uses an existing idempotency key but differs by card identity, rating, reviewed timestamp, or queue type
- **THEN** the system SHALL fail closed with an explicit conflict diagnostic

### Requirement: Card rating hot path excludes secondary maintenance
The system SHALL keep non-essential derived maintenance out of the synchronous card rating success gate unless that work is required to prove the current rating's minimum durable commit.

#### Scenario: Derived maintenance is deferred after commit
- **WHEN** the minimum durable rating commit succeeds and queue projection maintenance, Browser projection warmup, truth flush, Xiuyuan sync, or native-Riff sync remains pending
- **THEN** the rating result SHALL expose the secondary work as deferred, pending, stale, refresh-required, or failed without blocking committed success

#### Scenario: Required durability work still blocks success
- **WHEN** a storage operation is required to prove scheduler/card state, review event evidence, or idempotency identity for the current rating
- **THEN** the rating path SHALL wait for that operation or return explicit failure if it cannot complete

#### Scenario: Slow feedback diagnostics name the dominant phase
- **WHEN** card rating exceeds the configured Review feedback latency budget
- **THEN** diagnostics SHALL identify whether the dominant phase was UI/session handling, client RPC, transport, backend handler, SQLite transaction, truth flush, or derived maintenance

### Requirement: Card rating handles backend storage pressure without ambiguous UI success
The system SHALL convert backend host-effect timeouts and SQLite transaction recovery failures into explicit rating outcomes.

#### Scenario: Host-effect timeout prevents durable proof
- **WHEN** `review.feedback` hits a backend host-effect timeout while proving minimum durable rating evidence
- **THEN** the system SHALL return unavailable or retryable pending and SHALL NOT report committed success

#### Scenario: SQLite restore failure prevents durable proof
- **WHEN** SQLite transaction persistence fails and in-memory restore also fails during `review.feedback`
- **THEN** the system SHALL return repair-required or unavailable and SHALL NOT advance visible Review state as committed

#### Scenario: Truth flush pressure does not invalidate proven commit
- **WHEN** minimum durable rating evidence is proven but Review truth flush is blocked by feedback pressure
- **THEN** the rating result SHALL remain committed and SHALL report truth flush as pending retry work

### Requirement: Card rating regression coverage reproduces slow and error trace classes
The system SHALL include focused regression coverage for card rating slow-path and error-path behavior matching the captured production trace classes.

#### Scenario: Slow rating fixture is deterministic
- **WHEN** tests simulate backend host-effect delay, derived maintenance pressure, or SQLite transaction delay
- **THEN** the tests SHALL assert the rating result classification and diagnostic phase without relying on real wall-clock flakiness

#### Scenario: Error rating fixture is fail-closed
- **WHEN** tests simulate host-effect timeout, corrupt/open segment repair failure, or transaction restore failure
- **THEN** the tests SHALL assert that committed success is not reported without durable proof
