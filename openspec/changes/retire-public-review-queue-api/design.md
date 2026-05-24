## Context

SiYuanMemo now has backend-owned Review progression for projection-backed queues and backend-owned NeuralRoam advance/command state. The remaining public queue API surface predates that ownership: Browser and Review can still reach queue classes and call `getCards()`, `addCards()`, `removeCards()`, `setFilter()`, and snapshot methods directly.

Those methods are still valid inside domain implementations, strategy adapters, backend workers, and tests. They are unsafe as broad runtime interfaces because they expose implementation state and make it easy to rebuild local rows, mutate global queues, or transfer session internals outside the intended owner.

## Goals / Non-Goals

**Goals:**
- Make Browser queue reads consume Queue Projection Readiness and projection read models only.
- Make Browser queue membership changes consume application command methods only.
- Keep Review progression behind `UnifiedQueueStrategy`, backend projection, and NeuralRoam Advance.
- Move transfer/session concerns behind explicit Review transfer models instead of exposing queue snapshot methods to UI glue.
- Add checker coverage so UI and broad application modules cannot reintroduce public queue authority.

**Non-Goals:**
- Do not delete queue classes or their domain methods in this change.
- Do not migrate Xiuyuan aggregate `getCards()`; it is a different domain term.
- Do not remove test helpers that construct queue instances directly.
- Do not redesign backend queue projection storage.
- Do not turn NeuralRoam into a normal projection-backed Review progression queue.

## Decisions

1. Runtime callers get read models and commands, not queue instances.

   Browser data surfaces should receive queue rows from projection snapshots or Browser card-universe queries. Mutations should go through application methods such as `batchAddToQueue()` and `batchRemoveFromQueue()`. This gives leverage: unavailable backend state has one explicit failure path instead of local queue repair in many callers.

2. Queue instances remain internal implementation details during migration.

   `UnifiedQueueStrategy`, queue projection builders, backend NeuralRoam runtime, and focused tests may still instantiate or call queue classes. Deleting queue classes now would break useful locality and widen the change too far. The first retirement is public access from runtime surfaces.

3. Boundary checks enforce directory and method context.

   A checker should reject queue-authority calls in `src/ui/**` and broad `src/application/**` modules unless they are explicitly allowlisted owners. This is stricter than relying on code review and matches existing hidden-fallback governance.

4. Transfer models replace queue snapshot leakage incrementally.

   Review tab/dialog transfer can still carry serializable queue state, but UI should ask a transfer runtime for it. The queue-specific `serializeSessionSnapshot()`/`restoreSessionSnapshot()` methods should not become casual View-layer dependencies.

## Risks / Trade-offs

- [Risk] Some call sites use public queue APIs for legitimate short-lived local sessions. → Mitigation: allowlist one-shot session owners and keep the checker scoped to long-lived queue authority first.
- [Risk] Tight checker rules can block tests that intentionally inspect queue behavior. → Mitigation: exclude test files or require explicit test-helper paths.
- [Risk] Moving all ReviewView queue reads at once is high churn. → Mitigation: first close Browser membership/read APIs, then Review transfer/session APIs in separate tasks.
- [Risk] Existing docs still mention legacy queue APIs. → Mitigation: update architecture/backlog for active runtime truth and leave historical docs untouched.

## Migration Plan

1. Add regression tests for Browser long-lived queue datasource/action behavior without queue instance fallback.
2. Replace Browser queue mutation callers with application command methods or explicit unavailable results.
3. Add a queue public API checker for UI and broad application runtime paths.
4. Move Review transfer/filter helpers behind dedicated runtimes and update tests.
5. Update architecture/backlog docs and run boundary/build/OpenSpec validation.

Rollback: disable the new checker only while investigating a false positive. Runtime code must still fail closed rather than reintroducing hidden local queue fallback.

## Open Questions

- Whether `ApplicationContext.getFinalDrillQueue()` and similar accessors should be removed now or deprecated after Browser/Review call sites are clean.
- Whether one-shot local session queues should receive a separate explicit interface name to avoid confusion with long-lived backend-owned queues.
