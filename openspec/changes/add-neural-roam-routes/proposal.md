## Why

NeuralRoam has one shared path state today. Temporary CDF/concept roam can start from the selected concept, but the next-card path still falls back to the persistent NeuralRoam concept pool when the focused graph is exhausted. Users need an explicit way to create, switch, save, and discard independent exploration routes without losing the existing concept pool, stations, or history.

The product language for this change is `航线`: a visible NeuralRoam route. A route is the user's named exploration context. It owns the concept pool, stations, route log, and the per-engine navigation state for Orbit and Hyperspace. Orbit and Hyperspace are propulsion modes inside the same route, not separate route systems.

NeuralRoam state is also growing into a management surface. Route metadata, route pool entries, route history events, and route session snapshots should move to SQL where they can be filtered, paged, and managed from the SRS Browser NeuralRoam panel.

## What Changes

- Add NeuralRoam routes (`航线`) as first-class objects with global `activeRouteId`.
- Keep the existing user's NeuralRoam state by migrating old state into `默认航线`.
- Make the Review header show the current route and allow route switching. Switching routes clears the current NeuralRoam review card and fetches from the new route.
- Add temporary routes for `从当前块临时漫游` and `从概念临时漫游`. Temporary routes become the active route, are discarded by default, and can be saved in place as ordinary routes.
- Keep route concept pool and station pool shared by Orbit and Hyperspace. Each engine keeps its own navigation/session state and engine history inside the active route.
- Add a route-level event log that records the real visited nodes from both engines in chronological order without deduplication.
- Move NeuralRoam route data that benefits from filtering/paging to SQL: route metadata, pool entries, route history events, and engine session snapshots.
- Make the SRS Browser NeuralRoam panel the route management center for switching, creating, renaming, deleting, saving temporary routes, managing concept pool/stations by route, and opening route logs.
- Keep only one active NeuralRoam review surface in the first version. Route switching is global and affects the open NeuralRoam review.

## Capabilities

### New Capabilities
- `neural-roam-routes`: Named and temporary NeuralRoam routes with shared route assets, per-engine propulsion state, route logs, and Review/Browser route management.
- `neural-roam-route-persistence`: SQL-backed storage for NeuralRoam routes, route pool entries, route history events, and route session snapshots.

### Modified Capabilities
- `neural-roam-entry-actions`: Temporary Review entry actions create temporary routes instead of starting a path inside the global pool.

## Impact

- Affected UI: Review v2 header/toolbar, route selector/menu, SRS Browser NeuralRoam panel, route log dialog/panel, route-aware concept pool and station management.
- Affected application layer: NeuralRoam entry action service, `DialogManager.openNeuralRoamDialog`, route switching lifecycle, temporary-route close/save prompts, Browser route management commands.
- Affected queue/domain layer: `NeuralRoamQueue`, Orbit/Hyperspace state ownership, route event logging, route-scoped stats, route-scoped seed/station operations, migration from legacy state to `默认航线`.
- Affected infrastructure/backend: SQL schema/repositories for route metadata, pool entries, route history events, session snapshots, backend advance/read/write contracts, and queue state migration.
- Verification requires route domain tests, legacy migration tests, Review route selector tests, temporary route lifecycle tests, Browser NeuralRoam panel tests, SQL repository tests, backend advance tests, boundary checks, and build.
