## Context

The active runtime already contains the right ownership decisions, but several Modules expose too much implementation knowledge.

- `ReviewAttemptKernel` is a 176-line application wrapper over `ReviewCommitUseCase`; it normalizes projection impact but does not own the worker transaction.
- `SrsReviewKernel` exists, but its current Interface is a shallow pass-through to `WorkerReviewSessionRuntime`; transaction ordering remains split across feedback and persistence Modules.
- `WorkerReviewFeedbackRuntime` validates request modes, persists journal identity, creates `WorkerReviewCardMutationPersistenceModule`, and interprets queue projection state.
- `WorkerReviewCardMutationPersistenceModule` owns the SQL transaction, scheduler compute/commit, Card Schedule Store, Review Ledger, domain-sync evidence, undo evidence, mutation stamp, and durability work, but receives queue-impact behavior through callbacks.
- `QueueProjectionRuntime` owns readiness, snapshot reads, row hydration, materialization, writer echo, live identity, local deletion filtering, and diagnostics. Some ordinary read paths may attempt repair/materialization.
- `reviewRenderableContext` provides a normalized read contract, but target kind and progressive identity still originate from loosely typed card metadata.
- `ApplicationContext` has typed factory bundles, yet remains a 3,000-line composition root with broad accessors, service-container knowledge, and multiple late `contextRef` callbacks.

Existing changes are source truth and must not be reimplemented:

- `deepen-review-attempt-kernel`
- `review-session-queue-runtime`
- `absorb-anki-incrementum-architecture-lessons`
- `deepen-runtime-architecture-modules`

This change deepens their Interfaces. It does not replace established Review Ledger, Card Schedule Store, SessionQueueIndex, BrowserProjectionIndex, Review Admission Module, Review Renderable Context, or bounded-context factory behavior.

Constraints:

- Active runtime root remains `H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`.
- Worker/writer owns Review mutation and SQLite writes.
- SiYuan blocks and Xiuyuan aggregates remain content authority.
- Review start consumes Review Admission Ticket; active runtime-backed advancement belongs to SessionQueueIndex.
- BrowserProjectionIndex remains reconstructable derived state.
- No fallback, degrade, dual path, follower-local mutation, UI SQL, renderer schedule commit, or kernel companion DB ownership.
- `retire-native-riff-continuous-sync` is complete and committed. Native Riff now exists only as an explicit import/adoption source; imported or adopted cards enter Review as ordinary SiYuanMemo-owned cards.

## Source-Derived Architecture Comparison

The selected design follows the source code rather than copying product vocabulary.

| System | Review entry and queue | Content resolution | Accepted answer | Lesson for SiYuanMemo |
|---|---|---|---|---|
| SiYuanMemo current runtime | Review Admission and `WorkerReviewSessionRuntime` already own queue/session identity, projection generation, current card, lookahead, counters, skip, and undo | `reviewRenderableContext` infers target kind from progressive metadata and `card.meta.source` | `WorkerReviewFeedbackRuntime` and `WorkerReviewCardMutationPersistenceModule` own validation, journal identity, SQLite transaction, scheduler commit, Review Ledger, undo evidence, mutation stamp, and projection impact | Deepen the existing SRS Review Kernel; do not add a parallel transaction authority. Replace scattered target inference with typed Entry and Content Targets. |
| Anki | A queued `CardId` plus scheduling states is a transient entry projection; the Qt Reviewer is a session/presentation Adapter | `Card -> Note -> Notetype -> Template` resolves rendered content independently from queue entry state | One `AnswerCard` operation validates current state and atomically updates card schedule, revlog, statistics, sibling burying, queue state, and typed undo evidence | Keep entry identity, content identity, attempt evidence, and commit authority distinct. Put atomic answer behavior behind the canonical Review Module rather than exposing transaction stages. |
| Incrementum Tauri | Queue DTOs can point to documents, extracts, or learning items and carry source position/priority evidence | `Document`, `Extract`, `LearningItem`, and `DocumentPosition` are separate models | `apply_review` dispatches scheduler algorithms and writes review result/session statistics around a learning item | Reuse the document/extract/position separation as source-lineage evidence, but do not copy its broad `LearningItem` content owner or treat its dispatcher as a transaction model. |

Deletion-test results:

- A new Review Transaction Kernel fails: deleting it leaves all complexity in the existing session runtime, feedback runtime, persistence transaction, undo journal, and projection-impact path.
- The existing SRS Review Kernel passes once deepened: deleting it would spread session command validation, accepted-answer ordering, frontier advancement, undo, and result semantics across transport and renderer callers.
- Review Entry Target and Review Content Target pass: deleting them would return queue/admission identity and render/source identity interpretation to unrelated callers.
- `ReviewAnswerPipeline` and `WorkerReviewSessionQueueRuntime` remain valuable Modules/Adapters; this change narrows what they must know rather than replacing them.

## Goals / Non-Goals

**Goals:**

- Put Review session commands and one accepted Review mutation behind the existing canonical SRS Review Kernel and one typed result.
- Make projection reads passive and projection repair explicit.
- Replace Review target metadata inference with a discriminated target contract.
- Reduce composition-root knowledge through bounded-context runtime access Modules and bind-once callback seams.
- Increase locality: transaction bugs, projection lifecycle bugs, target-routing bugs, and wiring bugs each concentrate in one Module and one test surface.
- Preserve current RPC names and user-visible behavior during per-slice migration.

**Non-Goals:**

- No new scheduler algorithm.
- No replacement of SessionQueueIndex or BrowserProjectionIndex.
- No new persistent content table.
- No generic dependency-injection framework.
- No broad rename or repository-wide service rewrite.
- No immediate deletion of every `ApplicationContext` getter; remove them only when the same migration slice moves all active callers.
- Explicit Native Riff import/adoption remains outside Review Entry Target semantics and cannot become a second Review launch or scheduling authority.

## Decisions

### Decision 1: Deepen the existing SRS Review Kernel

Do not add a separate Review Transaction Kernel. Deepen the existing canonical SRS Review Kernel into a two-entry Interface:

```ts
interface SrsReviewKernel {
  execute(command: SrsReviewKernelCommand): Promise<SrsReviewKernelResult>;
  read(query: SrsReviewKernelQuery): Promise<SrsReviewKernelView>;
}
```

`SrsReviewKernelCommand` is a discriminated union for `start`, `answer`, `skip`, and `undo`. `SrsReviewKernelQuery` covers `current` and `diagnostics`. The result contains authoritative current card/item identity and state, lookahead, counters, commit status, updated card, attempt/fact identity, durability status, undo evidence/token, queue impact, and typed diagnostics.

Review Entry Target and Review Content Target remain application-owned contracts. The application resolves an Entry Target and Review Admission evidence before the transport Adapter creates a normalized worker start command. After the kernel returns authoritative current card/item identity, the application `ReviewTargetResolver` resolves the Review Content Target. Worker code does not import render intent, source-lineage, editor-action, or application target types.

For `answer`, implementation hides this order:

1. validate command and ownership
2. persist stable journal/idempotency identity when required
3. begin durable Review transaction
4. load Card Schedule Store state and check duplicate commit
5. compute and commit scheduler decision
6. write Card Schedule Store
7. append Review Ledger fact and domain-sync evidence
8. append Review Transaction Undo Journal evidence and mutation stamp
9. commit SQL and required delta/checkpoint evidence
10. advance SessionQueueIndex only after durable commit
11. derive or enqueue post-commit queue impact
12. return one kernel result

`WorkerReviewFeedbackRuntime` and backend Review RPC handlers become transport Adapters. `WorkerReviewSessionRuntime` and `WorkerReviewCardMutationPersistenceModule` become internal implementation or are absorbed. `SrsV2Kernel` remains the internal scheduling computation Module. Existing `ReviewAttemptKernel` consumes the SRS Review Kernel result and remains the application-facing Adapter for non-session callers.

Queue projection impact is derived after the authoritative transaction. Projection failure may produce `deferred`, `refresh-required`, or `unavailable` impact, but cannot roll back an already durable Review commit.

Alternative: add a new Review Transaction Kernel beside `SrsReviewKernel`. Rejected because it creates overlapping authorities and makes the established domain term ambiguous.

Alternative: retain the current pass-through kernel plus feedback runtime + mutation module callback composition. Rejected because transaction ordering, session advancement, error semantics, and queue-impact ownership remain part of several caller Interfaces.

### Decision 2: Queue Projection Lifecycle exposes `read`, `repair`, and `observe`

Deepen the existing Queue Projection Runtime instead of creating independent readiness, reader, repair, and event Modules.

```ts
interface QueueProjectionLifecycle {
  read(request: QueueProjectionReadRequest): Promise<QueueProjectionReadResult>;
  repair(command: QueueProjectionRepairCommand): Promise<QueueProjectionRepairReceipt>;
  observe(listener: QueueProjectionLifecycleListener): () => void;
}
```

- `read` covers readiness, snapshot, and rows-by-id through a typed request/result union.
- `repair` covers materialize, rebuild, invalidate, or refresh operations and is the only mutation entry.
- `observe` publishes committed ready/invalidated identity events.

Passive `read` never calls `repair`. Browser warmup, Review Admission Module, maintenance commands, and explicit user repair decide whether a non-ready result warrants `repair`.

Worker RPC and SQLite repositories remain internal adapters. Writer relay remains the mutation adapter for followers. Local materialization echo, single-flight state, deletion filters, rollout diagnostics, and policy/generation normalization stay hidden.

Alternative: split read and repair into separate public Modules. Rejected because lifecycle identity, single-flight work, diagnostics, and events would be duplicated across two Interfaces.

Alternative: retain current method set. Rejected because callers must learn which read methods may mutate and which state maps must be cleared.

### Decision 3: Review Entry Target and Review Content Target are distinct contracts

Session launch and current-item rendering are different concepts. Introduce:

```ts
type ReviewEntryTarget =
  | ProjectionQueueEntryTarget
  | ManagedQueueEntryTarget
  | StaticSubsetEntryTarget
  | NeuralRoamEntryTarget;

type ReviewContentTarget =
  | StandardCardTarget
  | TopicDerivedTarget
  | ProgressiveExcerptTarget
  | SourceLocationTarget;

interface ReviewTargetResolver {
  resolveEntry(input: ReviewEntryTargetInput): ReviewEntryTargetResolution;
  resolveContent(input: ReviewContentTargetInput): ReviewContentTargetResolution;
}
```

Review Entry Target owns queue/session-launch identity and whether Review Admission is required. Review Content Target owns canonical item identity, source lineage, scheduling/processing classification, render intent, allowed actions, and unavailable reasons. `ReviewRenderableContext` and `SRS Card Render Contract` consume Review Content Target; they do not rediscover target kind from raw `meta`.

The target contracts live at the application seam. Review Entry Target is mapped to the existing worker session-start transport shape after admission. Review Content Target is resolved from the authoritative card/item identity returned by the SRS Review Kernel plus application-owned semantic/source evidence.

Legacy metadata mapping lives in one ingress Adapter. Ambiguous evidence returns typed unavailable and diagnostics; it does not choose a hidden renderer or content owner.

This contract stores no copied question/answer content. Render payload remains derived from SiYuan/Xiuyuan/source authority.

Alternative: use one broad `ReviewTarget` option bag for launch and rendered content. Rejected because queue admission fields and content/render fields create invalid nullable combinations.

Alternative: extend `ReviewRenderableContext.targetKind` with more metadata checks. Rejected because it increases a shallow Interface and spreads identity rules across render callers.

### Decision 4: ApplicationContext exposes bounded-context runtime access

Keep `ApplicationContext` as lifecycle owner and composition root. Existing factory bundles remain. Add narrow runtime-access Modules such as:

- `ReviewRuntimeAccess`
- `BrowserQueueRuntimeAccess`
- `ProgressiveRuntimeAccess`
- `IntegrationRuntimeAccess`

Callers receive the smallest relevant access Module rather than the entire `ApplicationContext` or a long list of getters.

Replace repeated `contextRef` closures with a bind-once late-callback Module. Bootstrap code constructs callback ports before `ApplicationContext`, then binds concrete bounded-context adapters exactly once after construction. Calling before bind or binding twice fails explicitly.

Migrate one bounded context at a time. A legacy getter is removed in the same slice that migrates its final active caller; no long-lived dual access path is introduced.

Alternative: introduce a generic dependency-injection container. Rejected because it hides wiring, weakens type locality, and recreates a global service locator.

Alternative: move lifecycle ownership into each factory bundle. Rejected because startup/disposal ordering would become distributed.

### Decision 5: Slice migration follows authority order

Implementation order:

1. characterization and acceptance gate
2. SRS Review Kernel
3. Queue Projection Lifecycle
4. Review session receipt consumption
5. typed Review Target after confirming the committed Native Riff retirement baseline
6. bounded-context runtime access and bind-once callbacks
7. deletion of superseded orchestration
8. architecture/backlog synchronization and full validation

Each slice must compile, pass focused tests, preserve explicit unavailable outcomes, and remove replaced logic before the next slice starts.

## Risks / Trade-offs

- [Cross-context scope becomes unreviewable] -> Keep one change but implement vertical slices with separate acceptance/test gates.
- [Review transaction receipt grows into a dumping ground] -> Include only authoritative result, durability, queue-impact, and diagnostic evidence needed by current callers.
- [Projection reads become slower without automatic repair] -> Browser warmup and Review Admission explicitly call `repair`; ordinary reads remain deterministic and side-effect free.
- [Native Riff provenance leaks into Review target identity] -> Imported/adopted cards resolve as standard SiYuanMemo-owned card targets; import receipts remain diagnostics/provenance only.
- [ApplicationContext compatibility getters linger] -> Every migration task names getters removed in that slice; no indefinite dual access.
- [Transaction refactor changes durability ordering] -> Add characterization tests around SQL transaction, delta/checkpoint, journal, duplicate replay, and queue-impact timing before moving code.
- [Queue projection lifecycle changes Browser empty/loading behavior] -> Preserve `ready | refreshing | unavailable`; only `ready` with zero rows maps to empty.

## Migration Plan

1. Rebuild acceptance checklist from this design, existing completed changes, current diff, and active backlog.
2. Add characterization tests around current Review transaction order and receipt data.
3. Deepen `SrsReviewKernel` behind existing backend Review RPCs; migrate transaction and session internals without changing RPC contracts.
4. Point `ReviewAttemptKernel` and runtime-backed session advancement at the kernel result; delete duplicate transaction and queue-impact interpretation.
5. Introduce `QueueProjectionLifecycle` adapter over current runtime behavior, then move Browser/Review Admission callers to passive `read` plus explicit `repair`.
6. Remove read-path materialization and old public lifecycle methods after all callers migrate.
7. Introduce `ReviewTargetResolver`, migrate render/context callers, then remove scattered target-kind metadata inference.
8. Add bounded-context runtime access Modules and bind-once callback ports; migrate Review/Browser first, then Progressive/integration.
9. Remove superseded getters, callbacks, and orchestration in the same slices.
10. Update `ARCHITECTURE.md`, `CONTEXT.md` only if domain terms crystallize, and `docs/DDD_RESCAN_BACKLOG.md` for production debt fixed/deferred.

Rollback is per slice: revert the current slice before the next begins. Do not keep old and new mutation owners active together.

## Resolved Questions

- Should the public SRS Review Kernel result expose detailed durability substeps or only a normalized durability summary plus diagnostic event id? Recommended: normalized summary publicly, detailed timings in diagnostics only.
- Should Queue Projection `read` use one request union or three named methods on the same Interface? Recommended: one request union to keep the external Interface small; internal helpers remain named.
- Should `ReviewTargetResolver` consume `SRS Card Render Contract` evidence or produce it? Recommended: resolve Review Content Target identity first, then let render-contract resolution consume the typed target.
- Which `ApplicationContext` access slice migrates first after Review/Queue? Recommended: Progressive, because current backend callbacks already expose explicit progressive and Topic-derived commands.

## Final Deletion Audit

- `SrsReviewKernel` passes: deleting it would spread command validation, idempotent replay, typed failures, answer receipt mapping, and session command routing into every backend Review RPC. Its external Interface is only `execute/read`; worker session, feedback, and persistence Modules are internal Implementation.
- `WorkerReviewCardMutationPersistenceModule` passes as an internal transaction Module: deleting it would spread Card Schedule Store, Review Ledger, domain-sync, undo, mutation-stamp, and durability ordering across feedback callers. Queue-impact construction was removed from its transaction Interface.
- `QueueProjectionLifecycle` passes: deleting it would return passive-read versus explicit-repair knowledge, typed lifecycle outcomes, and observer semantics to Browser, Review Admission, count, and datasource callers. `QueueProjectionRuntime` remains its deep Implementation rather than a second external Interface.
- `ReviewAdmissionModule` passes: deleting it would duplicate recoverability decisions, explicit repair, target-bound ticket identity, and stale-admission validation across dialog, tab, and session factories.
- `ReviewEntryTargetResolver` passes: deleting it would return queue/scope/entry-surface ambiguity handling to topbar, Browser, block menu, Semantic, NeuralRoam, and compatibility callers.
- `LegacyReviewContentTargetAdapter` passes as the single ingress Adapter: deleting it would spread raw metadata conflict, source-lineage, render-intent, and source-version interpretation back across render/editor/navigation callers.
- Bounded-context Runtime Access Modules pass: deleting them would restore full `ApplicationContext` knowledge, repeated availability policy, mutable callback closure knowledge, and startup/disposal checks across factories and integrations. Bind-once callback ports are the real late-composition Seam.
- `ReviewProjectionReceipt` mapping passes: deleting it would duplicate queue-impact interpretation in `ReviewCommitUseCase`, `ReviewAttemptKernel`, queues, and session callers. The mapper is owned only by `ReviewCommitUseCase`; downstream Modules consume the receipt.
- No separate Review Transaction Kernel, generic DI container, copied content-owner table, follower-local mutation, or long-lived dual access path remains.

## Two-Window Writer/Follower Smoke Checklist

- Writer formal Review commit: start an admitted Retrieval Practice or Incremental Learning session in the writer window, answer the current card, and confirm one Card Schedule Store update, one Review Ledger fact, one SessionQueueIndex advance, and no renderer-local schedule write.
- Follower relay commit: answer in the follower window while a writer lease is active; confirm the command relays to the writer, both windows converge on the committed current/next state, and no follower-local SQLite or projection mutation occurs.
- Undo: undo the latest worker-backed answer from the active session; confirm Review Transaction Undo Journal evidence restores Card Schedule Store and SessionQueueIndex state and appends one reversal fact without deleting the original Review Ledger fact.
- Projection invalidation and explicit repair: invalidate the affected BrowserProjectionIndex identity, confirm passive Browser/Admission reads report refreshing or unavailable without materializing, then issue explicit repair and confirm one canonical ready identity reaches both windows.
- Writer unavailable: remove or stop the active writer, submit a formal Review answer from the follower, and confirm explicit unavailable with stable visible current item, no Review Ledger fact, no SessionQueueIndex advance, and no follower-local write.
- Content-source version/change refresh: edit or detach the current SiYuan/Xiuyuan source in one window, refresh presentation in the other, and confirm Review Content Target version/source evidence refreshes or returns typed source-unavailable without changing Review scheduling authority.
- Duplicate protection: retry the same relayed idempotency key and confirm no duplicate Review Ledger fact, no second SessionQueueIndex advance, and no duplicate projection impact.
