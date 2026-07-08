## Context

Live logs show SRS Browser opens without configured auto-sync, AG Grid becomes ready, the Browser adapter is then destroyed, and queue counts report `QUEUE_COUNT_UNAVAILABLE` for `retrieval` and `filter-group` because queue projection snapshots are unavailable. The active Browser read path is projection-only for these queues: `BrowserApplicationService -> QueueBrowserQueryKernel / QueueProjectionRuntime -> backend queue.projection.snapshot`. The exit symptom may be a separate unload-time wait: ApplicationContext currently runs Review truth flush and then disposes the backend worker transport, but logs do not show pending RPC method/age before disposal.

## Goals / Non-Goals

**Goals:**
- Expose why Browser projection snapshots are non-ready at the application/queue seam.
- Expose which backend RPCs are pending when unload/dispose starts.
- Keep diagnostic logs bounded and tied to the specific `QUEUE_COUNT_UNAVAILABLE` / Browser page unavailable / dispose paths.
- Preserve current fail-closed behavior.

**Non-Goals:**
- No automatic projection rebuild, fallback rows, local queue fallback, SQL fallback, or adapter lifecycle fix.
- No Review answer transaction, SQLite delta, sync-conflict, or storage durability changes.
- No broad Browser UI redesign.

## Decisions

- Record Browser projection open diagnostics at the first unavailable page and passive-count catch.
  - Rationale: the user-visible symptom is Browser no rows plus count unavailable. Logging here names queue id/type, state, reason, diagnostics, and owner metadata without touching row behavior.
  - Alternative: only log in lower queue runtime. Rejected because it loses Browser queue id and read-model state.

- Enrich QueueProjection Runtime non-ready snapshot diagnostics.
  - Rationale: backend already returns `cacheState` and `freshness`; the current trace-level log hides the deciding evidence. A bounded info log on non-ready snapshot gives missing-cache/stale-row proof.
  - Alternative: add new backend RPC. Rejected for this diagnostic pass; existing snapshot result already contains enough evidence.

- Add pending request summaries to backend worker transport diagnostics.
  - Rationale: pending count alone cannot explain exit hangs. Method/card/generation/age is enough to tell whether unload is waiting on `queue.projection.snapshot`, `review.truth.flush`, storage rebuild, or other work.
  - Alternative: log every request lifecycle. Rejected as too noisy.

- Log ApplicationContext unload checkpoints before bounded Review truth flush and before backend transport dispose.
  - Rationale: unload hang diagnosis needs ordering. These checkpoints show whether the hang starts before flush, during flush timeout, or after transport disposal.
  - Alternative: change disposal order. Rejected until logs prove owner.

## Risks / Trade-offs

- Extra logs during repeated Browser open on broken projection -> bounded to unavailable/non-ready paths and capped ID arrays.
- Pending request diagnostics may expose card ids -> acceptable local developer diagnostics; no payload logging.
- Diagnostics may show two separate issues -> keep change diagnostic-only and discuss evidence before fix.
