## Context

The latest card work established the target model:

```text
CardTypeDefinition  -> card generation rules / notetype-like template authority
Xiuyuan             -> semantic instance data, fields, faces, block bindings
FSRSCard            -> schedulable card identity, xiuyuanID, faceKey, schedule
renderContextPolicy -> Review UI routing/cache policy
legacy meta         -> migration/display/debug projection, not authority
```

The traced remaining debt is spread across Review, Browser, storage, and startup, but it has one root shape: callers still read legacy projection fields because the stronger contract is incomplete at a few seams.

The startup error has the same shape. Empty FSRS memory for a new/non-review card can legitimately have `difficulty = 0` in `ScheduleInfo.createDefault()`, algorithm-state tests, and many Browser/query fixtures. But `CardMapper.validate()` still requires DTO difficulty between `1..10`. During startup:

```text
ApplicationContext.create()
  -> UnifiedStorageManager.load()
  -> migrateLegacyFSRSV5SchedulerType()
  -> normalizeMalformedReviewScheduling()
  -> UnifiedStorageManager.save()
  -> SqlUnifiedStorageRepository.saveStore()
  -> resolveCanonicalStoreCards()
  -> CardMapper.validate()
  -> throws Invalid difficulty: must be between 1 and 10
  -> plugin initialization aborts
```

This means a recoverable empty scheduling state can crash initialization while persisting unrelated scheduling normalization.

The second startup repro has the same validation-boundary fault with a different scheduler authority. Historical Topic/Concept rows can be `state = Review` while using `a-factor-v2`; their FSRS columns are compatibility/projection fields, and `aFactor` plus `schedulerMeta.topic` own the scheduling memory. Treating those rows as FSRS Review memory crashes startup with `Invalid stability: review memory must be positive` and would tempt a bad repair: inventing fake positive FSRS stability on an A-Factor card.

## Goals / Non-Goals

**Goals:**

- Make startup scheduling normalization safe for valid empty-new-card DTOs.
- Keep review-state dirty/invalid scheduling data strict; do not silently accept bad mature FSRS memory.
- Replace remaining active Review focus/cache/routing authority reads with `faceKey`, `renderPolicy`, and named helper contracts.
- Classify raw `card.meta` reads into payload/display/debug/projection categories so future cleanup is mechanical.
- Add an audit-first policy for historical native Riff shadow cards.
- Retire Review render compatibility fallback only when the active call chain proves every state carries `renderContext.renderPolicy`.

**Non-Goals:**

- No broad storage schema rewrite.
- No deletion of persisted legacy meta fields in this change.
- No automatic destructive deletion of live DB rows without an audit/preview contract.
- No new custom-card authoring UI.
- No rewrite of scheduler algorithms or FSRS parameters.

## Decisions

### Decision 1: align DTO validation with scheduler state, not with a stale comment

`CardMapper.validate()` should distinguish valid empty memory from invalid review memory:

- non-review/new/learning states may carry empty FSRS memory (`stability = 0`, `difficulty = 0`) when no review has happened;
- effective `fsrs-v6` review/relearning states must not carry empty or out-of-range FSRS memory unless a repair path canonicalizes them first;
- effective `a-factor-v2` Topic/Concept states use `aFactor` / `schedulerMeta.topic` as scheduling authority, so their FSRS projection fields may remain empty and must not be repaired by fabricating FSRS memory;
- `difficulty > 10`, negative difficulty, and non-finite values remain invalid.

Rationale: `ScheduleInfo`, algorithm-state diagnostics, and active fixtures already encode `0` as empty memory. The validator should match domain semantics instead of crashing startup.

Alternative rejected: clamp every `difficulty: 0` to `1`. That mutates new-card memory into reviewed-card-like memory and hides whether the card has ever been scheduled.

### Decision 2: make startup normalization fail closed only on unrecoverable rows

Startup normalization may persist repaired scheduler metadata, but it should not abort the entire plugin for a row that can be normalized under the scheduler contract. For unrecoverable rows, the error must identify the card id and reason.

Rationale: startup should protect data, but recoverable empty-new-card state is not corruption.

Alternative rejected: catch and ignore the `save()` error in `ApplicationContext`. That hides persistence failure and can leave repeated startup loops.

### Decision 3: introduce a Review concept focus contract

`reviewConceptRoam.ts` should stop inferring focus from raw `templateID/typeMarker` as the primary path. The focus resolver should prefer:

1. `fieldMapping.concept` / semantic payload;
2. `faceKey` / semantic locator rule direction;
3. `renderContext.renderPolicy.semanticKind` when available;
4. named legacy projection fallback only for old cards.

Rationale: concept-roam focus is semantic behavior, not display formatting.

Alternative rejected: keep direction-specific legacy logic in UI. That recreates the same authority split already fixed for render routing.

### Decision 4: renderer component identity uses policy tokens

`ConceptDefinitionCardRenderer.vue` and `MultiClozeCardRenderer.vue` identity keys should use `faceKey` and prepared/render policy cache tokens when available. Raw `meta.faceIndex/templateID/typeMarker` may remain only as compatibility fallback.

Rationale: render services now use semantic locator authority, but component caches can still reuse stale prepared view models if their identity keys follow stale legacy fields.

Alternative rejected: always reload on every card object change. That avoids stale cache but hurts Review performance and hides the missing contract.

### Decision 5: split `UnifiedReviewAdapter` raw meta reads by purpose

The adapter may still read card meta, but each read must live behind a named helper:

- semantic render policy / renderer kind;
- answer block selection;
- native Riff sync behavior;
- list-template display mode;
- dependency block collection;
- diagnostics/log projection.

Rationale: a raw-meta ban is not useful because payloads still need meta. The important distinction is authority vs projection.

Alternative rejected: delete all raw adapter meta reads. Too broad and likely to break native Riff and list-template behavior.

### Decision 6: Browser display gets a display projection helper

Browser breadcrumb/display helpers should derive structural display choices from a display projection helper rather than comparing `meta.templateID` inline.

Rationale: Browser display is lower risk than Review routing, but inline `templateID` checks keep the old model alive.

Alternative rejected: migrate all Browser row semantics to full render context now. Browser has different surfaces and should receive a smaller display projection seam first.

### Decision 7: shadow-card cleanup is audit-first

For same-block `builtin-riff-sync` shadow cards, implement detection and diagnostics first. Deletion/hiding must be explicit and test-backed:

- identify plugin-owned Xiuyuan cards and native Riff shadow cards sharing a block;
- report affected card ids, block ids, ownership evidence, and proposed action;
- apply hide/delete only through a named user/admin action or repair command.

Rationale: deleting live user data is a policy decision. The prior runtime fix prevents new semantic loss; this change can safely surface historical damage before mutation.

Alternative rejected: automatically delete all shadows at startup. Too risky and hard to reverse.

### Decision 8: retire Review fallback only after call-chain proof

The Review UI fallback for states without `renderContext.renderPolicy` can be removed only after tests and grep prove active Review state construction always attaches the policy. Test fixtures or legacy restored states must be updated or explicitly classified.

Rationale: removing fallback too early turns compatibility debt into rendering regressions.

Alternative rejected: leave fallback forever. That keeps UI-local legacy routing authority alive.

## Risks / Trade-offs

- [Risk] Allowing `difficulty: 0` too broadly could accept corrupt review cards. -> Mitigation: validation must key off card state/reps/lastReview and keep review/relearning strict.
- [Risk] Startup repair could rewrite scheduling values unexpectedly. -> Mitigation: add regression tests at mapper, SQL repository, and `ApplicationContext` normalization seams; record reasons in diagnostics/backlog.
- [Risk] Concept focus can be ambiguous when field mapping is missing. -> Mitigation: preserve existing "only unambiguous candidate" behavior and expose fallback diagnostics.
- [Risk] Renderer identity tokens may miss custom card-type rule changes. -> Mitigation: include `faceKey.ruleId`, `faceKey.faceIndex`, render policy tokens, card id, block id, and update epoch.
- [Risk] Shadow-card audit can produce noisy results. -> Mitigation: scope detection to same-block plugin-owned card plus `builtin-riff-sync` native shadow evidence.
- [Risk] One change touches several slices. -> Mitigation: implement in phases, each with focused tests and no broad refactor beyond the traced call chain.

## Migration Plan

1. Add failing tests for startup normalization with a DTO/new card containing `difficulty: 0`.
2. Align scheduling DTO validation/canonicalization with empty-new-card semantics.
3. Add Review concept-roam focus contract tests and migrate the focus resolver.
4. Add renderer identity tests and migrate component identity keys to policy/`faceKey` tokens.
5. Add `UnifiedReviewAdapter` helper tests and split raw-meta reads by named purpose.
6. Add Browser display projection helper/tests and replace inline `templateID` structural checks.
7. Add same-block Riff shadow audit tests and diagnostics; keep destructive cleanup explicit.
8. Prove active Review states always carry render policy, then remove compatibility fallback or leave a documented residual if blocked.
9. Update `ARCHITECTURE.md` if ownership wording changes; append `docs/DDD_RESCAN_BACKLOG.md` after production code changes.
10. Validate with focused Vitest, boundary checks, hidden fallback checks, and `pnpm build`.

Rollback: all changes are code-level contract/validation changes without schema break. Revert the runtime changes if regression appears; do not delete live card rows without an audit trail.

## Open Questions

- Should shadow-card cleanup initially be "hide from Review" or "delete from SQL/tombstone" after audit?
- Should `difficulty: 0` be allowed for `Learning` only when `reps = 0`, or for all non-review states?
- Should Browser display projection live beside `reviewRenderableRenderPolicy` or in a separate card display module?
