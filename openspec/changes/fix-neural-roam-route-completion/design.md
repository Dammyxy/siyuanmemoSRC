## Context

The NeuralRoam routes implementation stores route metadata, pool entries, session snapshots, and route history in SQL-backed route state. The Browser panel still projects the "航线日志" from `NeuralRoamQueue.getHistoryPage()`, which delegates to the active engine. That violates the route-level log model because Orbit/Hyperspace history is engine-private and can be cleared independently.

The backend worker keeps a cached `NeuralRoamQueue` per session. Route switches update SQL route state, but `neural-roam.advance` currently checks request route mismatch before forcing that cached queue to re-read active route state.

The renderer Review strategy can also hold a stale local `activeRouteSnapshot` while SQL active route has already changed. If Review opens and immediately calls `next()`, it can send an old route ID to backend advance before the renderer queue has synchronized active route state.

Route log persistence still has one write-model leak: `NeuralRoamQueue.save()` can rebuild route history from Orbit/Hyperspace engine histories. That makes route log clear/retention depend on engine-local history instead of the route-owned event stream.

Review close handling exists in `ReviewView.closeCurrentReviewSurface()`, but native dialog `onClose` bypasses it.

## Goals / Non-Goals

**Goals:**
- Route log reads return active-route chronological route events across engines.
- Browser and Review keep a separate engine-local `双链轨道` view; route log separation must not remove the old engine inspection surface.
- Backend advance accepts the newly active route after a route switch and rejects only truly stale requests.
- Renderer Review next/feedback synchronizes local active route state before sending backend advance requests.
- Route log writes append new route events only; later route saves must not rebuild cleared route logs from engine-local history.
- Every Review close path that can close a NeuralRoam surface runs temporary-route save/discard/cancel handling.
- Add regression tests at the same seams users hit.

**Non-Goals:**
- Do not redesign route persistence or replace SQL repository shape.
- Do not support multiple simultaneous route-bound NeuralRoam review windows.
- Do not change route history recommendation semantics.
- Do not add public backend route management APIs beyond what this fix needs.

## Decisions

- Add route-log read methods to `NeuralRoamQueue` that map `NeuralRoamRouteHistoryEvent` into the existing Browser history view model shape. This keeps UI changes small while making the data source route-level.
- Reuse the existing Browser history list for both surfaces, but route it by subview: `航线日志` reads route-owned `getRouteHistoryPage()`, and `双链轨道` reads current engine-local `getHistoryPage()`.
- Keep activation trace lookup engine-local. Old route-level events may not have a live engine trace; Browser already tolerates missing trace by showing unavailable trace state.
- Add a backend queue method that synchronizes cached active route state before mismatch comparison. This fixes route switch handoff without loosening mismatch protection.
- Add a renderer Review sync boundary before `UnifiedQueueStrategy` sets `NeuralRoamAdvanceCoordinator` route ID. This prevents stale renderer route IDs from being submitted while preserving backend `route-mismatch` for truly stale requests.
- Treat route history as append-only route-owned state. `NeuralRoamQueue.save()` may append newly observed engine visit entries as route events, but route snapshot replacement must preserve the latest catalog route history and must not merge/rebuild from engine history snapshots.
- Disable native Review dialog chrome close until it can be routed through `ReviewView.closeCurrentReviewSurface()`. Header/component close still runs the temporary-route lifecycle and emits the final `close`.

## Risks / Trade-offs

- Route history events have less trace detail than engine history entries. Browser log rows will use route event metadata and may show unavailable trace detail for older/cross-engine entries.
- Two adjacent history tabs increase UI surface area, but they preserve the domain split: propulsion engines own their local trace, route owns the cross-engine visited path.
- Route event append still observes newly created engine history entries as the source of visit metadata, but ownership is one-way: engine history can add new route events, never reconstruct or clear route history after the fact.
- Disabling native dialog close removes one close affordance from the titlebar, but it prevents data loss. The in-component Review close control remains available and already owns the temporary-route save/discard/cancel flow.
