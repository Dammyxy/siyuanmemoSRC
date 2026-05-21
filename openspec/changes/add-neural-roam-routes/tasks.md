## 1. Route Domain Model

- [ ] 1.1 Add `NeuralRoamRoute` and route state contracts for route metadata, shared pool entries, route history events, and per-engine session snapshots.
- [ ] 1.2 Add a route repository port with in-memory test implementation before SQL wiring.
- [ ] 1.3 Add route selection operations: create, rename, delete, switch, save temporary, discard temporary, and list by current temporary/default/last-used order.
- [ ] 1.4 Enforce route invariants: `默认航线` exists, default route cannot be deleted, route names may duplicate, route count is unlimited, and deleting a route never deletes cards or SiYuan blocks.
- [ ] 1.5 Add route-scoped stats that count only the active route and preserve per-route counts for route menus.

## 2. Legacy Migration And Queue Integration

- [ ] 2.1 Migrate legacy NeuralRoam state into `默认航线` on read, preserving Orbit seed/station/session and Hyperspace source/station/session data.
- [ ] 2.2 Update `NeuralRoamQueue` to use global `activeRouteId` for all seed, station, session, and stats operations.
- [ ] 2.3 Make route switching a hard boundary that clears current item, pending next, pending start, and forward/back cursor state.
- [ ] 2.4 Ensure only one active NeuralRoam review surface is supported in v1 and route switching affects the open surface.
- [ ] 2.5 Add route-scoped history limit enforcement using existing NeuralRoam history setting defaults and clamps.

## 3. Shared Route Pools Across Engines

- [ ] 3.1 Replace engine-global Orbit seed/station ownership with active-route shared concept pool and station pool.
- [ ] 3.2 Make Hyperspace interpret the active route's shared concept pool/station pool through its source/anchor semantics without maintaining a separate route asset pool.
- [ ] 3.3 Keep Orbit session state private to Orbit: current focus, visited, display path, navigation mode, and engine history.
- [ ] 3.4 Keep Hyperspace session state private to Hyperspace: lead source, visited, frontier, display path, navigation mode, and engine history.
- [ ] 3.5 Ensure switching Orbit/Hyperspace changes propulsion mode only and does not change `activeRouteId`.

## 4. Temporary Route Lifecycle

- [ ] 4.1 Update `从当前块临时漫游` to create a temporary route, set it active, seed/focus it from the current block, and remember the previous route ID.
- [ ] 4.2 Update `从概念临时漫游` to create a temporary route, set it active, seed/focus it from the selected concept, and remember the previous route ID.
- [ ] 4.3 Do not show a naming prompt when starting a temporary route; generate `临时：{title}` from the entry context.
- [ ] 4.4 Save a temporary route in place, preserving route ID, pools, engine sessions, and route history, and keep it active.
- [ ] 4.5 Discard unsaved temporary routes on close when no user delta exists.
- [ ] 4.6 Prompt `保存为航线 / 丢弃 / 取消` when closing or replacing a temporary route with user delta.
- [ ] 4.7 When starting a new temporary route while another temporary route is active, discard the old one if clean or prompt if it has user delta.

## 5. Route History

- [ ] 5.1 Append route history events whenever Orbit activates a node.
- [ ] 5.2 Append route history events whenever Hyperspace activates a node.
- [ ] 5.3 Keep route history chronological and non-deduped so repeated node visits are preserved.
- [ ] 5.4 Keep route history independent from engine recommendation state; it must not influence visited/frontier/dedupe decisions.
- [ ] 5.5 Keep route history independent from engine history clearing; provide a separate clear-route-log operation if needed.
- [ ] 5.6 Drop route history with an unsaved discarded temporary route and preserve it when a temporary route is saved.

## 6. SQL Persistence

- [ ] 6.1 Add SQL schema and repository for `neural_roam_routes`.
- [ ] 6.2 Add SQL schema and repository for `neural_roam_route_pool_entries`.
- [ ] 6.3 Add SQL schema and repository for `neural_roam_route_history_events`.
- [ ] 6.4 Add SQL schema and repository for `neural_roam_route_session_snapshots`.
- [ ] 6.5 Add SQL schema and repository for singleton active route/mode state.
- [ ] 6.6 Implement legacy queue-state migration into SQL route rows and session snapshots without runtime dual-write to old state.
- [ ] 6.7 Add paged route history reads and route-filtered pool/station reads for SRS Browser.
- [ ] 6.8 Add SQL cleanup behavior for deleting routes and discarding temporary routes.

## 7. Review UI

- [ ] 7.1 Add current route display to NeuralRoam Review header.
- [ ] 7.2 Add route selector menu with switch route, create route, rename route, delete route, save temporary route, open route log, and open Browser NeuralRoam panel actions.
- [ ] 7.3 Switching routes from Review clears the current card and fetches from the selected route.
- [ ] 7.4 Show current-route counts in the Review header and per-route counts in the route selector where available.
- [ ] 7.5 Ensure temporary route close/save/discard prompts are reachable from Review close lifecycle.

## 8. SRS Browser NeuralRoam Panel

- [ ] 8.1 Add route selector, create, rename, delete, save temporary, and switch actions to the SRS Browser NeuralRoam panel.
- [ ] 8.2 Make Browser concept pool management route-aware.
- [ ] 8.3 Make Browser station management route-aware.
- [ ] 8.4 Add route log browsing from the Browser NeuralRoam panel with paged SQL reads.
- [ ] 8.5 Confirm route switching from Browser resets an open NeuralRoam Review before applying the global `activeRouteId` change.

## 9. Contracts And Backend Runtime

- [ ] 9.1 Extend backend NeuralRoam advance/read contracts with route ID where needed while keeping `activeRouteId` as the default.
- [ ] 9.2 Ensure backend advance starts and feedback apply to the active route and cannot leak into another route.
- [ ] 9.3 Add route management commands for Browser/Review UI without exposing direct SQL mutation from UI.
- [ ] 9.4 Keep route operations inside the existing backend/application ownership path and avoid UI SQL access.

## 10. Tests And Validation

- [ ] 10.1 Add route domain tests for create/switch/delete/save/discard/default-route invariants.
- [ ] 10.2 Add legacy migration tests from v8 NeuralRoam state to `默认航线`.
- [ ] 10.3 Add Orbit tests proving active-route seed/station isolation and no fallback to another route.
- [ ] 10.4 Add Hyperspace tests proving shared route assets and private Hyperspace session/frontier.
- [ ] 10.5 Add temporary route tests for clean discard, delta prompt, save-in-place, and replacing one temporary route with another.
- [ ] 10.6 Add route history tests for chronological non-deduped events across both engines and no recommendation impact.
- [ ] 10.7 Add SQL repository tests for route metadata, pool entries, route history pagination, session snapshots, and delete/discard cleanup.
- [ ] 10.8 Add Review header/selector tests for route display, switching reset, temporary save/discard actions, and route counts.
- [ ] 10.9 Add SRS Browser NeuralRoam panel tests for route-aware concept pool/station management and route log browsing.
- [ ] 10.10 Run targeted NeuralRoam, backend advance, Review, Browser, SQL repository, and migration tests.
- [ ] 10.11 Run `pnpm run check:boundaries` and `pnpm build`.
