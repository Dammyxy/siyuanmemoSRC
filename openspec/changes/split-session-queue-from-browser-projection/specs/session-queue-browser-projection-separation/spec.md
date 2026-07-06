## ADDED Requirements

### Requirement: Session Queue Index owns active Review session advancement
The system SHALL use a Session Queue Index for active Review session current-card state, lookahead, session exclusions, session counters, and post-feedback advancement.

#### Scenario: Review answer advances during Browser projection refresh
- **WHEN** a user answers a Review card while Browser projection warmup or repair is pending
- **THEN** the active Review session SHALL advance from Session Queue Index state
- **AND** it SHALL NOT wait for Browser projection warmup, filter-group repair, or Browser count refresh to choose the next card

#### Scenario: Session starts from projection snapshot
- **WHEN** a Review session starts and a valid projection snapshot is available
- **THEN** the Session Queue Index MAY seed its frontier from that projection snapshot
- **AND** subsequent post-feedback advancement SHALL use Session Queue Index state until explicit session refresh/restart

### Requirement: Browser Projection Index owns Browser read-model readiness
The system SHALL use a Browser Projection Index for Browser matched row identity, counts, filter/sort projections, projection warmup, projection repair, and row hydration.

#### Scenario: Browser projection stale
- **WHEN** Browser opens a projection-backed queue and the projection is stale
- **THEN** Browser Projection Index SHALL report refreshing, stale, repair-required, or unavailable state
- **AND** it SHALL NOT cause an active Review session to fall back to Browser projection as next-card authority

#### Scenario: Browser owner unavailable
- **WHEN** Browser requires projection-backed rows and Browser Projection Index is unavailable
- **THEN** Browser SHALL return explicit unavailable diagnostics
- **AND** it SHALL NOT silently read stale local queue rows

### Requirement: Diagnostics name queue/projection owners
The system SHALL report timing and readiness diagnostics with explicit owner labels for Session Queue Index, Browser Projection Index, projection repair, storage, and sync.

#### Scenario: Review update-state is slow
- **WHEN** Review `update-state` exceeds the slow threshold
- **THEN** diagnostics SHALL identify whether time was spent in session queue update, Browser projection work, projection repair, storage, sync, or unattributed UI work
- **AND** generic `update-state` alone SHALL NOT be the only emitted timing evidence

#### Scenario: Projection repair follows Review answer
- **WHEN** projection repair is scheduled after a Review answer
- **THEN** diagnostics SHALL report the repair as BrowserProjectionIndex or projection-maintenance work
- **AND** Review answer timing SHALL remain attributed to Session Queue Index or storage only when those owners are actually blocking
