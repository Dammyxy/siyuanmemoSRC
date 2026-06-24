## Context

The active Browser path is `browserLoadDataRuntime -> BrowserQueueViewLifecycle -> BrowserApplicationService -> QueueProjectionRuntime`. Today `BrowserQueueViewLifecycle.prepareQueueView()` awaits `ensureQueueReadModelReady()` before creating the queue datasource. When `incremental-learning` readiness remains `refreshing`, Browser queue open cannot attach the datasource and `browserLoadDataRuntime` clears rows, skips grid rebuild, and skips warmup scheduling from the normal loaded path.

There is a second ownership problem beneath that symptom: Browser open already schedules background queue projection warmup through `browserQueueProjectionWarmupRuntime`, while `prepareQueueView()` runs its own blocking readiness check. QueueProjection Runtime also mixes passive readiness with repair/materialization by attempting projection replacement during `ensureReady()`, `readSnapshot({ forceRefresh: true })`, and row hydration misses.

## Goals / Non-Goals

**Goals:**

- Make Browser queue datasource attachment independent from projection readiness warmup so first screen work can continue while projections refresh.
- Keep Browser lifecycle as the owner of queue identity, datasource attach, projection identity metadata, live identity reactions, and count-refresh hints.
- Keep background warmup bounded and diagnostic-only for non-ready projection states.
- Split Queue Projection passive read/readiness from explicit repair/materialization so heavy `queue.getCards()` work does not run as an incidental Browser-open read side effect.
- Add regression tests at the Browser lifecycle/load-data seam and QueueProjection Runtime seam.

**Non-Goals:**

- No local queue fallback rows when projection reads are unavailable.
- No UI SQL fallback or direct UI projection repair.
- No Review queue membership, scheduler, feedback commit, writer relay, backend worker protocol, or NeuralRoam advance redesign.
- No broad visual Browser redesign.

## Decisions

- Browser Queue View Lifecycle attaches a datasource before passive readiness completes.
  - Rationale: datasource attachment is a cheap UI/application seam, while row fetch/count refresh can independently report `refreshing`, `repair-required`, or `unavailable` through Browser Read Model diagnostics.
  - Alternative considered: keep blocking readiness and add retry timers. Rejected because it leaves Browser open dependent on the slowest queue materialization and repeats the current stuck-loading failure mode.

- Browser lifecycle records readiness diagnostics without using them as a first-screen gate.
  - Rationale: the UI still needs explicit status for toasts, counters, and diagnostics, but the lifecycle module should not clear the grid solely because background readiness is not yet `ready`.
  - Alternative considered: remove readiness from lifecycle entirely. Rejected because live identity and count refresh still need one Browser-owned place to reason about projection identity.

- Warmup remains a background Browser runtime, but readiness ownership is not duplicated.
  - Rationale: `browserQueueProjectionWarmupRuntime` should schedule bounded readiness probes and record readiness states; `BrowserQueueViewLifecycle` should own active queue attach and stale identity decisions.
  - Alternative considered: merge all warmup into load-data. Rejected because warmup also reacts to live identity events and inactive sidebar queues.

- QueueProjection Runtime exposes read-only readiness for passive callers and explicit repair for materialization.
  - Rationale: Browser open, count refresh, and row reads should not unexpectedly invoke queue domain scans. Repair/materialization is a command-like operation and must be visible at call sites.
  - Alternative considered: retain short-window materialization inside `ensureReady()` for convenience. Rejected because the interface hides expensive work and weakens locality for Browser performance bugs.

- Explicit repair keeps the existing materialization implementation but moves it behind command-oriented methods.
  - Rationale: this change is a deep seam correction, not a rewrite of projection row construction. Keeping the implementation while narrowing the interface reduces behavioral risk.
  - Alternative considered: rewrite projection build in the backend worker. Rejected for this change because that crosses worker protocol and storage ownership beyond the reproduced bug.

## Risks / Trade-offs

- Active queue grid may attach before rows are available -> row fetch and count refresh must continue to surface explicit non-ready diagnostics rather than silently showing local fallback data.
- Existing tests expect non-ready readiness to block datasource creation -> update them to the new Browser-open contract and add separate tests proving no local fallback repair is invoked.
- Removing implicit materialization from passive reads can make stale projections stay refreshing until an explicit repair is triggered -> keep warmup diagnostics and explicit repair entry points visible for follow-up repair scheduling.
- QueueProjection Runtime has several passive-looking methods that currently materialize -> refactor one vertical slice at a time and keep targeted tests green after each split.

## Migration Plan

1. Change Browser lifecycle/load-data tests to assert datasource attach under `refreshing` readiness and no direct manager fallback.
2. Update `BrowserQueueViewLifecycle.prepareQueueView()` to create datasource without awaiting readiness as a first-screen gate; capture ready identities opportunistically when already available.
3. Route lifecycle state/count-refresh hints so background warmup and passive queue counts remain non-blocking.
4. Introduce read-only QueueProjection Runtime readiness/read methods and move existing materialization calls behind explicit repair paths.
5. Sync `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md`; run focused Browser/Queue tests, boundary checks, and build.
