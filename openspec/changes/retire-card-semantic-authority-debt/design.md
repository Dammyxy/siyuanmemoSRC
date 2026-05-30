## Context

`protect-card-semantic-payload` introduced the final card ownership model:

- `CardTypeDefinition` is the notetype-like rule authority.
- `Xiuyuan` owns semantic instance data, faces, fields, block bindings, and source lineage.
- `FSRSCard` owns schedulable identity, `xiuyuanID`, `faceKey`, and scheduling state.
- `faceKey = ruleId + optional faceIndex` locates which derived review card is being scheduled; it does not own front/back content.

The remaining debt is not a storage-format problem. SQL mapper and migration now preserve `faceKey` and protected semantic payload. The risky seams are active runtime reads that still treat `meta.faceIndex/typeMarker` as authority, and the SRS editor dialog that can report `confirmation-required` but cannot complete an explicit confirmed retry.

Current traced debt:

- `SrsEditorDialog.vue` calls `updateCardType()` / `updateRender()` without overwrite intent; `applyEditorMutationResult()` surfaces `confirmation-required` and stops.
- `ReviewSessionCursor.buildSessionExclusionLogicalKeys()` derives session sibling/completion exclusion from `meta.faceIndex`.
- `MultiClozeCardRenderService.prepareViewModel()` derives the requested cloze face from `meta.faceIndex`.
- `ConceptDefinitionCardRenderService.prepareViewModel()` derives the face index and direction from `meta.faceIndex/typeMarker`.
- `DescriptorCardRenderService.prepareViewModel()` derives reverse direction from `meta.typeMarker`.

## Goals / Non-Goals

**Goals:**

- Complete the SRS editor two-phase confirmation UX for protected semantic overwrite.
- Centralize authoritative card semantic locator reads behind a small helper/interface.
- Make `faceKey` win over stale legacy `meta` for active Review session exclusion and special card render selection.
- Keep legacy `meta` readable only as a named migration/display/cache projection.
- Add regression tests that encode stale-legacy-meta scenarios.

**Non-Goals:**

- No removal of `meta.templateID/typeMarker/faceIndex` from persisted payloads in this change.
- No broad rewrite of Review rendering policy, Browser row display, or SRS Browser details UI.
- No new notetype/card-template registry beyond the existing `CardTypeDefinition` evolution.
- No automatic repair of old cards beyond read-time authority selection.
- No Xiuyuan aggregate rewrite or new custom card authoring UI.

## Decisions

### Decision 1: add one authoritative semantic locator helper

Add a core helper near the card semantic model, for example `src/core/card/cardSemanticLocator.ts`, with a small interface:

- `resolveCardFaceKey(card)` returns a normalized `CardFaceKey | null`.
- `resolveCardFaceIndex(card)` returns `faceKey.faceIndex` when present, otherwise legacy `meta.faceIndex/ruleIndex`, otherwise `0`.
- `resolveCardRuleId(card)` returns `faceKey.ruleId` when present, otherwise legacy `meta.ruleId/typeMarker`, otherwise `null`.
- `resolveCardRuleDirection(card)` returns direction from authoritative `ruleId` first, then legacy `typeMarker`.

Rationale: active callers need the same precedence rule. Duplicating "`faceKey` first, legacy meta fallback" in each render service would keep the debt alive.

Alternative rejected: delete all legacy `meta` reads. Too broad and unsafe because some callers still use `meta.templateID/typeMarker` for display, cache-key invalidation, or migration-derived render profile routing.

### Decision 2: migrate only active semantic-authority reads first

This slice changes callers where stale `meta` can choose the wrong review instance or render side:

- Review session exclusion logical keys.
- Multi-cloze face selection.
- Concept-definition face and direction selection.
- Descriptor direction selection if the descriptor renderer has enough card context to use `faceKey.ruleId`.

UI display rows, cache keys, debug metadata, and projection-only Browser helpers can keep `meta` reads if they are not semantic authority. Those reads should be left explicit and later retired by separate render-profile cleanup.

Alternative rejected: migrate every `meta.templateID/typeMarker` occurrence in `ReviewContent.vue` and review policy now. Those paths mix display, cache invalidation, legacy routing, and active render decisions; changing them without a render contract pass risks behavior drift.

### Decision 3: confirmed SRS editor overwrite is a pending command, not a silent retry

When `CardEditorApplicationService` returns `confirmation-required`, `SrsEditorDialog.vue` should store a pending command:

- kind: `card-type` or `render`
- target
- card id observed when blocked
- protected field summary from `semanticOverwrite.fields`

The dialog then shows an explicit confirm action. Clicking confirm retries the same service call with `{ semanticOverwriteIntent: { confirmed: true } }`. The pending command is cleared on success, cancel, snapshot refresh for a different card, or any new edit command.

Rationale: the service already owns the invariant. UI only supplies explicit user intent and avoids accidental overwrite after the selected card changes.

Alternative rejected: make `applyEditorMutationResult()` automatically retry after warning. That would defeat the guard and become silent overwrite.

### Decision 4: logical session exclusion key includes rule identity when available

Review session exclusion should use a stable face token derived from `faceKey`, not only a numeric face index. A practical key shape:

- `block:<blockId>::face:<ruleId>#<faceIndex>`
- `xiuyuan:<xiuyuanId>::face:<ruleId>#<faceIndex>`

When `faceKey` is missing, legacy fallback may keep the old numeric shape or produce a legacy token. Tests must cover `faceKey` present with stale `meta.faceIndex`.

Rationale: custom card types can have multiple generation rules where numeric face index alone is not stable enough.

Alternative rejected: exclude by card id only. That would allow sibling derived cards from the same semantic face/rule to reappear in the same completed session.

## Risks / Trade-offs

- Conservative direction parsing from `ruleId` may not match all custom naming schemes -> keep fallback to legacy `typeMarker`, and only treat known suffixes such as `reverse`/`forward` as direction.
- Some old cards lack `faceKey` -> fallback remains read-only compatibility, covered by tests.
- Pending overwrite UI may be cleared by observer refresh -> clear it deliberately when the card identity changes; keep a test for stale pending command not applying to a new card.
- Migrating ReviewContent-wide render routing now would be too broad -> record remaining render-profile cleanup as deferred debt if still present after this change.

## Migration Plan

1. Add semantic locator helper and unit tests for `faceKey` precedence, legacy fallback, and direction parsing.
2. Add failing tests for SRS editor confirmed overwrite, cancel/clear behavior, and no mutation before confirmation.
3. Add failing tests for Review session exclusion where `faceKey` differs from stale `meta.faceIndex`.
4. Add failing render tests for multi-cloze and concept-definition stale `meta` cases.
5. Update callers to use the helper.
6. Update `ARCHITECTURE.md` card semantic ownership wording only if runtime ownership wording changes.
7. Update `docs/DDD_RESCAN_BACKLOG.md` after production code changes, marking remaining legacy projection reads explicitly if any remain.

Rollback is low risk: since no schema change is introduced, reverting this change returns to legacy read precedence and removes only the new confirmation UX.

## Open Questions

- Should descriptor custom `ruleId` direction be parsed from a typed card-rule definition later instead of string suffixes?
- Should ReviewContent render routing get a separate `RenderableCardContext` contract so UI never directly reads legacy `meta` for semantic choices?
- Should confirmed overwrites append a durable audit event, or is the mutation result metadata enough for this slice?
