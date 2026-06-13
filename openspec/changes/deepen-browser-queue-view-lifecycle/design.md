## Context

SiYuanMemo already defines Browser Read Model as the authoritative Browser-facing read contract. It resolves matched IDs, page hydration, row-by-ID hydration, action targets, and source-existence supplements without letting UI repair projections locally.

The remaining friction is Browser queue view orchestration. `SRSBrowser.vue` still coordinates selected queue identity, queue projection warmup, current datasource, read-model snapshot metadata, stale result rejection, grid attach, and count refresh. The behavior is spread across Vue refs, UI runtimes, and `BrowserApplicationService`, so the Browser Queue View Lifecycle has weak Locality.

## Goals / Non-Goals

**Goals:**

- Deepen the Browser Queue View Lifecycle module so the UI crosses one smaller Interface for queue view preparation and datasource attachment.
- Keep Browser Read Model as the owner of Browser row reads.
- Keep Queue Projection Readiness explicit: ready, preparing, repair-required, unavailable.
- Concentrate stale async rejection and projection identity comparison in one module.
- Add focused tests that exercise lifecycle outcomes through the same Interface the UI uses.

**Non-Goals:**

- No direct SQL reads or projection repair in UI.
- No changes to Review queue membership, scheduler rules, feedback commit, or queue projection materialization ownership.
- No AI workbench, agent, or Semantic Agent work.
- No broad Browser redesign, visual redesign, or repo-wide type strictness changes.

## Decisions

- Put the external Seam at an application-owned Browser Queue View Lifecycle module consumed by `SRSBrowser.vue`.
  - Rationale: the lifecycle needs Browser Read Model and Queue Projection Readiness knowledge, which are application/backend concerns, not Vue rendering concerns.
  - Alternative considered: keep lifecycle in UI composables and only rename helpers. Rejected because that leaves the Interface shallow and keeps Locality in the view.

- Keep the grid datasource lifecycle as an Adapter behind the lifecycle module rather than the owner of queue readiness.
  - Rationale: the grid adapter should attach readable rows, not decide whether the queue projection owner is ready.
  - Alternative considered: move queue readiness into `BrowserGridDatasourceLifecycle`. Rejected because readiness also controls counts, warmup, stale metadata, and unavailable UI state.

- Preserve existing Browser Read Model metadata and stale response checks, but make them lifecycle-owned.
  - Rationale: stale `queryFingerprint`, generation, read owner, and projection identity checks are part of the queue read contract.
  - Alternative considered: leave stale checks in `SRSBrowser.vue`. Rejected because the UI should not understand projection-generation invalidation details.

- Keep hidden fallback removal incremental.
  - Rationale: this change should fail closed or report preparing/unavailable through the active owner, not silently replace unavailable projection data with local queue scans.
  - Alternative considered: add best-effort local rows when projection reads fail. Rejected because it conflicts with Browser Read Model and No UI SQL decisions.

## Risks / Trade-offs

- Lifecycle extraction could become a pass-through Module if it only forwards method calls -> mitigate by moving ownership of readiness, attach, stale rejection, and unavailable state together.
- Valid queue views could regress if metadata comparison is stricter than today -> mitigate with characterization tests for deck, queue, FilterGroup, and stale async results before refactor.
- The UI file may stay large after the first slice -> accept if the lifecycle state machine gains Locality; visual cleanup can follow separately.
