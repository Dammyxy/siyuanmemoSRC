## Context

SiYuanMemo-owned SRS is the default authority for card identity, scheduling, review history, and Browser membership. Native Riff remains useful only as explicit interoperability: importing, registering, deleting, or rating native cards when the user or a migrated compatibility path asks for that behavior.

Current code still exposes multiple shallow seams for that one compatibility concern:

- `ProgressiveNativeRiffPort` and `AutoCardRiffPort` have the same interface and one trivial adapter each.
- `ProgressiveReadingService` and `TopicDerivedItemService` receive Native Riff adapters even though `NativeRiffCompatibilityPolicy` disables ordinary actions by default.
- `ApplicationContext` still contains several Native Riff startup decisions: settings normalization, event sync handler, transaction trigger handler, and kernel action pump fanout.

This change applies the deletion test: if a Native Riff module only forwards `BUILTIN_DECK_ID` and `addRiffCards`, or if a startup branch only exists to keep a retired dual-path alive, it should disappear or move behind one explicit compatibility interface.

## Goals / Non-Goals

**Goals:**

- Make Native Riff Compatibility one explicit module/interface instead of duplicated Progressive and AutoCard ports.
- Keep ordinary SiYuanMemo-owned SRS paths free of Native Riff write dependencies.
- Preserve explicit Native Riff interoperability when requested by policy or compatibility settings.
- Fail closed when explicit Native Riff compatibility is requested but the compatibility runtime is unavailable.
- Leave a focused validation trail: policy tests, service tests, ApplicationContext wiring tests, hidden fallback checks, boundaries, and build.

**Non-Goals:**

- Do not remove Native Riff import/read/audit contracts needed for existing compatibility or migration flows.
- Do not change scheduler truth, Review availability, Browser read model behavior, or Xiuyuan card model semantics.
- Do not rewrite Review render legacy projection or storage legacy migration loader in this change.
- Do not add new fallback, degrade, best-effort, or dual-path behavior.

## Decisions

### Decision 1: Use one Native Riff compatibility interface

Create or reuse a single application-level module for explicit Native Riff operations such as `addRiffCards` and built-in deck identity. Progressive, Topic-derived item, and AutoCard paths consume this one interface only when compatibility behavior is explicitly enabled.

Alternative considered: keep separate `ProgressiveNativeRiffPort` and `AutoCardRiffPort`. Rejected because both interfaces and adapters are shallow: callers learn two names for the same behavior, and tests mock the same dependency twice.

### Decision 2: Ordinary SRS paths do not own Native Riff adapters

Services that handle ordinary SiYuanMemo-owned SRS actions should not require Native Riff write adapters in their constructors. The policy decision should short-circuit before a Native Riff write dependency is needed.

Alternative considered: keep adapters injected but never call them. Rejected because a dormant dependency still makes the interface larger and suggests Riff remains part of the default truth.

### Decision 3: Keep one explicit startup owner for Native Riff sync

When compatibility sync is enabled, ApplicationContext should choose one active sync owner. Kernel transaction action pump is preferred when kernel transaction ingest is enabled; the older transaction trigger handler should remain only if it is the explicit configured owner, otherwise be removed or unavailable.

Alternative considered: leave event handler, transaction handler, and action pump all present with guard branches. Rejected because multiple seams for one compatibility path reduce locality and make no-op edit jank harder to reason about.

### Decision 4: Treat Review/storage legacy cleanup as follow-up work

Review render `legacyProjection` and storage `createLegacyStorageLoader` are real razor candidates, but they cross different ownership and migration surfaces. This change records them as follow-up debt instead of widening the Native Riff cut.

Alternative considered: include all razor candidates in one change. Rejected because it would mix Riff interoperability, Review rendering, and storage migration risks.

## Risks / Trade-offs

- Explicit Native Riff users could lose interoperability if a policy path is misclassified -> mitigate with tests for explicit compatibility actions and settings-enabled sync.
- Removing dormant constructor dependencies may require test fixture churn -> mitigate with focused fixture helpers and no behavior changes to ordinary SRS outputs.
- Startup sync owner selection could miss a transaction path -> mitigate with ApplicationContext writer relay/fanout tests and existing kernel ingest/action pump tests.
- Historical docs may still mention Riff as a data source -> mitigate by updating active architecture/backlog only if implementation changes runtime ownership.

## Migration Plan

1. Introduce the single Native Riff compatibility interface and adapter.
2. Replace duplicate Progressive and AutoCard Riff ports with the shared compatibility interface.
3. Remove ordinary-path Native Riff constructor dependencies where policy disables compatibility by default.
4. Simplify ApplicationContext startup selection so compatibility sync has one explicit owner.
5. Delete obsolete duplicate port/adapter files and update tests.
6. Run focused tests and boundary/fallback/build validation.

Rollback: revert this change. No persisted data schema change is planned.

## Open Questions

- Should explicit Native Riff add-card compatibility live as a direct application port, or under a small `NativeRiffCompatibilityRuntime` that also owns audit counters?
- Should delete/rating compatibility join the same interface now, or wait until the current add-card duplication is removed?
