## 1. Characterization

- [x] 1.1 Add focused tests for Review truth flush host lookup and request behavior.
- [x] 1.2 Add focused tests for Review source refresh dependency collection and command wiring.
- [x] 1.3 Add focused tests for inline editor bridge state and CDF interruption projection where touched.
- [x] 1.4 Add one Review View smoke test proving main Review actions still render and dispatch.

## 2. Host Runtime Extraction

- [x] 2.1 Extract plugin context and Review truth flush request logic into a UI-owned host runtime Module.
- [x] 2.2 Extract source refresh dependency and command wiring out of the view body.
- [x] 2.3 Extract inline editor bridge state or CDF interruption projection, choosing the lower-risk seam after characterization.
- [x] 2.4 Keep `useReviewSession` and Review session transaction modules unchanged unless a compile-only adapter is needed.

## 3. View Integration

- [x] 3.1 Refactor `ReviewView.vue` to consume extracted runtime Interfaces.
- [x] 3.2 Remove view-local helpers that become pass-through after extraction.
- [x] 3.3 Confirm AI sidecar, AI workbench, Semantic activation, NeuralRoam route semantics, scheduler rules, and queue membership are untouched.

## 4. Verification And Documentation

- [x] 4.1 Run focused Review host runtime and Review View smoke tests.
- [x] 4.2 Run `openspec validate thin-review-view-host-runtime --strict`.
- [x] 4.3 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, `git diff --check`, and `pnpm build`.
- [x] 4.4 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred Review View host runtime debt.
