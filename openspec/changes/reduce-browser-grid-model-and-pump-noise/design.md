## Context

The previous Browser first-paint work removed synchronous source-existence and snapshot overlap from the first page, but live smoke still shows red AG Grid work in `grid.apply-datasource` and `grid.model-updated`. The active Browser path is `SRSBrowser.vue -> BrowserGridDatasourceLifecycle -> application Browser data source`, and must stay on `ui -> application -> core -> infrastructure`.

`KernelTransactionActionPump` already backs off empty polls and no-active-writer relay failures. The reported warning is a different explicit unavailable path: backend worker unhealthy / request timeout. Repeating that warning every poll is noisy when the health state has not changed, but the pump still must fail closed and keep explicit unavailable semantics.

## Goals / Non-Goals

**Goals:**
- Coalesce or delay Browser datasource/model work so repeated rebuilds only apply the latest datasource generation and first paint is not blocked by stale grid attach.
- Preserve Browser read ownership and fail-closed backend unavailable behavior.
- Add bounded warning emission/backoff for repeated backend unhealthy or timeout action-pump polls.
- Keep enough diagnostics to distinguish no-active-writer, backend-unhealthy, timeout, and ordinary processing errors.

**Non-Goals:**
- Replace AG Grid.
- Move Browser card reads to a new backend owner.
- Change kernel companion writer lease semantics.
- Hide failed action polling with a fallback path.

## Decisions

1. Browser grid mitigation stays inside `BrowserGridDatasourceLifecycle`.
   - Rationale: this helper owns datasource creation, pending datasource attach, and existing AG Grid performance spans. Keeping the mitigation here avoids spreading AG Grid timing rules into application services.
   - Alternative considered: create a custom first-page renderer before AG Grid. Deferred because it is larger and can drift from AG Grid selection/sort behavior.

2. Kernel action pump health-noise mitigation uses explicit error classification plus bounded backoff.
   - Rationale: backend unhealthy / request timeout is a health state, not a processing error that benefits from warning every poll. The pump can record counters and retry later without changing mutation ownership.
   - Alternative considered: suppress all `BACKEND_UNAVAILABLE` warnings. Rejected because writer lease and relay failures need distinct diagnostics.

3. Tests focus on observable behavior at existing public seams.
   - Browser: lifecycle helper applies only current datasource and avoids stale generation work.
   - Pump: repeated backend unhealthy / timeout polls do not spam warnings and still do not call alternate mutation paths.

## Risks / Trade-offs

- First-page AG Grid work can still be expensive after coalescing if the active datasource itself is large -> keep diagnostics and defer custom first-page presenter as a separate change if smoke remains red.
- Backoff can delay recovery from a transient backend timeout -> cap delay and reset immediately after a successful dequeue.
- Warning throttling can hide frequency in console -> increment runtime counters / span metadata for suppressed health failures.
