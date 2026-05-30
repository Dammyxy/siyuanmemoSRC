## 1. Render Policy Contract

- [x] 1.1 Add unit tests for `ReviewRenderableContext.renderPolicy` proving concept-definition, descriptor, multi-cloze, quick, image-occlusion, force flags, and legacy fallback diagnostics.
- [x] 1.2 Extend `ReviewRenderableContext` and `buildReviewRenderableContext()` with an additive `renderPolicy` field.
- [x] 1.3 Add policy/cache helper tests proving `faceKey` tokens beat legacy `meta.faceIndex` when building render identity/cache input.
- [x] 1.4 Implement shared render-policy helpers so adapter/preparer/UI can consume one normalized policy shape.

## 2. Prepared Presentation Migration

- [x] 2.1 Add `reviewPresentationPreparer` tests where render context policy chooses a renderer despite stale legacy `meta.templateID/typeMarker`.
- [x] 2.2 Update `reviewPresentationPreparer.ts` to prefer `state.meta.renderContext.renderPolicy` for renderer kind and identity tokens.
- [x] 2.3 Verify image occlusion remains excluded from prepared view-model generation.

## 3. ReviewContent Migration

- [x] 3.1 Add focused `ReviewContent` tests proving context policy routes semantic renderers and stale raw meta does not override it.
- [x] 3.2 Update `ReviewContent.vue` computed routing/cache/watch keys to prefer `props.meta.renderContext.renderPolicy`.
- [x] 3.3 Keep compatibility fallback for states without render context policy and document/diagnose it as fallback.

## 4. Documentation And Validation

- [x] 4.1 Update `docs/DDD_RESCAN_BACKLOG.md` with the Review render meta-routing debt fixed and any remaining concept-roam/display legacy reads deferred.
- [x] 4.2 Run focused Vitest for adapter render context, review render policy, presentation preparer, and ReviewContent cases.
- [x] 4.3 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, and `pnpm build`.
