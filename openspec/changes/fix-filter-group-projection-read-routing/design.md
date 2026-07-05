## Context

`FilterGroupQueue.getProjectionReadMode()` returns `backend-projection`, which is correct for projection-owned readers such as Browser counts and projection snapshots. Review navigation is different: a `UnifiedQueueStrategy` instance is bound to one live queue object that may carry an active filter, manual additions, temporary blacklist, and transferred session state.

`UnifiedQueueStrategy.reloadCards()` currently calls `loadProjectionBackedCards(true)` for any projection-backed queue. For `filter-group`, that bypasses the queue's `getCards()` filter logic and can select global projection rows instead of the active filtered session.

## Goals / Non-Goals

**Goals:**
- Make `filter-group` Review navigation reload from `queue.getCards()` instead of global projection rows.
- Keep static subset Review sessions local and exact.
- Preserve fail-closed projection behavior for projection-owned readers outside Review navigation.
- Keep the change inside the Review/Queue strategy boundary.

**Non-Goals:**
- Rebuild FilterGroup projection storage or parity builders.
- Disable Browser/count projection support for `filter-group`.
- Add fallback counts or invented projection data.
- Change scheduler semantics for FilterGroup feedback.

## Decisions

- Add a Review-strategy routing guard rather than changing `FilterGroupQueue.getProjectionReadMode()`. This keeps Browser/projection consumers on their existing projection contract while making Review navigation honor live queue session state.
- Keep the guard specific to `QueueType.FilterGroup`. Other projection-backed queues have different semantics: SRS v2 queues use `SrsV2SessionQueueRuntime`, `final-drill`/`leech`/`neural-roam` need their own contracts.
- Use the existing static-subset projection regression file as the feedback loop because it already models global projection rows conflicting with local Review scope.

## Risks / Trade-offs

- FilterGroup Review reload may do a live `getCards()` read instead of hydrating projection rows. This is intended for correctness; Browser projection remains available outside the Review strategy.
- A future queue may need similar session-local routing. Do not generalize now; add explicit queue contracts when that queue's semantics are proven.
