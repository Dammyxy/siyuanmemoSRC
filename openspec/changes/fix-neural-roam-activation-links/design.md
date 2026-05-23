## Context

Neural Roam has three related state surfaces:

- active engine history in `ConceptNeuralQueue` and `HyperspaceEngine`
- persisted route history in `NeuralRoamRouteCatalog`
- UI state in the browser wake panel and review journey header

The engine histories preserve exact activation lineage through `sourceEventId`, `branchRootNodeId`, `activationKind`, and engine-specific metadata. Route history currently stores only `sourceNodeId`, then maps entries back with `traceQuality: 'legacy'` and `sourceEventId: null`, which prevents exact chain reconstruction. The review header also caches neural counters by engine mode only, so orbit center changes can reuse stale progress.

## Goals / Non-Goals

**Goals:**

- Preserve exact activation lineage when engine history is copied into route history.
- Resolve activation traces by event id across orbit and hyperspace, independent of the currently active engine.
- Keep route history, browser wake panel, and review journey header bound to the same current engine/node/event state.
- Add regression tests at queue, browser, and review seams.

**Non-Goals:**

- Rebuild the Neural Roam route UI design.
- Reconstruct exact chains for historical route entries that were already persisted without `sourceEventId`.
- Change scheduler or card review scoring behavior.
- Add compatibility fallback that hides missing active-path data.

## Decisions

### Preserve route history as a first-class lineage record

Extend `NeuralRoamRouteHistoryEvent` with fields already present in `NeuralRoamHistoryEntry`: `sourceEventId`, `branchRootNodeId`, `sourceRole`, `origin`, `traceQuality`, `depth`, and `conductionScore`.

Rationale: route history is a persisted view of engine traversal. It must not discard the event chain if UI needs a wake/activation path later.

Alternative considered: keep route history small and look up engine history only. Rejected because route history outlives active engine windows and route switches.

### Cross-engine trace lookup belongs in `NeuralRoamQueue`

Update `getActivationTrace(eventId)` and `getHistoryEntryByEventId(eventId)` to search orbit and hyperspace histories, not only `getActiveEngine()`.

Rationale: UI has one queue facade. Browser code should not know which engine produced an event id.

Alternative considered: add browser-side routing by `engineMode`. Rejected because it leaks queue internals into UI and duplicates lookup rules.

### Route-history trace resolution prefers exact engine trace

When a route-history entry points to an event still present in an engine history, the trace panel must show the exact engine trace. If only route history remains, it can show the preserved route lineage. Old entries without lineage remain explicitly legacy/incomplete.

Rationale: new data should be exact; old data should be honest.

### Review header progress cache must include state identity

Change neural header cache identity from `engineMode` only to include active route id, current/focus node id, current event id, and progress values when available.

Rationale: the header placeholder is shown before auxiliary data refresh completes. A coarse cache key causes visible stale orbit counters after focus switches.

### Header detail uses existing batch path data

Use `NeuralRoamBatchSnapshot.roundNodes` and `recentPath` to show compact engine-specific path context in expanded header state.

Rationale: the batch snapshot is already the review-surface contract; adding direct queue reads to the component would violate ownership.

## Risks / Trade-offs

- Persisted route schema grows -> migration must tolerate missing fields and normalize them to null for old data.
- Cross-engine lookup can find duplicate event ids only if event generation collides -> event ids are generated unique enough; keep first exact match order deterministic.
- Old route entries still cannot become exact -> UI must label incomplete legacy traces rather than pretending chain exists.
- Header detail can lag if batch snapshot is stale -> cache key and ReviewView reactive dependencies must bind to current node/event/progress.

## Migration Plan

1. Extend route event types and normalizers with optional lineage fields.
2. Write all new route-history events with full lineage from engine history entries.
3. Read missing fields from older route history as null and mark only those entries legacy.
4. Update cross-engine trace lookup and browser route-history selection.
5. Update review header cache identity and detail rendering.
6. Add regression tests before/with each fix slice.
