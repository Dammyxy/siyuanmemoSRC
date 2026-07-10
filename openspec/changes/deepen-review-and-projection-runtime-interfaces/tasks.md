## 1. Acceptance Baseline And Worktree Guardrails

- [x] 1.1 Rebuild an acceptance checklist from `proposal.md`, `design.md`, every change spec, and the completed changes `deepen-review-attempt-kernel`, `review-session-queue-runtime`, `absorb-anki-incrementum-architecture-lessons`, and `deepen-runtime-architecture-modules`.
- [x] 1.2 Confirm the active implementation root is `H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`, record the current branch/status, and use committed `retire-native-riff-continuous-sync` as the clean baseline.
- [x] 1.3 Trace and record the active worker-session and one-off-attempt call chains through Review Admission, `UnifiedQueueStrategy`, `ReviewAnswerPipeline`, backend RPC, `SrsReviewKernel`, feedback runtime, persistence transaction, and projection maintenance.
- [x] 1.4 Add or update characterization tests that pin current session start/current/answer/skip/undo behavior, accepted-answer transaction ordering, duplicate replay, failure stability, and projection-after-commit semantics before moving ownership.
- [x] 1.5 Record the deletion-test acceptance criteria for the existing Review Modules, the rejected parallel transaction Kernel, Queue Projection Lifecycle, and Review Entry/Content Target contracts.

## 2. Canonical SRS Review Kernel Contract

- [x] 2.1 Define discriminated `SrsReviewKernelCommand`, `SrsReviewKernelQuery`, `SrsReviewKernelResult`, and `SrsReviewKernelView` contracts for start, answer, skip, undo, current, and diagnostics.
- [x] 2.2 Include authoritative session identity, current card/item identity and state, lookahead, counters, commit outcome, updated card, idempotency/fact identity, durability summary, undo token/evidence, queue impact, and typed diagnostics without exposing internal transaction stages or application-owned Review Content Target types.
- [x] 2.3 Add focused Interface tests for valid commands, stale current targets, stale admission/projection identity, unsupported queue mode, invalid rating, not-found session/card, explicit unavailable, and idempotency conflict.
- [x] 2.4 Add focused tests proving compatible duplicate answers return the existing result without appending Review Ledger evidence or advancing SessionQueueIndex twice.
- [x] 2.5 Add focused tests proving preview-only and drill-only results do not write Card Schedule Store or formal Review Ledger facts.

## 3. Accepted-Answer Transaction Deepening

- [x] 3.1 Move worker-backed answer orchestration behind the canonical SRS Review Kernel while preserving current backend RPC names and writer-relay ownership.
- [x] 3.2 Hide durable journal/idempotency preparation, Card Schedule Store load, scheduler compute/commit, Review Ledger append, domain-sync evidence, undo evidence, mutation stamp, and delta/checkpoint durability behind the kernel Interface.
- [x] 3.3 Ensure SessionQueueIndex advances only after the authoritative Review transaction commits and remains unchanged on validation, conflict, write, or durability failure.
- [x] 3.4 Derive or enqueue queue projection impact only after durable Review truth commits; report deferred, refresh-required, or unavailable projection maintenance without rolling back a committed answer.
- [x] 3.5 Make `WorkerReviewSessionRuntime`, `WorkerReviewFeedbackRuntime`, and `WorkerReviewCardMutationPersistenceModule` internal implementation Modules or absorb their orchestration where this improves locality.
- [x] 3.6 Remove queue-impact callbacks and transaction-stage knowledge from public worker Interfaces once the kernel result owns the required evidence.
- [x] 3.7 Add transaction-order tests for Card Schedule Store, Review Ledger, domain-sync evidence, undo journal, mutation stamp, durability, SessionQueueIndex advancement, and post-commit projection impact.

## 4. Review Adapter And Session Migration

- [x] 4.1 Keep backend Review RPC handlers as transport Adapters that validate transport shape, invoke the SRS Review Kernel once, and map its typed result.
- [x] 4.2 Update `WorkerReviewSessionQueueRuntime` to consume the kernel result without reconstructing counters, next-card authority, transaction stages, projection semantics, or content-target inference.
- [x] 4.3 Update `ReviewAnswerPipeline` and `UnifiedQueueStrategy` to consume one kernel/session receipt while preserving capture, failed-feedback compensation, visible-state stability, history, and renderer-local non-worker behavior.
- [x] 4.4 Update `ReviewAttemptKernel` to map non-session callers onto the canonical kernel result without becoming a second transaction or session authority.
- [x] 4.5 Remove duplicate queue-impact and projection-action interpretation from application callers after the canonical result supplies it.
- [x] 4.6 Add focused tests for worker-backed Retrieval Practice and Incremental Learning, one-off attempts, static subset Review, FilterGroup preview/rescheduling, FinalDrill, and explicit worker/writer unavailability.
- [x] 4.7 Add focused tests proving Semantic temporary Review commits the temporary card, restores the original visible item, and suppresses duplicate appearance only within the current session.

## 5. Queue Projection Lifecycle Contract

- [x] 5.1 Inventory current Queue Projection Runtime methods and characterize which readiness, snapshot, or row-hydration reads can trigger materialization, repair, echo mutation, or state-map cleanup.
- [x] 5.2 Define typed Queue Projection Lifecycle `read`, `repair`, and `observe` Interfaces with explicit queue, policy, generation, readiness, recoverability, and diagnostic evidence.
- [x] 5.3 Implement passive `read` requests for readiness, snapshot, and rows-by-id that never start repair or follower-local projection mutation.
- [x] 5.4 Implement explicit `repair` commands for materialize, rebuild, invalidate, and refresh through backend worker or writer relay only.
- [x] 5.5 Keep materialized echo, single-flight work, local deletion filtering, policy/generation normalization, and rollout diagnostics internal to the lifecycle Module.
- [x] 5.6 Publish canonical ready and invalidated identity events through `observe`, including queue, policy, generation, reason, and source event.
- [x] 5.7 Add focused tests for passive ready/refreshing/unavailable reads, zero-row ready state, repair single-flight behavior, follower writer relay, committed echo identity, invalidation, and observer disposal.

## 6. Projection Caller Migration

- [x] 6.1 Migrate Review Admission to passive lifecycle reads plus an explicit repair decision before issuing a Review Admission Ticket.
- [x] 6.2 Migrate Browser warmup, datasource snapshot, row hydration, diagnostics, and maintenance callers to passive `read` and explicit `repair`.
- [x] 6.3 Preserve runtime-backed SessionQueueIndex next-item authority when BrowserProjectionIndex is refreshing or unavailable after session start.
- [x] 6.4 Preserve non-runtime projection patch/refresh policy for static and compatibility Review modes without applying global projection impact to a local static subset.
- [x] 6.5 Remove old public Queue Projection Runtime methods and hidden read-path materialization only after all active callers migrate.
- [x] 6.6 Add regression tests for Browser loading/empty/unavailable states, Review first-open admission, projection generation mismatch, background repair, and no hidden fallback reads or writes.

## 7. Review Entry Target Contract

- [x] 7.1 Confirm committed Native Riff retirement leaves no Native Riff Review entry authority; imported/adopted cards enter Review as standard SiYuanMemo-owned cards.
- [x] 7.2 Define discriminated Review Entry Target contracts for projection queue, managed queue, static subset, and NeuralRoam launch semantics.
- [x] 7.3 Keep Entry Target fields limited to queue/session launch identity, entry surface, scope/exact-card evidence, and Review Admission requirements so invalid render/content combinations are unrepresentable.
- [x] 7.4 Implement application-owned Entry Target resolution for topbar, Browser, block menu, Semantic temporary Review, NeuralRoam, and compatibility entry paths.
- [x] 7.5 Route Review Admission and session creation from resolved Entry Target instead of scattered queue type, scope, and projection fields.
- [x] 7.6 Add focused tests for every Entry Target kind, admission-required versus admission-free launch, stale admission, exact-card subsets, and ambiguous/unsupported entry evidence.

## 8. Review Content Target Contract

- [x] 8.1 Define discriminated Review Content Target contracts for standard card, Topic-derived item, progressive excerpt, and source-location content.
- [x] 8.2 Include canonical item identity, source lineage, scheduling or processing classification, render intent, supported actions, source/content version evidence where available, and explicit unavailable diagnostics.
- [x] 8.3 Implement one legacy metadata ingress Adapter that maps existing card/progressive evidence to typed target resolution and fails explicitly on conflicting or insufficient evidence.
- [x] 8.4 Make Review Renderable Context and SRS Card Render Contract consume Review Content Target rather than rediscovering target kind from raw `meta`, block ids, or progressive option bags.
- [x] 8.5 Route Review current-content edit, source navigation, answer, defer, convert, skip, and back commands using typed Content Target identity without mutating target objects as persistence state.
- [x] 8.6 Keep SiYuan blocks and Xiuyuan aggregates as content authority; do not add copied question/answer storage or make queue projection rows content truth.
- [x] 8.7 Remove superseded target-kind inference and legacy metadata branches after all active render/editor/navigation callers migrate.
- [x] 8.8 Add focused tests for standard, Topic-derived, progressive excerpt, source-location, missing source, detached source, conflicting evidence, unsupported renderer, and content-version change behavior.

## 9. Bounded-Context Runtime Access

- [x] 9.1 Inventory active `ApplicationContext` getters and `contextRef` closures used by Review, Browser/Queue, Progressive, and integration callers.
- [x] 9.2 Define narrow typed `ReviewRuntimeAccess`, `BrowserQueueRuntimeAccess`, `ProgressiveRuntimeAccess`, and `IntegrationRuntimeAccess` Modules without generic string lookup.
- [x] 9.3 Add bind-once callback ports for bootstrap cycles that fail explicitly before binding or on a second bind.
- [x] 9.4 Migrate Review and Browser/Queue factories, managers, and Adapters to the smallest runtime-access Interface required by each caller.
- [x] 9.5 Migrate Progressive and integration callers after Review/Browser access Modules are stable.
- [x] 9.6 Remove each legacy getter, callback closure, and superseded wiring in the same slice that migrates its final active caller.
- [x] 9.7 Add composition tests for explicit members, unavailable runtime policy, bind-before-use, double-bind rejection, startup order, listener/timer disposal, and absence of service-locator lookup.

## 10. Deletion, Documentation, And Validation

- [x] 10.1 Apply the deletion test to every new or retained Module and remove pass-through wrappers that do not concentrate behavior or knowledge.
- [x] 10.2 Confirm no separate Review Transaction Kernel, generic dependency-injection container, copied content-owner table, follower-local mutation, or long-lived dual access path was introduced.
- [x] 10.3 Update `ARCHITECTURE.md` with final Review entry, content resolution, SRS Review Kernel, projection lifecycle, and runtime-access call chains.
- [x] 10.4 Update `CONTEXT.md` relationships only if implementation sharpens the Review Entry Target or Review Content Target definitions beyond this change.
- [x] 10.5 Update `docs/DDD_RESCAN_BACKLOG.md` for production debt fixed, deferred, or blocked by overlapping render/Xiuyuan work.
- [x] 10.6 Run focused Vitest suites for worker Review, Review session adapters, Review target/render, Queue Projection Lifecycle, Browser lifecycle, and ApplicationContext composition.
- [x] 10.7 Run `node scripts/check-hidden-fallbacks.cjs`, `pnpm run check:boundaries`, and `pnpm build` from the active runtime worktree.
- [x] 10.8 Run `openspec validate deepen-review-and-projection-runtime-interfaces --strict` and confirm every scenario is implemented, tested, explicitly deferred, or proven not applicable.
- [x] 10.9 Record required two-window writer/follower smoke checks for Review commit, undo, projection invalidation/repair, unavailable writer, and content-source changes.
