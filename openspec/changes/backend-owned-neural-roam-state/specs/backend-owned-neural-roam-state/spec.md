## ADDED Requirements

### Requirement: Backend Owns NeuralRoam Runtime State
The system SHALL treat backend worker state as the runtime authority for NeuralRoam active route, engine mode, Orbit session, Hyperspace session, source/seed pools, anchor pools, history, batch progress, and counters.

#### Scenario: Backend advance updates authoritative state
- **WHEN** Review requests `neural-roam.advance` for next, rate, or skip
- **THEN** the backend SHALL update authoritative NeuralRoam state and return the updated state in the response

#### Scenario: Frontend local state cannot override backend state
- **WHEN** Browser or Review has stale local NeuralRoam queue state
- **THEN** the next backend read or command result SHALL replace the stale UI state instead of merging local state as authority

### Requirement: Backend Exposes NeuralRoam View State
The system SHALL expose a NeuralRoam-specific backend read model containing all data needed by Browser and Review NeuralRoam surfaces.

#### Scenario: Browser reads Orbit view state
- **WHEN** Browser opens NeuralRoam in Orbit mode
- **THEN** the backend view state SHALL include current route, current node, source rail entries, anchors, engine-local history, route history, Orbit round progress, and counters

#### Scenario: Browser reads Hyperspace view state
- **WHEN** Browser opens NeuralRoam in Hyperspace mode
- **THEN** the backend view state SHALL include current route, current node, source rail entries, anchors, engine-local history, route history, Hyperspace depth progress, and counters

#### Scenario: Review reads stats from backend view state
- **WHEN** Review renders NeuralRoam queue stats
- **THEN** it SHALL use backend view-state progress and counters rather than independently computing stats from frontend queue snapshots

### Requirement: Orbit and Hyperspace UI Parity
The system SHALL provide non-empty and semantically correct source rail and progress data for both Orbit and Hyperspace when the active NeuralRoam route has a source, focus, or temporary current-block context.

#### Scenario: Orbit temporary current-block roam has visible context
- **WHEN** a user starts temporary current-block roam in Orbit mode
- **THEN** the Orbit view state SHALL expose a source or focus context suitable for the 双链轨道 panel and SHALL not return an empty rail solely because the current block is not a concept card

#### Scenario: Orbit round progress survives route restore
- **WHEN** Orbit advances from a focus to a neighbor and the route state is restored from backend persistence
- **THEN** Orbit round progress SHALL preserve the viewed neighbor count unless the route/session was explicitly reset

#### Scenario: Hyperspace remains independent from Orbit counters
- **WHEN** Hyperspace reports depth progress
- **THEN** it SHALL not depend on Orbit `neighborsViewed` and SHALL remain correct after Orbit route restoration

### Requirement: NeuralRoam Commands Are Backend-Mediated
The system SHALL route runtime NeuralRoam mutations through backend-owned command handling once the backend view-state cutover is active.

#### Scenario: Route mutation returns updated view state
- **WHEN** the user switches, creates, replaces, saves, or discards a NeuralRoam route
- **THEN** the mutation SHALL complete through backend authority and return or trigger a refreshed backend view state

#### Scenario: Source and anchor mutation returns updated view state
- **WHEN** the user adds or removes a NeuralRoam source, seed, or anchor
- **THEN** the mutation SHALL complete through backend authority and Browser/Review SHALL render the updated backend view state

#### Scenario: Engine mode mutation returns updated view state
- **WHEN** the user switches between Orbit and Hyperspace
- **THEN** the mutation SHALL complete through backend authority and preserve the appropriate carry-current-node behavior in backend state

### Requirement: Frontend State Machine Is Demoted To Adapter
The system SHALL prevent frontend runtime paths from independently advancing or mutating NeuralRoam state after backend ownership is enabled.

#### Scenario: Frontend next cannot advance local state
- **WHEN** Review requests the next NeuralRoam item after backend ownership is enabled
- **THEN** the frontend SHALL call backend advance and SHALL NOT call local `getNextCard()` as an authoritative state-machine step

#### Scenario: Frontend Browser refresh cannot warm up local queue as authority
- **WHEN** Browser refreshes NeuralRoam data after backend ownership is enabled
- **THEN** it SHALL read backend view state and SHALL NOT rely on local `getCards()` warm-up to populate source rails or counters

#### Scenario: Missing backend capability fails closed
- **WHEN** backend NeuralRoam state or command capability is unavailable
- **THEN** Browser and Review SHALL show explicit unavailable state rather than falling back to hidden local state mutation

### Requirement: Regression Coverage For Current Failures
The system SHALL include regression tests for the observed Orbit/Hyperspace divergence and backend ownership boundaries.

#### Scenario: Orbit source rail regression
- **WHEN** a test starts temporary current-block roam with a non-concept focus and a concept seed
- **THEN** the backend view state SHALL include visible Orbit context and the Browser view model SHALL not be empty

#### Scenario: Orbit counter regression
- **WHEN** a test advances Orbit from focus to neighbor and reloads route/backend state
- **THEN** the displayed Orbit progress SHALL still reflect the neighbor visit

#### Scenario: No local authority regression
- **WHEN** backend ownership is enabled in tests
- **THEN** frontend NeuralRoam runtime tests SHALL verify that next, stats, source rails, anchors, and history come from backend view state
