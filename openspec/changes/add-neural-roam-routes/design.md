## Context

The completed NeuralRoam entry-action work made Review actions start from explicit focus IDs, but it intentionally did not isolate path state. The current queue still has one concept pool, one station pool, and one active path state. That is why temporary concept roam can still fall back to unrelated concept networks.

This change introduces `航线` as the user-visible exploration context. A route is not a separate queue instance. A route is state inside `NeuralRoamQueue`, with SQL persistence for the parts that need paging and management. The first version keeps one global active route and one active NeuralRoam review surface.

## Goals / Non-Goals

**Goals:**
- Make `航线` a visible, switchable object in the Review header.
- Make the SRS Browser NeuralRoam panel the full route management center.
- Preserve old NeuralRoam data by migrating it to `默认航线`.
- Make concept pool and station pool private to a route and shared by Orbit/Hyperspace inside that route.
- Keep Orbit and Hyperspace engine histories/navigation state separate inside the route.
- Add a route-level chronological log of real visited nodes from both engines.
- Make temporary roam create a temporary active route, saveable in place or discarded.
- Store route metadata, pool entries, route log events, and engine session snapshots in SQL.

**Non-Goals:**
- Do not support multiple simultaneous NeuralRoam review windows bound to different routes in the first version.
- Do not make route history participate in recommendation or dedupe. Engine session state remains the recommendation authority.
- Do not delete real cards or SiYuan blocks when deleting routes or pool entries.
- Do not add route count limits or warning prompts.
- Do not create a separate `TemporaryNeuralRoamQueue` instance.

## Product Model

### Route naming

User-facing name: `航线`.

Default labels:
- `默认航线`: legacy/default route.
- `临时：{title}`: unsaved route created by temporary roam.
- `保存为航线`: converts a temporary route to an ordinary route.
- `航线日志`: route-level event log.

### Route state

Conceptual state:

```ts
type NeuralRoamRoute = {
  id: string;
  name: string;
  temporary: boolean;
  previousRouteId?: string | null;
  initialSeedNodeIds?: string[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;

  seedPool: RoutePoolEntry[];      // shared concept pool
  anchorPool: RoutePoolEntry[];    // shared station pool
  orbitSession: ConceptNeuralSessionState;
  hyperspaceSession: HyperspaceSessionState;
};
```

`routeHistory` is stored as append-only route events, not as recommendation state:

```ts
type NeuralRoamRouteHistoryEvent = {
  eventId: string;
  routeId: string;
  engineMode: 'orbit' | 'hyperspace';
  nodeId: string;
  cardId?: string | null;
  title: string;
  activationKind: string;
  sourceNodeId?: string | null;
  visitedAt: number;
};
```

Route history preserves repeated visits and chronological continuity. It is not deduped and does not influence engine recommendation.

### Engine model

Orbit and Hyperspace are propulsion modes inside one active route:

```text
activeRouteId = 天体物理
engineMode = orbit      -> use 天体物理.seedPool/anchorPool + 天体物理.orbitSession
engineMode = hyperspace -> use 天体物理.seedPool/anchorPool + 天体物理.hyperspaceSession
```

The route's concept pool and station pool are shared. Engine histories, visited sets, frontier, current focus, and display path remain engine-private.

### Temporary route lifecycle

Temporary concept/current-block roam:

```text
previousRouteId = activeRouteId
create temp route
activeRouteId = temp route
open NeuralRoam
```

Closing an unsaved temporary route:
- If no user delta exists, discard silently.
- If user delta exists, show `保存为航线 / 丢弃 / 取消`.
- User delta means at least one of: seed pool beyond initial seed, non-empty station pool, route history length greater than the initial focus event, or an explicit add concept/station action.

Saving a temporary route:
- Convert in place: `temporary = false`.
- Keep route ID, concept pool, stations, engine sessions, and route history.
- Stay on the saved route.

Starting another temporary route while one is active:
- If the current temporary route has user delta, ask save/discard/cancel.
- Otherwise discard it and create the new temporary route.

### Deletion

Deleting a route removes only route state:
- route metadata
- route pool entries
- route history events
- engine session snapshots

It does not delete `FSRSCard`, SiYuan blocks, or the same node's membership in other routes.

`默认航线` cannot be deleted. Deleting the current ordinary route switches to `默认航线`.

## UI Decisions

### Review header

Review header shows the current route and lets users switch routes:

```text
航线：天体物理 ▼
```

The Review route menu supports:
- switch route
- create route
- save temporary route when active route is temporary
- rename route
- delete route
- open route log
- open SRS Browser NeuralRoam panel

Switching routes is a hard review boundary:
- clear current item
- clear pending next
- clear forward/back cursor
- next fetches from the new active route

If another surface switches routes while a NeuralRoam review is open, the review surface resets to the selected route.

### SRS Browser NeuralRoam panel

The SRS Browser NeuralRoam panel is the full management center:
- route selector/create/rename/delete/save temporary
- route-aware concept pool management
- route-aware station management
- route log browsing

Review stays lightweight. It links to the management panel but does not duplicate full pool/station management.

### Counts and ordering

Header counts show the current route only. Route menus may show per-route counts.

Route list order:
- current temporary route first when present
- `默认航线`
- ordinary routes by `lastUsedAt desc`

No hard route count limit and no route-count warning.

## Persistence Design

### SQL-backed route data

SQL tables:

```text
neural_roam_routes
  route_id primary key
  name
  temporary
  previous_route_id null
  created_at
  updated_at
  last_used_at

neural_roam_route_pool_entries
  route_id
  node_id
  kind              -- seed | anchor
  node_kind         -- concept | virtual | element
  role              -- optional hyperspace/source role
  priority
  added_at
  visited_at
  preview
  primary key(route_id, node_id, kind)

neural_roam_route_history_events
  route_id
  event_id primary key
  engine_mode
  node_id
  card_id null
  title
  activation_kind
  source_node_id null
  visited_at

neural_roam_route_session_snapshots
  route_id
  engine_mode
  snapshot_json
  updated_at
  primary key(route_id, engine_mode)

neural_roam_route_active
  singleton_id primary key
  active_route_id
  engine_mode
  updated_at
```

Route history uses the existing NeuralRoam history limit: default 3000, clamped 200..5000 per route. Route count is unlimited.

### Migration

On first read of legacy queue state:
- create `默认航线`
- put legacy Orbit seed pool, station pool, and session into the default route
- put legacy Hyperspace source/station pool and session into the default route using the shared pool mapping where possible
- set `activeRouteId = default`

After migration, writes use only the new route SQL model and session snapshots. No runtime dual-write to old queue-state shape.

## Risks / Trade-offs

- Covering Orbit and Hyperspace together is broader than an Orbit-only fix. Mitigation: shared route pool API first, then engine sessions, then UI.
- SQL persistence can obscure behavior bugs if introduced before the route model is tested. Mitigation: tests first against route domain model and in-memory repository, then SQL repository parity tests.
- Shared concept/station pools across engines require mapping Hyperspace source roles to shared route pool entries. Mitigation: keep optional role metadata and have each engine interpret shared entries through its existing semantics.
- Route switching from Browser while Review is open can surprise users. Mitigation: show a confirmation when switching would reset an open NeuralRoam review.

## Migration Plan

1. Add route domain model and in-memory route repository contract.
2. Wrap current legacy state as `默认航线` and make `NeuralRoamQueue` operate through `activeRouteId`.
3. Make Orbit and Hyperspace read/write shared route seed/station pools while keeping engine-private sessions.
4. Add temporary route lifecycle and route history event append.
5. Add SQL tables/repositories and migrate legacy queue state into SQL.
6. Add Review route selector and route switching reset behavior.
7. Add SRS Browser NeuralRoam panel route management, route-aware pool/station management, and route log browsing.
8. Validate with focused tests, migration tests, boundary checks, and build.
