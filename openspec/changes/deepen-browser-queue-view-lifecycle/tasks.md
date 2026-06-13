## 1. Characterization Tests

- [x] 1.1 Add focused Browser lifecycle tests for queue selection with ready, preparing, repair-required, and unavailable Queue Projection Readiness.
- [x] 1.2 Add stale async result tests covering old queue selection completion after a newer selection.
- [x] 1.3 Add Browser grid attach tests proving counts and source-existence supplements do not block first readable page attach.

## 2. Lifecycle Module

- [x] 2.1 Add an application-owned Browser Queue View Lifecycle module with a small Interface for preparing queue views and reporting lifecycle state.
- [x] 2.2 Move projection identity, read-model snapshot metadata, request generation, and stale response checks behind the lifecycle module.
- [x] 2.3 Move queue datasource attach decisions out of `SRSBrowser.vue` while keeping the grid datasource Adapter behavior stable.
- [x] 2.4 Route queue preparing, repair-required, and unavailable states through the lifecycle result without local queue fallback.

## 3. UI Integration

- [x] 3.1 Refactor `SRSBrowser.vue` to consume lifecycle state and commands instead of directly coordinating queue projection readiness and datasource attach details.
- [x] 3.2 Keep deck, query, block-id, FilterGroup, and NeuralRoam entry behavior stable through focused Browser tests.
- [x] 3.3 Remove dead or duplicate Browser queue warmup/load glue that becomes a pass-through after lifecycle extraction.

## 4. Verification And Documentation

- [x] 4.1 Run focused Browser lifecycle, Browser Read Model, queue query, and grid datasource tests.
- [x] 4.2 Run `openspec validate deepen-browser-queue-view-lifecycle --strict`.
- [x] 4.3 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, `git diff --check`, and `pnpm build`.
- [x] 4.4 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred Browser lifecycle debt.
