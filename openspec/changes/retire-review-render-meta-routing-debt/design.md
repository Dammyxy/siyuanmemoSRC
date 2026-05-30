## Context

The Review adapter already builds `ReviewRenderableContext` and stores it on `ReviewUIState.meta.renderContext`. That context currently owns target identity, content/answer block ids, progressive lineage, scheduler snapshot, and allowed actions.

The remaining debt is that Review render routing still happens mostly inside `ReviewContent.vue` and `reviewPresentationPreparer.ts` by reading raw `FSRSCard.meta` fields:

- `templateID`
- `typeMarker`
- `faceIndex`
- `renderProfile`
- quick/protyle force flags
- multi-cloze mode / faces

Some of those reads are legitimate display/cache/projection reads, but the active semantic decision "which renderer should own this review surface" should not be spread through UI code. The current code already has an intended seam: `ReviewRenderableContext`.

## Goals / Non-Goals

**Goals:**

- Make `ReviewRenderableContext` carry the normalized render-routing policy that Review UI needs.
- Keep `faceKey` / existing semantic helper precedence for review-instance identity.
- Let `ReviewContent.vue` and `reviewPresentationPreparer.ts` consume render policy rather than interpreting raw legacy meta for semantic renderer choice.
- Preserve old cards by allowing one named legacy projection fallback inside the context builder/policy helper.
- Add regression tests for stale `meta.templateID/typeMarker/faceIndex` not overriding render context policy.

**Non-Goals:**

- No storage schema change.
- No removal of `FSRSCard.meta` fields.
- No Browser row/display cleanup.
- No full rewrite of special renderer services.
- No custom card authoring UX changes.

## Decisions

### Decision 1: extend `ReviewRenderableContext`, do not create a parallel object

Add a `renderPolicy` field to `ReviewRenderableContext` rather than introducing a second `RenderableCardContext`.

Shape:

- `profile`: normalized render profile from `RenderProfileResolver`
- `specialRendererKind`: normalized renderer decision when it can be known synchronously
- `semanticKind`: `concept-definition | concept | descriptor | multi-cloze | quick | image-occlusion | null`
- `forceProtyleRender`
- `forceQuickRender`
- `quickDetectReason`
- `cacheTokens`: stable tokens used by UI cache/watch keys without re-reading raw `meta.typeMarker/faceIndex`
- `legacyProjection`: optional diagnostics showing which legacy fields were used as compatibility fallback

Rationale: the adapter already owns `contentBlockId`, `answerBlockId`, and target identity. Keeping render policy there makes the boundary obvious and avoids adding a new object that duplicates context state.

Alternative rejected: keep policy in `ReviewContent.vue`. That is the debt we are retiring.

### Decision 2: keep legacy meta reads inside policy builder only

`buildReviewRenderableContext()` may read legacy projection meta because it is the adapter bridge from persisted card rows into review UI. Those reads must be named by the policy result and covered by tests.

Rationale: old cards still need to render. Deleting all meta reads would break compatibility. Naming them as `legacyProjection` keeps them from being mistaken for domain authority.

Alternative rejected: remove all `templateID/typeMarker` routing immediately. Too broad and unsafe while old rows still depend on projection metadata.

### Decision 3: UI still may use raw meta for renderer payload/logs, not routing authority

`ReviewContent.vue` can keep raw `card.meta` for:

- passing full card payload into renderer services
- dependency block ids
- logs/debug fields
- display mode that follows normalized policy
- old cache invalidation only when no policy exists

But special renderer selection and quick/protyle force decisions should prefer `props.meta.renderContext.renderPolicy`.

Rationale: renderer services still need the full card payload, and logs remain useful. The debt is about routing authority, not banning all raw payload access.

### Decision 4: staged cleanup inside the active Review slice

This change should first migrate:

- `reviewRenderPolicy` decision helpers
- `reviewPresentationPreparer`
- `ReviewContent.vue` computed routing

If `reviewConceptRoam.ts` still has direction/focus reads that mix semantic focus rather than render routing, leave them for a separate concept-roam focus contract unless tests prove it is the same bug.

Rationale: keeping the slice to Review rendering avoids a cross-feature refactor.

## Risks / Trade-offs

- Policy drift between adapter and UI → Mitigate by using the same `resolveReviewSpecialRendererKind()` helper in the context builder and UI fallback.
- Old cards lack policy because a test or custom state omits `meta.renderContext` → Mitigate by preserving UI fallback path but marking it as compatibility fallback, not primary route.
- Quick cards still require async verification → Mitigate by storing quick intent in policy while keeping existing async `isQuickCard()` verification for `quick-default` and forced quick miss handling.
- Cache keys may become too coarse if raw `typeMarker` is removed from them → Mitigate with explicit `cacheTokens.faceToken`, `profile`, `specialRendererKind`, and force flags.

## Migration Plan

1. Add tests for `ReviewRenderableContext.renderPolicy` shape and stale meta cases.
2. Extend `reviewRenderPolicy` with helpers that build policy/cache inputs from context.
3. Extend `buildReviewRenderableContext()` to include policy and named legacy projection diagnostics.
4. Update `reviewPresentationPreparer.ts` to prefer `state.meta.renderContext.renderPolicy`.
5. Update `ReviewContent.vue` special renderer and quick/protyle routing computed values to prefer context policy.
6. Keep fallback for tests or old callers that omit `renderContext`.
7. Update backlog after production code changes.

Rollback is low risk: context shape is additive and raw card meta remains available.
