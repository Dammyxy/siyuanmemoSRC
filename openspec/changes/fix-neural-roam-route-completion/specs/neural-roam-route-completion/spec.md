## ADDED Requirements

### Requirement: Browser route log reads route-level history
The Browser NeuralRoam route log SHALL read active route-level history rather than engine-local history.

#### Scenario: Route log includes both engines
- **WHEN** the active route has Orbit and Hyperspace route history events
- **THEN** Browser route log reads SHALL return both engines in chronological/paged route-log order
- **AND** switching propulsion mode SHALL NOT hide the other engine's route log events

#### Scenario: Engine history clearing does not clear route log reads
- **WHEN** engine-specific history is cleared
- **THEN** Browser route log reads SHALL still return route history events until route history is explicitly cleared or the route is deleted/discarded

#### Scenario: Cleared route log is not rebuilt from engine history
- **WHEN** route history is explicitly cleared
- **AND** engine-local history still contains older Orbit or Hyperspace entries
- **AND** the active route is later saved for pool or session changes
- **THEN** route history SHALL remain cleared
- **AND** the system SHALL NOT rebuild route history from engine-local history snapshots

### Requirement: Backend advance uses current active route before mismatch checks
Backend NeuralRoam advance SHALL synchronize cached queue route state from SQL before comparing requested route IDs.

#### Scenario: Route switch then backend advance
- **WHEN** a cached backend NeuralRoam queue exists for route A
- **AND** the active SQL route is switched to route B
- **AND** the next backend advance request includes route B
- **THEN** backend advance SHALL operate on route B
- **AND** SHALL NOT return `route-mismatch`

#### Scenario: Stale route feedback still fails closed
- **WHEN** a backend advance request includes a route ID that is not the current active SQL route
- **THEN** backend advance SHALL return `route-mismatch`
- **AND** SHALL NOT apply feedback to the inactive route

### Requirement: Renderer review advance uses synchronized active route
Renderer Review NeuralRoam advance SHALL synchronize its local active route state before submitting backend next or feedback advance requests.

#### Scenario: Review opens with stale renderer route snapshot
- **WHEN** the renderer NeuralRoam queue has stale active route ID A
- **AND** SQL/catalog active route is route B
- **AND** Review opens and requests the first next card
- **THEN** the renderer SHALL synchronize local active route state before submitting `neural-roam.advance`
- **AND** the submitted request SHALL include route B
- **AND** backend SHALL NOT reject the request as `route-mismatch` merely because the renderer snapshot was stale

### Requirement: Review close lifecycle protects dirty temporary routes
Every Review close path that can close a NeuralRoam surface SHALL run the temporary-route close lifecycle before closing it. Native dialog chrome close SHALL NOT be enabled unless it is routed through the same lifecycle.

#### Scenario: Review close control has dirty temporary route
- **WHEN** a user closes a NeuralRoam Review surface through the Review close control
- **AND** the active temporary route has user delta
- **THEN** the system SHALL prompt save/discard/cancel
- **AND** choosing cancel SHALL keep the Review surface open

#### Scenario: Native dialog chrome cannot bypass dirty temporary route
- **WHEN** a NeuralRoam Review surface is opened in a native dialog shell
- **THEN** native dialog chrome close SHALL be disabled or routed through the Review close lifecycle
- **AND** it SHALL NOT close a dirty temporary route without save/discard/cancel handling

#### Scenario: Review close control has clean temporary route
- **WHEN** a user closes a NeuralRoam Review surface through the Review close control
- **AND** the active temporary route has no user delta
- **THEN** the system SHALL discard the temporary route without prompting
- **AND** SHALL close the Review surface
