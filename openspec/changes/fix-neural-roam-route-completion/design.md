## Context

The NeuralRoam routes implementation stores route metadata, pool entries, session snapshots, and route history in SQL-backed route state. The Browser panel still projects the "航线日志" from `NeuralRoamQueue.getHistoryPage()`, which delegates to the active engine. That violates the route-level log model because Orbit/Hyperspace history is engine-private and can be cleared independently.

The backend worker keeps a cached `NeuralRoamQueue` per session. Route switches update SQL route state, but `neural-roam.advance` currently checks request route mismatch before forcing that cached queue to re-read active route state.

Review close handling exists in `ReviewView.closeCurrentReviewSurface()`, but native dialog `onClose` bypasses it.

## Goals / Non-Goals

**Goals:**
- Route log reads return active-route chronological route events across engines.
- Backend advance accepts the newly active route after a route switch and rejects only truly stale requests.
- Every Review close path that can close a NeuralRoam surface runs temporary-route save/discard/cancel handling.
- Add regression tests at the same seams users hit.

**Non-Goals:**
- Do not redesign route persistence or replace SQL repository shape.
- Do not support multiple simultaneous route-bound NeuralRoam review windows.
- Do not change route history recommendation semantics.
- Do not add public backend route management APIs beyond what this fix needs.

## Decisions

- Add route-log read methods to `NeuralRoamQueue` that map `NeuralRoamRouteHistoryEvent` into the existing Browser history view model shape. This keeps UI changes small while making the data source route-level.
- Keep activation trace lookup engine-local. Old route-level events may not have a live engine trace; Browser already tolerates missing trace by showing unavailable trace state.
- Add a backend queue method that synchronizes cached active route state before mismatch comparison. This fixes route switch handoff without loosening mismatch protection.
- Disable native Review dialog chrome close until it can be routed through `ReviewView.closeCurrentReviewSurface()`. Header/component close still runs the temporary-route lifecycle and emits the final `close`.

## Risks / Trade-offs

- Route history events have less trace detail than engine history entries. Browser log rows will use route event metadata and may show unavailable trace detail for older/cross-engine entries.
- Disabling native dialog close removes one close affordance from the titlebar, but it prevents data loss. The in-component Review close control remains available and already owns the temporary-route save/discard/cancel flow.
