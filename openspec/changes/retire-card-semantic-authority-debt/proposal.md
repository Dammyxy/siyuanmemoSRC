## Why

`protect-card-semantic-payload` established the final ownership model, but two debt seams remain: SRS editor confirmation stops at a warning instead of a confirmed retry, and several active Review/render paths still treat legacy `meta.faceIndex/typeMarker` as semantic authority. This change closes those seams so `faceKey` and protected semantic payload become the operational authority, while legacy `meta` remains display/migration projection only.

## What Changes

- Add a completed SRS editor semantic-overwrite confirmation flow: blocked type/render changes show protected fields, keep the card unchanged, and allow an explicit confirmed retry through `CardEditorApplicationService`.
- Add a card semantic locator read helper that resolves review-instance identity from `FSRSCard.faceKey` first and falls back to legacy `meta.faceIndex/typeMarker/ruleIndex` only for old records.
- Move Review session sibling/completion exclusion to use `faceKey` authority so stale `meta.faceIndex` cannot exclude the wrong derived card.
- Move multi-cloze, concept-definition, and descriptor render direction/index reads to `faceKey` authority where the active renderer receives an `FSRSCard`.
- Keep legacy `meta.templateID/typeMarker/faceIndex` readable for UI display, cache keys, migration seeds, and compatibility projections until each caller has a named replacement.
- Add focused regression tests proving stale legacy `meta` does not override `faceKey`, and confirmed semantic overwrite writes only after explicit user intent.

## Capabilities

### New Capabilities
- `card-semantic-authority-debt`: Covers the remaining runtime debt after semantic payload protection: confirmation retry UX and authoritative card semantic locator reads.

### Modified Capabilities
- `sql-first-card-runtime`: Tightens SQL-first card runtime behavior so semantic identity and render-instance selection come from preserved payload/`faceKey`, not mutable projection metadata.

## Impact

- Affected runtime areas:
  - `src/ui/srs/SrsEditorDialog.vue`
  - `src/application/services/CardEditorApplicationService.ts`
  - `src/application/adapters/review-session/ReviewSessionCursor.ts`
  - `src/core/card/*/application/*RenderService.ts`
  - `src/core/card/semanticPayload.ts` or a sibling semantic locator helper
  - selected Review presentation helpers only where they own active render decisions
- Affected tests:
  - `src/ui/srs/__tests__/SrsEditorDialog.spec.ts`
  - `src/application/adapters/review-session/__tests__/ReviewSessionCursor.test.ts`
  - `src/core/card/multi-cloze/application/__tests__/MultiClozeCardRenderService.test.ts`
  - `src/core/card/concept-definition/application/__tests__/ConceptDefinitionCardRenderService.test.ts`
  - descriptor render tests if the descriptor direction reader is migrated in this slice
- No storage format break. No removal of legacy `meta` projection fields in this change.
