## ADDED Requirements

### Requirement: Passive queue projection readiness is read-only
Queue Projection Runtime SHALL answer passive readiness checks without materializing or replacing queue projections.

#### Scenario: Readiness sees stale projection
- **WHEN** a passive readiness request observes a stale, missing, or refreshing projection snapshot
- **THEN** Queue Projection Runtime SHALL return `refreshing` or `unavailable` readiness diagnostics and SHALL NOT call `queue.getCards()` or projection replacement

#### Scenario: Readiness sees ready projection
- **WHEN** a passive readiness request observes a readable projection snapshot with valid policy and generation
- **THEN** Queue Projection Runtime SHALL return `ready` and publish the ready projection identity

### Requirement: Passive projection reads do not repair
Queue Projection Runtime read methods SHALL NOT repair or materialize projections as a side effect of `readSnapshot`, row hydration, or Browser count reads.

#### Scenario: Snapshot read sees stale projection
- **WHEN** `readSnapshot` observes a non-ready projection snapshot
- **THEN** it SHALL return an explicit non-ready result or null according to the existing read contract and SHALL NOT call projection materialization

#### Scenario: Row hydration sees stale projection
- **WHEN** row hydration observes non-ready projection rows
- **THEN** it SHALL report the non-ready state and SHALL NOT materialize projection rows from the queue domain

### Requirement: Projection repair is explicit
Queue Projection Runtime SHALL expose projection materialization only through explicit repair/materialization entry points.

#### Scenario: Explicit repair materializes queue projection
- **WHEN** an explicit repair path requests projection materialization for a supported queue type
- **THEN** Queue Projection Runtime SHALL build rows from the queue domain and submit projection replacement through the writer/backend path

#### Scenario: Passive Browser reads cannot trigger repair
- **WHEN** Browser open, count refresh, or passive readiness checks projection readiness
- **THEN** those passive reads SHALL NOT enter the explicit repair/materialization path

#### Scenario: Browser warmup uses application repair command
- **WHEN** Browser warmup sees a repairable stale projection state
- **THEN** it MAY request repair through `BrowserApplicationService.repairQueueReadModel()`
- **AND** it SHALL NOT call `queue.getCards()` or direct projection materialization from UI code itself
