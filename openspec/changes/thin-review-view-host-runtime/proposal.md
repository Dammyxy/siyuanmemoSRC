## Why

`ReviewView.vue` still owns non-rendering host runtime glue such as plugin/context lookup, Review truth flush requests, source refresh wiring, inline editor state bridges, CDF interruption projection, viewport state, and data observers. This keeps the Review View Interface shallow because tests and maintainers must understand the view body to change host behavior.

## What Changes

- Add a Review View Host Runtime capability that moves non-AI host/runtime glue out of `ReviewView.vue`.
- Start with non-AI seams: plugin context resolution, Review truth flush request, Review source refresh runtime inputs, inline editor bridge state, CDF interruption projection, and viewport/data observer wiring.
- Keep Review session behavior in `useReviewSession` and Review rendering behavior in existing Review content modules.
- Preserve current keyboard, review action, source refresh, and inline edit behavior.
- Do not touch AI sidecar, AI workbench, Semantic activation, NeuralRoam route semantics, agent behavior, scheduler rules, or queue membership.

## Capabilities

### New Capabilities
- `review-view-host-runtime`: Review view host/runtime concerns are owned by focused runtime modules consumed by `ReviewView.vue`.

### Modified Capabilities

## Impact

- Affected code: `src/ui/review/v2/ReviewView.vue`, `src/ui/review/v2/*Runtime*.ts`, `src/ui/review/v2/useReviewSession.ts`, focused Review View tests, `ARCHITECTURE.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- Runtime behavior: no intended Review UX or scheduling behavior change.
- Boundaries: UI runtime modules remain UI-owned and must not take scheduler, queue membership, or persistence ownership.
