## ADDED Requirements

### Requirement: Route history preserves activation lineage
The system SHALL persist Neural Roam route-history events with enough lineage fields to reconstruct activation chains for newly recorded orbit and hyperspace traversal events.

#### Scenario: New orbit route event keeps source event
- **WHEN** an orbit history entry with `sourceEventId`, `branchRootNodeId`, and `activationKind` is saved into the active route history
- **THEN** the route-history event MUST preserve those fields and MUST NOT be converted to a legacy single-node entry

#### Scenario: New hyperspace route event keeps propagation metadata
- **WHEN** a hyperspace history entry with `sourceEventId`, `depth`, `sourceRole`, and `conductionScore` is saved into the active route history
- **THEN** the route-history event MUST preserve those fields for later wake-chain rendering

#### Scenario: Old route event remains explicit legacy
- **WHEN** a route-history event lacks lineage fields because it was persisted by an older version
- **THEN** the UI MUST mark its activation trace incomplete instead of inventing a source chain

### Requirement: Activation trace lookup spans Neural Roam engines
The system SHALL resolve an activation trace by event id across orbit and hyperspace histories through the `NeuralRoamQueue` facade.

#### Scenario: Active engine differs from event engine
- **WHEN** the browser requests an activation trace for a hyperspace event while orbit is the active engine
- **THEN** `NeuralRoamQueue.getActivationTrace(eventId)` MUST return the hyperspace trace if the event exists in hyperspace history

#### Scenario: Route history entry maps to exact engine trace
- **WHEN** a route-history row is selected and its event id still exists in an engine history
- **THEN** the wake panel MUST show the exact engine activation chain for that event

### Requirement: Browser wake panel tracks selected history surface
The system SHALL keep the Neural Roam browser history list and wake panel synchronized for both double-link track and route-log subviews.

#### Scenario: Double-link track selection changes wake
- **WHEN** the user selects an entry in the double-link track subview
- **THEN** the wake panel MUST show the selected entry's activation chain and highlight the selected event

#### Scenario: Route-log selection changes wake
- **WHEN** the user selects an entry in the route-log subview
- **THEN** the wake panel MUST show the route entry's exact activation chain when available, or an explicit incomplete trace when only legacy route data exists

### Requirement: Review journey header binds progress to current neural state
The system SHALL bind Neural Roam review-header progress to the current route, engine, focus/current node, and current event.

#### Scenario: Orbit center switch updates header counters
- **WHEN** the current orbit center changes during review
- **THEN** the review journey header MUST update center label, viewed count, round total, and remaining count without reusing stale counters from the previous center

#### Scenario: Hyperspace depth updates header counters
- **WHEN** hyperspace advances to a different current event or depth
- **THEN** the review journey header MUST update current depth, max depth, and activation-source label for that event

### Requirement: Review journey header shows engine-specific path context
The system SHALL expose a compact expanded header view that shows engine-specific path context in addition to numeric progress.

#### Scenario: Orbit expanded header shows current track
- **WHEN** the review journey header is expanded in orbit mode
- **THEN** it MUST show current orbit center and recent orbit path or round nodes derived from the batch snapshot

#### Scenario: Hyperspace expanded header shows activation path
- **WHEN** the review journey header is expanded in hyperspace mode
- **THEN** it MUST show activation source and recent propagation path derived from the batch snapshot
