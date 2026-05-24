## ADDED Requirements

### Requirement: Browser grid first-page model work is bounded
Browser grid datasource attachment SHALL avoid doing stale or superseded model work before the first visible rows are committed.

#### Scenario: Repeated datasource rebuilds before grid attach
- **WHEN** Browser rebuilds the infinite datasource multiple times before the pending attach timer runs
- **THEN** AG Grid SHALL receive only the latest datasource generation
- **AND** stale datasource generations SHALL NOT fetch rows or update first-row lifecycle state

#### Scenario: Pending datasource attach waits for grid readiness
- **WHEN** Browser has a pending datasource but the grid API is not alive
- **THEN** the datasource SHALL remain pending without calling AG Grid
- **AND** the latest pending datasource SHALL be applied once the grid API is alive

#### Scenario: Browser datasource work remains application-owned
- **WHEN** Browser needs first-page rows after datasource coalescing
- **THEN** row reads SHALL still flow through the existing Browser datasource/application read path
- **AND** the UI SHALL NOT add direct SQL, backend bypass, or hidden fallback row reads

### Requirement: Kernel action pump backend health warning noise is bounded
Kernel transaction action polling SHALL treat repeated backend-health unavailable or timeout failures as an explicit health state with bounded warning emission.

#### Scenario: Backend worker is repeatedly unavailable during dequeue
- **WHEN** action polling repeatedly fails with a backend unavailable error that is not a writer-relay ownership error
- **THEN** the pump SHALL warn for the first observed health failure
- **AND** subsequent same-health failures during the backoff window SHALL NOT emit repeated warnings
- **AND** local dequeue, requeue, or mutation fallback paths SHALL NOT be used to hide the failure

#### Scenario: Backend dequeue repeatedly times out
- **WHEN** action polling repeatedly fails with a timeout-class backend health error
- **THEN** the pump SHALL use the same bounded warning/backoff behavior as backend unavailable
- **AND** the polling result SHALL remain a failed poll rather than a successful empty poll

#### Scenario: Backend health recovers
- **WHEN** a later dequeue succeeds after backend-health failures
- **THEN** the pump SHALL reset backend-health backoff state
- **AND** later backend-health failures SHALL be reported again as a new health episode

#### Scenario: Writer relay ownership errors stay distinguishable
- **WHEN** action polling fails because there is no active writer or writer relay is unavailable
- **THEN** the existing writer-unavailable reporting and no-active-writer recovery semantics SHALL remain distinguishable from generic backend-health failures
