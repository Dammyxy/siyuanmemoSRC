## 1. Regression Tests

- [x] 1.1 Add queue-level regression coverage proving route-history events preserve `sourceEventId`, `branchRootNodeId`, `depth`, `sourceRole`, and trace quality for new orbit and hyperspace events.
- [x] 1.2 Add queue-level regression coverage proving `NeuralRoamQueue.getActivationTrace(eventId)` resolves events from the inactive engine.
- [x] 1.3 Add browser-controller regression coverage proving route-log and double-link selections update the wake panel with exact traces when available.
- [x] 1.4 Add review-header regression coverage proving orbit center switches and hyperspace event changes update progress without stale header cache reuse.

## 2. Core Route Lineage

- [x] 2.1 Extend route-history event types, normalizers, clone logic, repository persistence mapping, and migration-safe reads with optional lineage fields.
- [x] 2.2 Write full lineage fields from `NeuralRoamHistoryEntry` into route-history events in `NeuralRoamQueue.historyEntryToRouteHistoryEvent`.
- [x] 2.3 Convert route-history events back to `NeuralRoamHistoryEntry` without marking new exact entries as legacy; keep old missing-lineage entries explicitly incomplete.
- [x] 2.4 Update backend Neural Roam view-state route-history output so browser consumers receive the preserved lineage fields.

## 3. Cross-Engine Trace Resolution

- [x] 3.1 Update `NeuralRoamQueue.getHistoryEntryByEventId`, `getHistoryEntriesByNodeId`, and `getActivationTrace` to search orbit and hyperspace histories deterministically.
- [x] 3.2 Add route-history trace fallback that reconstructs preserved route lineage only when no exact engine trace exists.
- [x] 3.3 Ensure browser wake selection uses the queue facade and does not branch on engine internals.

## 4. Review Header State Binding

- [x] 4.1 Expand neural header cache identity to include route id, engine mode, focus/current node, current event, and progress identity.
- [x] 4.2 Keep ReviewView journey progress bound to current focus/current event and batch snapshot without direct fallback to stale header counters.
- [x] 4.3 Extend `NeuralRoamJourneyHeader` expanded state to render orbit track context and hyperspace propagation context from `roundNodes` and `recentPath`.

## 5. Cleanup And Validation

- [x] 5.1 Update `docs/DDD_RESCAN_BACKLOG.md` with resolved/deferred debt from this change.
- [x] 5.2 Run targeted queue, browser, and review tests for Neural Roam activation links.
- [x] 5.3 Run `pnpm run check:boundaries`.
- [x] 5.4 Run `pnpm build`.
