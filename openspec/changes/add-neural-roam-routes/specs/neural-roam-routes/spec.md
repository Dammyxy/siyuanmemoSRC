## ADDED Requirements

### Requirement: NeuralRoam exposes routes as first-class exploration contexts
NeuralRoam SHALL expose user-visible routes called `航线`.

#### Scenario: Default route exists
- **WHEN** NeuralRoam initializes
- **THEN** a `默认航线` route SHALL exist
- **AND** the system SHALL use it as the active route when no other active route is available

#### Scenario: Route names duplicate
- **WHEN** a user creates or saves a route with a name already used by another route
- **THEN** the system SHALL allow the duplicate display name
- **AND** SHALL distinguish routes by stable internal route IDs

#### Scenario: Route count grows
- **WHEN** a user creates many ordinary routes
- **THEN** the system SHALL NOT enforce a hard route count limit
- **AND** SHALL NOT show route-count warning prompts

### Requirement: Routes own shared concept and station assets
Each NeuralRoam route SHALL own a private concept pool and station pool shared by Orbit and Hyperspace.

#### Scenario: Active route concept pool is used
- **WHEN** NeuralRoam selects the next card in either Orbit or Hyperspace
- **THEN** the engine SHALL read candidate source assets from the active route's concept pool and station pool
- **AND** SHALL NOT fall back to another route's pools

#### Scenario: Concept is added while a route is active
- **WHEN** a user adds a concept to NeuralRoam
- **THEN** the concept SHALL be added to the active route's concept pool
- **AND** SHALL NOT be added to inactive routes

#### Scenario: Station is established while a route is active
- **WHEN** a user establishes a station
- **THEN** the station SHALL be added to the active route's station pool
- **AND** SHALL NOT be added to inactive routes

### Requirement: Routes keep engine-specific propulsion state
Each route SHALL keep separate Orbit and Hyperspace propulsion state while sharing route assets.

#### Scenario: Switching propulsion mode
- **WHEN** the user switches between Orbit and Hyperspace
- **THEN** `activeRouteId` SHALL remain unchanged
- **AND** the selected engine SHALL use its own session, history, visited state, and navigation state inside the active route

#### Scenario: Orbit advances
- **WHEN** Orbit advances within a route
- **THEN** only the active route's Orbit session state SHALL change
- **AND** the active route's Hyperspace session state SHALL remain engine-private

#### Scenario: Hyperspace advances
- **WHEN** Hyperspace advances within a route
- **THEN** only the active route's Hyperspace session state SHALL change
- **AND** the active route's Orbit session state SHALL remain engine-private

### Requirement: Route switching is global and resets active NeuralRoam review state
The active route SHALL be global for the first implementation.

#### Scenario: User switches route from Review
- **WHEN** a user switches the NeuralRoam route from the Review header
- **THEN** the Review surface SHALL clear the current item, pending next item, pending start intent, and forward/back cursor state
- **AND** the next item SHALL be fetched from the selected route

#### Scenario: User switches route from SRS Browser
- **WHEN** a user switches the route from the SRS Browser NeuralRoam panel while a NeuralRoam Review is open
- **THEN** the system SHALL warn that the open NeuralRoam Review will reset
- **AND** after confirmation SHALL set the global active route and reset the Review surface to the selected route

#### Scenario: Multiple route-bound NeuralRoam review windows
- **WHEN** a user opens NeuralRoam more than once
- **THEN** the first implementation SHALL NOT support multiple simultaneous NeuralRoam Review windows bound to different routes

### Requirement: Temporary roam creates temporary routes
Temporary NeuralRoam entry actions SHALL create active temporary routes.

#### Scenario: Temporary concept roam starts
- **WHEN** a user starts `从概念临时漫游`
- **THEN** the system SHALL create a temporary route named `临时：{concept title}`
- **AND** SHALL set it as the active route
- **AND** SHALL seed/focus it with the selected concept
- **AND** SHALL remember the previous route ID

#### Scenario: Temporary current-block roam starts
- **WHEN** a user starts `从当前块临时漫游`
- **THEN** the system SHALL create a temporary route named from the current block context
- **AND** SHALL set it as the active route
- **AND** SHALL seed/focus it from the current block
- **AND** SHALL remember the previous route ID

#### Scenario: Temporary route is clean on close
- **WHEN** a temporary route closes without user delta
- **THEN** the system SHALL discard the temporary route without prompting
- **AND** SHALL restore the previous route when available

#### Scenario: Temporary route has user delta on close
- **WHEN** a temporary route closes after the user added concepts, added stations, or generated additional route history
- **THEN** the system SHALL prompt with save, discard, and cancel choices

#### Scenario: Temporary route is saved
- **WHEN** a user saves a temporary route
- **THEN** the system SHALL convert that route in place to an ordinary route
- **AND** SHALL preserve its route ID, concept pool, station pool, engine sessions, and route history
- **AND** SHALL keep the saved route active

#### Scenario: New temporary route replaces current temporary route
- **WHEN** a user starts another temporary route while a temporary route is active
- **THEN** the system SHALL discard the current temporary route if it has no user delta
- **AND** SHALL prompt save/discard/cancel if it has user delta

### Requirement: Route history records real visited nodes
Each route SHALL maintain a route-level history log of real visited nodes from both engines.

#### Scenario: Orbit visits a node
- **WHEN** Orbit activates a node
- **THEN** the system SHALL append a route history event with engine mode `orbit`

#### Scenario: Hyperspace visits a node
- **WHEN** Hyperspace activates a node
- **THEN** the system SHALL append a route history event with engine mode `hyperspace`

#### Scenario: Same node is visited more than once
- **WHEN** a route visits the same node multiple times
- **THEN** route history SHALL preserve each visit as a separate chronological event
- **AND** SHALL NOT dedupe repeated nodes

#### Scenario: Route history and recommendation state
- **WHEN** an engine selects recommendations
- **THEN** the engine SHALL use its own visited/history/frontier state
- **AND** SHALL NOT use route history for recommendation dedupe

#### Scenario: Engine history is cleared
- **WHEN** a user clears Orbit or Hyperspace engine history
- **THEN** route history SHALL remain intact unless the user explicitly clears route history

#### Scenario: Route history limit
- **WHEN** route history exceeds the configured NeuralRoam history limit
- **THEN** the system SHALL retain the newest events within the configured limit
- **AND** SHALL use the existing default of 3000 and clamp range 200..5000

### Requirement: Review header exposes route controls
The NeuralRoam Review header SHALL show and control the current route.

#### Scenario: Route header renders
- **WHEN** NeuralRoam Review is open
- **THEN** the header SHALL show the current route name

#### Scenario: Route menu opens
- **WHEN** the user opens the route selector from Review
- **THEN** the menu SHALL allow switching routes
- **AND** SHALL expose create, rename, delete, save temporary route when applicable, open route log, and open SRS Browser NeuralRoam panel actions

#### Scenario: Header counts
- **WHEN** the header shows NeuralRoam counts
- **THEN** the counts SHALL describe the current route rather than all routes combined

### Requirement: SRS Browser NeuralRoam panel manages routes
The SRS Browser NeuralRoam panel SHALL be the full route management surface.

#### Scenario: Browser route management
- **WHEN** the user opens the SRS Browser NeuralRoam panel
- **THEN** the panel SHALL allow route selection, creation, renaming, deletion, and saving a temporary route when applicable

#### Scenario: Browser concept pool management
- **WHEN** the user manages NeuralRoam concept pool entries in SRS Browser
- **THEN** the panel SHALL manage entries for the selected route

#### Scenario: Browser station management
- **WHEN** the user manages NeuralRoam stations in SRS Browser
- **THEN** the panel SHALL manage stations for the selected route

#### Scenario: Browser route log
- **WHEN** the user opens a route log from SRS Browser
- **THEN** the panel SHALL show route history events for the selected route with paged reads

### Requirement: Route deletion does not delete source data
Deleting routes or route pool entries SHALL only mutate route state.

#### Scenario: Delete route
- **WHEN** a user deletes an ordinary route
- **THEN** the system SHALL remove route metadata, pool entries, route history, and session snapshots
- **AND** SHALL NOT delete FSRS cards or SiYuan blocks

#### Scenario: Delete default route
- **WHEN** a user attempts to delete `默认航线`
- **THEN** the system SHALL prevent deletion

#### Scenario: Delete current route
- **WHEN** a user deletes the current ordinary route
- **THEN** the system SHALL switch the active route to `默认航线`
