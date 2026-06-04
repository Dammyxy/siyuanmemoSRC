## Context

The completed `review-inline-editable-targets` change gives Review a header edit action and an inline multi-target Markdown panel. Separately, Review already has an `编辑 SRS 数据` dialog backed by `CardEditorApplicationService` and `SrsEditorDialog.vue`, with card type, render target, priority, schedule, suspend, reset, transparency, and protected semantic overwrite behavior.

The user chose the fuller direction: editing during review should be a complete card editor. They also clarified that once edit mode opens, the rendered card preview above the editor should disappear because it duplicates the editor content and consumes review space.

## Goals / Non-Goals

**Goals:**

- Use one inline card-editor mode inside Review.
- Hide `ReviewContent` preview while inline card-editor mode is open.
- Reuse existing SRS/card editor service contracts for metadata mutations.
- Keep source editing through `EditableTarget[]` and `getEditableBlockMarkdown()` / `updateBlockMarkdown()`.
- Surface card-level controls needed for real card editing: type, render family/direction, priority, suspend, schedule/reset where safe.
- Make card type choose a compatible render family, and make direction changes synchronize both render metadata and face identity so type edits do not strand incompatible render state.
- Preserve source Save/Cancel, metadata confirmation, review action protection, active header state, and repeat-click no-op.

**Non-Goals:**

- No new backend/storage owner.
- No autosave for source text.
- No rendered DOM editor.
- No guessing editable source fields from dependency blocks or rendered HTML.
- No full redesign of SRS transparency; reuse or extract existing editor body.
- No changing review scheduling semantics while the editor is open.

## Decisions

### Decision 1: Inline card editor mode replaces preview while open

When `reviewTextEditorOpen` or the successor card-editor state is true, Review hides the rendered card preview and shows only the editor surface below the header. Review actions remain disabled/ignored as they are today, or hidden if that better fits the final layout.

Alternatives considered:

- Keep preview above editor. Rejected by user because it is redundant.
- Put editor in a modal. Rejected because the current direction is in-place review editing.

### Decision 2: Extract shared SRS editor body rather than duplicating metadata logic

The inline editor should reuse `CardEditorApplicationService` and as much of `SrsEditorDialog.vue` as practical. The likely shape is a shared component/body that can render in dialog mode and inline Review mode:

- dialog mode keeps current SRS editor behavior
- inline mode removes dialog-only chrome and fits the review content area
- events for scheduled/dismissed cards keep the current Review advancement hooks

Alternatives considered:

- Build a new inline metadata editor from scratch. Rejected because it would duplicate card type/render/priority/schedule/dismiss logic and protected semantic overwrite behavior.
- Embed the existing dialog component unchanged inside Review. Risky because dialog layout includes preview/transparency sections and sizing assumptions that may not fit inline mode.

### Decision 3: Source edits and metadata edits keep separate persistence semantics

Source Markdown edits stay draft-based with explicit Save/Cancel. Card metadata actions keep the existing immediate or confirmation-required semantics from `SrsEditorDialog` and `CardEditorApplicationService`.

This means the inline card editor may contain both:

- draft source editors with Save/Cancel
- card controls that apply immediately or after confirmation

The UI must make this distinction clear without adding nested modal flows.

Alternatives considered:

- Make every metadata edit wait for one global Save. Rejected because it would require a new transactional card editor layer and would change existing SRS editor semantics.
- Autosave source Markdown. Rejected because current source editing intentionally protects whole-block changes behind explicit Save/Cancel.

### Decision 4: Card type owns render family; direction owns face/render synchronization

In the inline editor, card type is the primary family edit. Render direction remains a visible dependent edit for render families that support it:

- changing to Topic applies a Topic-compatible render target
- changing to Concept applies concept render metadata
- changing to Descriptor applies descriptor render metadata, preserving forward/reverse direction when already compatible
- changing to Item must resolve to an explicit Item-compatible render policy rather than accidentally retaining stale semantic render metadata

The existing `applyCardTypeTransition` already has `recommendedRenderTarget`; this change should make the inline editor and transition tests treat that recommendation as part of type mutation semantics.

Direction is not independent free text in the current plugin. The existing SRS editor exposes it through render targets such as `concept-definition-forward`, `concept-definition-reverse`, `descriptor-forward`, and `descriptor-reverse`. Runtime rendering has two identity layers:

- current authoritative identity: `FSRSCard.faceKey` or `meta.faceKey`, especially `ruleId` and `faceIndex`
- legacy/display compatibility: `meta.renderProfile`, `meta.typeMarker`, `meta.templateID`, and legacy `meta.faceIndex`

Render services prefer `faceKey` direction over stale legacy markers. Therefore a direction change in the inline editor must not only update `renderProfile` / `typeMarker` / `templateID`; it must also update or clear the compatible `faceKey.ruleId` / `meta.faceKey.ruleId` when present. Otherwise the editor can show "reverse" while Review still renders "forward".

Alternatives considered:

- Keep card type and render fully independent. Rejected because the user explicitly wants render to follow type so changing type does not lose render.
- Hide render/direction entirely. Rejected because direction remains a real card-editing choice for descriptor/concept-definition-like render families.
- Update only legacy `typeMarker` / `templateID` for direction changes. Rejected because Review renderers already use `faceKey` as the stronger direction signal.

### Decision 5: Field editing becomes part of full card editor, not first implementation axis

The full card editor may later present safe named fields, but the first integration should make the complete editor shell correct: no duplicate preview, source targets present, card metadata controls present, and existing service contracts reused.

Alternatives considered:

- Start with parser/rewrite field adapters. Rejected after clarification because the user's selected target is a complete card editor, not only field syntax cleanup.

## Risks / Trade-offs

- Inline editor becomes too tall -> hide preview, keep scroll-bounded editor body, and reuse compact SRS editor sections.
- Source Save/Cancel mixed with immediate metadata controls -> visually separate source draft area from card metadata sections and preserve existing confirmation banners.
- Reusing `SrsEditorDialog` directly may leak dialog assumptions -> extract a shared editor body or add an explicit inline variant.
- Hiding preview may remove useful visual context -> header/card identity chips and source target titles must remain visible.
- Type/render coupling may surprise users who manually set render -> show render family/direction as the dependent result of selected type and preserve compatible direction choices.
- Stale `faceKey` can override updated legacy render metadata -> add transition tests where `faceKey.ruleId` disagrees with `typeMarker`, and require the mutation to keep actual Review rendering and cache keys aligned.
- Existing tests expect `ReviewContent` to remain mounted while source editor is open -> add tests for preview hidden and refresh behavior after save/cancel.

## Migration Plan

1. Tighten card type and render transition tests for type-driven render-family synchronization and direction-driven `faceKey`/legacy metadata synchronization.
2. Refactor SRS editor dialog body only as needed to support inline rendering.
3. Replace source-only inline panel with a full inline card editor mode that includes source targets and card metadata controls.
4. Hide Review preview while editor mode is open.
5. Keep current source Save/Cancel and metadata event hooks.
6. Validate with focused Review/SRS editor tests, OpenSpec validation, boundary checks, and build.

Rollback is code-level: return Review to the current source-only inline Markdown panel and keep SRS editor as dialog-only.

## Open Questions

- For Item cards, should type-driven render always become standard/default editor render, or preserve quick render when the source is an explicit quick card?
