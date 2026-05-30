## Why

`retire-card-semantic-authority-debt` moved face selection and special renderer instance reads to `faceKey`, but Review UI render routing still interprets raw legacy `meta.templateID/typeMarker/faceIndex` in `ReviewContent.vue` / `reviewRenderPolicy`. That keeps semantic routing authority split between adapter-owned render context and UI-local metadata heuristics.

## What Changes

- Extend the existing `ReviewRenderableContext` into the Review render-routing contract by carrying a normalized render policy snapshot: render profile, special renderer kind, semantic-card flags, quick/protyle force flags, and cache identity tokens.
- Move legacy `meta.templateID/typeMarker/faceIndex` interpretation for Review render routing into one adapter/policy builder where legacy reads are named projection fallback, not UI authority.
- Update `ReviewContent.vue` and `reviewPresentationPreparer.ts` to consume the render context/policy instead of recomputing semantic renderer choice from raw `FSRSCard.meta`.
- Keep raw `card.meta` available for renderer payloads, logs, display/debug, and compatibility fallback; do not remove persisted meta fields in this change.
- Add focused regression tests proving stale legacy meta cannot override `faceKey` / render context policy for Review special renderer selection.

## Capabilities

### New Capabilities
- `review-render-context-routing`: Review render routing is driven by adapter-owned render context/policy rather than UI-local raw legacy metadata reads.

### Modified Capabilities
- `card-semantic-authority-debt`: Completes the deferred Review render-profile cleanup by making remaining Review render-routing legacy reads explicit compatibility projections.

## Impact

- Affected runtime areas:
  - `src/application/adapters/reviewRenderableContext.ts`
  - `src/application/adapters/UnifiedReviewAdapter.ts`
  - `src/ui/review/v2/reviewRenderPolicy.ts`
  - `src/ui/review/v2/reviewPresentationPreparer.ts`
  - `src/ui/review/v2/ReviewContent.vue`
- Affected tests:
  - `src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts`
  - `src/ui/review/v2/__tests__/reviewRenderPolicy.test.ts`
  - `src/ui/review/v2/__tests__/reviewPresentationPreparer.test.ts`
  - selected `ReviewContent.editor-state.spec.ts` cases if component behavior changes
- No storage format change. No removal of legacy meta projection fields.
