## Context

Current Browser count refresh can resolve queue counts by calling:

```text
SRSBrowser / useQueueBridge.refreshQueueCounts
  -> BrowserApplicationService.getQueueCounts
  -> readSingleQueueCount
  -> readQueueVisibleCount(manager.getQueue(queueType), ...)
```

When `affectedQueueTypes` is missing or broad, this path touches canonical Browser queues. `manager.getQueue(queueType)` is not a pure read; it can lazily create Queue Modules. During active Retrieval Review, this produces logs such as `Queue created: incremental-learning` and `Queue created: filter-group`, even though the active Review queue is Retrieval Practice.

Review feedback authority is already moving toward an Anki-style deep SRS Review Kernel. The remaining Browser count/readiness path is shallow: callers must know when a count read is safe, which queues are active, and which derived queues should defer under Review pressure.

## Target Shape

```text
Review UI
  -> SrsReviewKernel.answer(command)
       -> ReviewLedger
       -> CardScheduleStore
       -> SessionQueueIndex
       -> QueueImpact / CountDelta
  <- ReviewAnswerResult(nextCard, activeQueueCount, affectedQueueTypes, queueImpact)

Browser UI
  -> BrowserQueueCountReadModel.getCounts(request)
       -> projection counters / session queue index / cached count evidence
       -> no full Queue Module creation for ordinary counts
```

## Decisions

### Decision 1: Count reads must not instantiate full Queue Modules

Browser count reads should cross a Browser Queue Count Read Model Interface. The implementation may use projection counters, session queue evidence, or cached count evidence, but callers should not call `manager.getQueue(queueType)` just to display counts.

### Decision 2: Review answer returns active queue impact

`review.session.feedback` should expose enough active queue evidence for Review UI and Browser count patching. For a Retrieval answer, immediate impact should be scoped to Retrieval unless the answer explicitly affects other queues.

### Decision 3: Active Review pressure scopes Browser work

While Review is active, broad Browser count/readiness refresh should become queue-scoped. Non-active queues are marked dirty/deferred and refreshed after Review idle.

### Decision 4: FilterGroup remains explicit

FilterGroup has session snapshot/filter rollback semantics. This change must not pretend projection counters always equal FilterGroup visible counts. If FilterGroup count evidence is unavailable and FilterGroup is not active, defer it under Review pressure instead of instantiating the full queue.

## Migration Plan

1. Add tests proving Retrieval Review feedback does not create Incremental or FilterGroup queues through Browser count/readiness refresh.
2. Add a minimal active Review count-scope guard: no-arg/broad `refreshQueueCounts` under active Review refreshes only active Review queue.
3. Add a Browser Queue Count Read Model Interface and adapter backed by current projection/count evidence where safe.
4. Replace `BrowserApplicationService.readSingleQueueCount -> manager.getQueue(queueType)` for supported queue types.
5. Keep unsupported/non-active queues deferred under Review pressure; fail explicitly when active visible count evidence is unavailable.
6. Update docs/backlog and run focused Review/Browser validation.

## Risks / Trade-offs

- Projection counters may not match filtered visible counts for every Browser state. Mitigation: scope P0 to active Review queue and add explicit unsupported/deferred states for FilterGroup.
- Broad count refresh may lag during long Review sessions. This is intended; Review answer responsiveness wins, and Browser catches up when Review pressure clears.
- Existing tests may assume `getQueue()` side effects during count refresh. Those should be updated to assert count behavior through the new read model Interface.
