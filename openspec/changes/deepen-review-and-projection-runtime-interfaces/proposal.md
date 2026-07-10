## Why

Earlier changes established Review Attempt, Review Session Queue, Queue Projection, Review Renderable Context, and bounded-context factory modules, but several Interfaces remain shallow: callers still coordinate transaction stages, projection read/repair behavior, metadata-based Review target inference, and broad `ApplicationContext` access. A second deepening pass is needed now so Review and Browser behavior stays testable and fail-closed while implementation knowledge gains locality.

## What Changes

- Deepen the existing worker-owned `SRS Review Kernel` so its Interface owns session start/read, accepted Review mutation, idempotency, scheduler decision, Card Schedule Store update, Review Ledger fact, domain-sync evidence, undo evidence, SessionQueueIndex advancement, durability receipt, and diagnostics.
- Keep `SrsV2Kernel` as an internal scheduling Module and the application `ReviewAttemptKernel` as a thin Adapter over the SRS Review Kernel result; do not add a second transaction-kernel authority.
- Deepen Queue Projection Runtime around an explicit lifecycle Interface that separates passive reads from materialize/repair commands; snapshot or row reads must not silently acquire mutation responsibility.
- Introduce distinct typed Review Entry Target and Review Content Target contracts so session-launch routing and rendered-item routing no longer share overloaded option bags or scattered `meta` inspection.
- Deepen `ApplicationContext` composition access through bounded-context runtime bundles/facades, reducing public accessor and `contextRef` callback knowledge without moving lifecycle or writer/backend ownership.
- Preserve worker/writer SQLite authority, SessionQueueIndex ownership after Review start, BrowserProjectionIndex as derived state, SiYuan/Xiuyuan content authority, and explicit unavailable behavior.
- Remove superseded orchestration branches only after migrated callers and focused characterization tests prove equivalent behavior.
- Do not add fallback, degrade, compatibility, dual-write, UI SQL, follower-local mutation, renderer scheduling authority, or kernel companion database ownership.

## Capabilities

### New Capabilities

- `srs-review-kernel-runtime`: Defines the worker-owned SRS Review Kernel Interface, accepted-answer transaction, SessionQueueIndex state, idempotency, durability, undo evidence, and explicit failure outcomes.
- `review-target-contract`: Defines typed Review target identity, source lineage, render preparation, supported actions, and unavailable states without metadata-driven caller inference.
- `bounded-context-runtime-access`: Defines narrow Review, Browser/Queue, Progressive, and integration runtime access from the composition root while retaining `ApplicationContext` lifecycle ownership.

### Modified Capabilities

- `queue-projection-runtime`: Passive projection reads and explicit materialize/repair commands become distinct operations behind one lifecycle vocabulary, with no hidden mutation from ordinary reads.
- `review-session-queue-advancement`: Runtime-backed Review advancement consumes the Review transaction receipt and remains independent from BrowserProjectionIndex repair or projection readiness after session start.

## Impact

- Active runtime root: `H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`.
- Primary Review files: `worker/review/WorkerReviewFeedbackRuntime.ts`, `worker/review/WorkerReviewCardMutationPersistenceModule.ts`, `src/application/usecases/review/ReviewAttemptKernel.ts`, Review session runtime adapters, backend contracts, and focused tests.
- Primary projection files: `src/application/services/queue-projection/*`, `worker/queue-projection/WorkerQueueProjectionRuntime.ts`, `src/infrastructure/persistence/sqlite/SqlQueueProjectionRepository.ts`, Browser lifecycle/read-model callers, and tests.
- Primary target/composition files: `src/application/adapters/reviewRenderableContext.ts`, render-policy adapters, `src/application/ApplicationContext.ts`, existing bounded-context factory bundles, and wiring tests.
- No new external dependency. Runtime ownership and user-visible behavior remain unchanged unless a requirement in this change explicitly tightens failure or read/mutation semantics.
