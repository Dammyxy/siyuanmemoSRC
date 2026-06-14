# Overdesign Audit - 2026-06-14

This audit captures a read-only architecture review of SiYuanMemo's active runtime worktree:

`H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`

It is an input for future refactoring, not an implementation plan. Do not treat all findings as one change. Pick one candidate, create a focused OpenSpec change, validate the active call chain, then update `docs/DDD_RESCAN_BACKLOG.md` only if production code is changed.

## Summary

The strongest overdesign signal is not file size. It is a Module whose Interface is heavier than its active Implementation, or whose Seam no longer has real Adapters on the production path.

Implementation follow-up:

- 2026-06-14: `retire-stale-queue-abstractions` implemented the first candidate. The stale Trait, command, Sequencer, queue Scheduler, provider `SessionManager`, and stale queue observer/type docs/tests were removed after deletion-test evidence.
- 2026-06-15: `retire-old-card-entity-repository` implemented the second candidate. The old `Card` Entity, `ICardRepository`, unwired `CardRepository`, entity mapper helpers, and repository-preserving tests were removed after deletion-test evidence; active FSRS DTO mapping remains.
- Next safe OpenSpec candidate is now `shrink-review-next-dues-cache`.

Strong candidates:

1. Stale Queue abstraction modules: Traits, old Sequencers, old queue Schedulers, and old Observer contracts.
2. Old Card Entity / Repository path not wired into the active production route. Completed by `retire-old-card-entity-repository`.
3. Over-wide `ApplicationContext` and backend runtime facades.
4. Thin UI runtime modules that mostly move `ReviewView` or `SRSBrowser` state sideways.
5. `CacheManagerObserver` carrying unused cache surfaces.

Do not simplify these without new evidence:

- `UnifiedQueueStrategy`
- `UnifiedDataSourceManager`
- `SchedulerRouter`
- `SrsV2SessionQueueRuntime`
- `ReviewSessionCursor`
- `ReviewFeedbackAdvancementCoordinator`
- `BrowserQueueViewLifecycle`
- `ReviewSourceRefreshRuntime`
- `ReviewDataObserverRuntime`
- AI prompt/context/general-chat runtimes

These Modules have real Depth: their Interfaces hide queue membership, scheduling, Review session movement, projection readiness, async state, or tool-loop behavior.

## Candidate 1: Retire Stale Queue Abstractions

Files:

- `src/core/queue/abstraction/types.ts`
- `src/core/queue/commands/*`
- `src/core/queue/sequencers/*`
- `src/core/queue/schedulers/*`
- `src/core/queue/abstraction/OBSERVER_PATTERN.md`
- related tests under `src/core/queue/**/__tests__`

Problem:

The active Queue path is now owned by `UnifiedQueueStrategy`, `UnifiedDataSourceManager`, `BaseReviewQueue`, `SrsV2SessionQueueRuntime`, and `SchedulerRouter`. The older Trait / Sequencer / queue Scheduler / Observer abstractions remain as public-looking Interfaces, but production lookup and Adapter use are weak or absent.

Evidence:

- `getTrait` appears in comments and old abstractions, not active production lookup.
- `IMutableTrait`, `IRemovableTrait`, `IPrioritizableTrait`, `IInterceptiveTrait`, and `IAutoSortableTrait` are mostly consumed by small command wrappers.
- `PrioritySequencer`, `SortedSequencer`, and `FSRSSequencer` implement an older `ISequencer` path, while active order logic is in Review queue runtime modules.
- `src/core/queue/schedulers/*` is separate from the active `src/core/scheduler/SchedulerRouter` route.
- There are two Observer vocabularies: stale `src/core/queue/abstraction/types.ts` and active `src/types/unified-data-source/queue-core.ts`.

Deletion test:

Run targeted searches before deleting:

```bash
git grep "getTrait\|IMutableTrait\|IRemovableTrait\|IPrioritizableTrait\|IInterceptiveTrait\|IAutoSortableTrait"
git grep "new PrioritySequencer\|new SortedSequencer\|new FSRSSequencer"
git grep "CompositeScheduler\|ConditionalScheduler\|LeechScheduler\|NullScheduler\|RiffScheduler\|IScheduler"
git grep "IObservableDataSource"
```

If hits are docs/tests only, remove or archive the stale Module set. If production hits exist, migrate those callers to the active Queue Interface first.

Suggested OpenSpec change:

`retire-stale-queue-abstractions`

Next safe step:

Completed by `retire-stale-queue-abstractions` after commands, Trait Interfaces, old queue Schedulers, Sequencers, and inactive provider `SessionManager` reachability were deletion-tested. Keep this candidate closed unless a new active production reference appears.

## Candidate 2: Retire Old Card Entity / Repository Path

Files:

- `src/domain/entities/Card.ts`
- `src/domain/repositories/ICardRepository.ts`
- `src/infrastructure/persistence/CardRepository.ts`
- entity-oriented half of `src/infrastructure/persistence/mappers/CardMapper.ts`

Problem:

The active Card CRUD route uses `CardApplicationService`, card use cases, `XiuyuanRepository`, `UnifiedStorageManager`, SQL read models, and backend ownership. The old `Card` entity and `ICardRepository` path is a complete DDD-shaped Module, but it appears disconnected from active production wiring.

Evidence:

- Production composition uses `XiuyuanRepository`, `CardReadModel` / `SqlCardReadModel`, and `UnifiedStorageManager`.
- `CardRepository` is directly constructed by tests, not by `ApplicationContext`.
- `CardMapper.toPersistence()` / `toDomain()` remain active for FSRS DTO conversion.
- `CardMapper.fromEntity()` / `toEntity()` mainly support the old `Card` entity path.

Deletion test:

```bash
git grep "new CardRepository\|ICardRepository\|domain/entities/Card\|domain/repositories/ICardRepository"
git grep "CardMapper.fromEntity\|CardMapper.toEntity\|fromEntityBatch\|toEntityBatch"
```

Keep active DTO mapping. Remove only the old entity/repository path if production hits stay absent.

Suggested OpenSpec change:

`retire-old-card-entity-repository`

Next safe step:

Completed by `retire-old-card-entity-repository` after deletion-test evidence found no active production construction/import of the old Entity / Repository seam. Keep this candidate closed unless a new active production reference appears.

## Candidate 3: Narrow ApplicationContext and Backend Runtime Facades

Files:

- `src/application/ApplicationContext.ts`
- `src/application/factories/createApplicationBackendRuntimeBundle.ts`
- `src/application/backendMigration/runtimePolicy.ts`
- `src/application/backendMigration/ownershipMap.ts`
- `src/application/clients/SrsBackendClient.ts`
- `src/application/clients/backendRpcClientCatalog.ts`

Problem:

The composition root has strong reasons to exist, but several Interfaces are too wide. `ApplicationContext` exposes the whole runtime graph to service factories. Backend runtime setup and `SrsBackendClient` aggregate many unrelated facets behind broad Interfaces, which lowers Locality.

Evidence:

- `ApplicationServiceRegistry` is broad and `ServiceFactory(context: ApplicationContext)` gives every factory full root access.
- `getService()` adds a generic container Seam while public getters also remain, so callers effectively learn two Interfaces.
- Backend runtime bundle options mix persistence, writer relay, kernel sidecar, AI, Agent tools, Progressive, Topic, Review, and host-effect wiring.
- `BackendMigrationRuntimePolicy` still carries migration/compat vocabulary such as compatibility-read and rollback behavior.
- `SrsBackendClient` internally holds many facet clients while external callers can still depend on the broad facade.

Deletion test:

This is not a delete-first candidate. Use a dependency audit instead:

```bash
git grep "getSrsBackendClient()"
git grep "getBackendMigrationRuntimePolicy()"
git grep "registerServiceFactory"
git grep "createApplicationBackendRuntimeBundle"
```

For each caller, record the smallest facet it actually needs.

Suggested OpenSpec changes:

- `narrow-application-context-service-factories`
- `split-backend-runtime-host-adapters`
- `narrow-srs-backend-client-facets`

Next safe step:

Pick one bounded context, probably Review commit or Browser read, and inject a narrow facet or typed dependency object. Avoid repo-wide rewiring in one pass.

## Candidate 4: Consolidate Thin UI Runtime Modules

Files:

- `src/ui/review/v2/ReviewView.vue`
- `src/ui/review/v2/reviewAISideAreaRuntime.ts`
- `src/ui/review/v2/reviewInlineCardEditorBridgeRuntime.ts`
- `src/ui/review/v2/reviewHostRuntime.ts`
- `src/ui/review/v2/reviewTabTransferRuntime.ts`
- `src/ui/browser/browserActionMenuRuntime.ts`
- `src/ui/browser/browserLoadDataRuntime.ts`
- `src/ui/browser/browserQueueProjectionWarmupRuntime.ts`
- `src/ui/ai/aiWorkbenchPaneCdfSearchRuntime.ts`

Problem:

Some UI runtime Modules are deep and worth keeping, but others mostly move state sideways from one large component into a one-Adapter helper. That creates more Interfaces without increasing Leverage.

Evidence:

- `ReviewView.vue` still defines many local `*Like` Interfaces and duck-typing helpers after runtime extraction.
- `reviewAISideAreaRuntime`, `reviewInlineCardEditorBridgeRuntime`, and `reviewHostRuntime` have small Implementations and mostly one Adapter.
- `reviewTabTransferRuntime` is a real concept, but its Interface asks for queue, adapter, title, session registry, tab manager, and snapshot sources.
- `browserActionMenuRuntime` hides a lot of behavior, but its dependency Interface is very wide and mixes target resolution, menu rendering, practice launching, refresh policy, and dialogs.
- `browserLoadDataRuntime` and `browserQueueProjectionWarmupRuntime` overlap with `BrowserQueueViewLifecycle` ownership of Queue Projection Readiness.
- `aiWorkbenchPaneCdfSearchRuntime` is very shallow: a small group of refs and getters.

Deletion test:

For each UI runtime, ask:

- Does deleting this Module make complexity reappear in two or more callers?
- Or does complexity return only to the original Vue file?

If only one caller exists and the Interface mirrors Implementation, inline it or merge it into a deeper Review shell / Browser lifecycle Module.

Suggested OpenSpec changes:

- `consolidate-review-shell-runtime`
- `deepen-review-tab-transfer-runtime`
- `consolidate-browser-action-runtime`
- `fold-browser-queue-warmup-into-lifecycle`
- `deepen-or-inline-ai-cdf-search-runtime`

Next safe step:

Do not start with `ReviewView.vue` as a broad cleanup. Start with `aiWorkbenchPaneCdfSearchRuntime` or Review shell glue, because the shallow shape is obvious and risk is lower.

## Candidate 5: Shrink CacheManagerObserver

Files:

- `src/application/observers/CacheManagerObserver.ts`
- `src/application/adapters/UnifiedQueueStrategy.ts`

Problem:

`CacheManagerObserver` claims to manage `nextDues`, card type, and formatted data caches. Production use appears limited to `getNextDuesCache()` from `UnifiedQueueStrategy`.

Evidence:

- `UnifiedQueueStrategy` constructs `CacheManagerObserver` and reads `getNextDuesCache()`.
- `getCardTypeCache()` and `getFormattedDataCache()` are used by tests but not active production callers.

Deletion test:

```bash
git grep "getNextDuesCache\|getCardTypeCache\|getFormattedDataCache\|CacheManagerObserver"
```

If only `nextDues` is active, rename and shrink the Module to a Review next-dues cache, or inline a small LRU into `UnifiedQueueStrategy` if the observer behavior adds no Leverage.

Suggested OpenSpec change:

`shrink-review-next-dues-cache`

Next safe step:

Remove the unused card type and formatted data cache surfaces first. Keep queue invalidation behavior until the cache ownership is clear.

## Keep / Do Not Simplify Without New Evidence

These Modules looked large or abstract but have real Depth:

- `UnifiedQueueStrategy`
  - Hides Review session movement, queue feedback, transaction safety, NeuralRoam advance, counter snapshots, and projection impact.
- `UnifiedDataSourceManager`
  - Owns active queue registration, manager-level observers, projection readiness, and queue access.
- `SchedulerRouter`
  - Current Scheduler Seam; do not confuse it with stale `src/core/queue/schedulers/*`.
- `SrsV2SessionQueueRuntime`
  - Handles active SRS v2 session queue behavior behind a focused runtime Interface.
- `ReviewSessionCursor`
  - Hides current index, cached cards, forward buffer, session-local exclusions, tail spreading, snapshot restore, and same-source spreading.
- `ReviewFeedbackAdvancementCoordinator`
  - Centralizes post-feedback local Review session transition rules.
- `BrowserQueueViewLifecycle`
  - Hides Queue Projection Readiness, projection identity, stale planning, and datasource attach timing.
- `ReviewSourceRefreshRuntime` and `ReviewDataObserverRuntime`
  - Own concrete Review host behavior with async lifecycle and dependency refresh.
- AI prompt/context/general-chat runtimes
  - Hide LLM dispatch, context snapshots, tool loops, approval state, and chat flow behavior.

## Recommended Refactor Order

1. `shrink-review-next-dues-cache`
2. `consolidate-review-shell-runtime`
3. `fold-browser-queue-warmup-into-lifecycle`
4. `narrow-application-context-service-factories`
5. `split-backend-runtime-host-adapters`

Reason:

The first three have clearer deletion tests and lower runtime risk. The latter items touch active composition or UI workflows and should be done only after a narrow OpenSpec proposal.

## Validation Notes

This audit was read-only.

Checks performed:

- Confirmed active worktree and branch status.
- Read `CONTEXT.md`, ADRs, `ARCHITECTURE.md`, and SiYuanMemo skill routing docs.
- Searched active `src/` for production uses of stale traits, sequencers, schedulers, observers, Card entity/repository, cache getters, and wide runtime facades.
- Cross-checked with three focused explorer passes:
  - Queue / Scheduler / Review queue abstraction.
  - ApplicationContext / backend runtime / migration policy.
  - Review / Browser / AI UI surfaces.

Not performed:

- No source edits.
- No tests.
- No build.
- No `docs/DDD_RESCAN_BACKLOG.md` update.

## Open Questions

- Should stale abstraction docs be deleted outright, archived under a historical docs directory, or referenced from a migration-retirement note?
- Resolved 2026-06-15: `CardMapper` should not keep Entity conversion helpers; tests now cover FSRS DTO mapping.
- Should backend migration policy now be considered stable release policy, with migration ledger moved entirely to docs/checkers?
- Should Review shell glue be consolidated in UI first, or should tab transfer ownership move toward `TabManager` first?
