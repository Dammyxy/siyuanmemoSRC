## 1. Red Tests And Locator Helper

- [x] 1.1 Add card semantic locator unit tests for `faceKey` precedence over stale `meta.faceIndex/typeMarker`, legacy fallback, and direction parsing.
- [x] 1.2 Implement a core semantic locator helper that resolves `faceKey`, face index, rule id, and rule direction from `FSRSCard` with explicit legacy fallback.
- [x] 1.3 Replace duplicate local face-index/rule parsing in the touched slice only after helper tests pass.

## 2. SRS Editor Confirmation Flow

- [x] 2.1 Add SRS editor dialog tests proving `confirmation-required` stores a pending command, shows protected fields, and does not mutate before confirmation.
- [x] 2.2 Add SRS editor dialog tests proving confirm retries `updateCardType` / `updateRender` with `semanticOverwriteIntent.confirmed = true`.
- [x] 2.3 Add stale-pending tests proving card change, snapshot refresh for a different card, cancel, or a new edit clears pending overwrite.
- [x] 2.4 Implement the pending semantic overwrite state, confirm/cancel UI actions, i18n labels, and confirmed retry wiring in `SrsEditorDialog.vue`.

## 3. Review Session Semantic Exclusion

- [x] 3.1 Add `ReviewSessionCursor` tests where a reviewed card has `faceKey` that disagrees with stale `meta.faceIndex`.
- [x] 3.2 Change session exclusion logical keys to use semantic locator tokens from `faceKey` first and legacy fallback only for old cards.
- [x] 3.3 Verify serialized/restored `sessionExcludedLogicalKeys` remain compatible for existing sessions.

## 4. Special Renderer Authority Reads

- [x] 4.1 Add multi-cloze render tests proving `faceKey.faceIndex` selects the rendered cloze when legacy `meta.faceIndex` is stale.
- [x] 4.2 Update `MultiClozeCardRenderService` to use the semantic locator helper for requested face index.
- [x] 4.3 Add concept-definition render tests proving `faceKey.faceIndex/ruleId` select face and direction before legacy `meta`.
- [x] 4.4 Update `ConceptDefinitionCardRenderService` to use semantic locator helper for face index and direction, with legacy fallback.
- [x] 4.5 Add descriptor render tests or document why descriptor direction cannot safely migrate in this slice.
- [x] 4.6 Update `DescriptorCardRenderService` to use semantic locator helper for rule direction when tests prove the active path has card context.

## 5. Documentation And Validation

- [x] 5.1 Update `ARCHITECTURE.md` only if runtime card semantic ownership wording changes beyond the existing `protect-card-semantic-payload` text.
- [x] 5.2 Update `docs/DDD_RESCAN_BACKLOG.md` with debt fixed and any intentionally deferred legacy render/profile reads.
- [x] 5.3 Run focused tests for semantic locator, SRS editor dialog, ReviewSessionCursor, multi-cloze renderer, concept-definition renderer, and descriptor renderer if changed.
- [x] 5.4 Run `pnpm run check:boundaries`, `node scripts/check-no-runtime-msgpack.cjs`, `node scripts/check-hidden-fallbacks.cjs`, and `pnpm build`.
