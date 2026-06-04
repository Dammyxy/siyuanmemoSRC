## Context

Review custom renderers currently render HTML from source Markdown but expose only one `ReviewEditableSource` through `ReviewContent.getEditableSource()`. `ReviewView` opens `LargeTextEditorDialog`, loads one block with `ReviewApplicationService.getBlockKramdown()`, saves it with `updateBlockMarkdown()`, suppresses source refresh for that block, and refreshes visible content.

Anki's reviewer does not edit the rendered QA DOM directly. The reviewer `e` shortcut opens an editor for the current note, and field editors update source fields instead of rewriting rendered HTML. The same principle fits SiYuanMemo: edit named source targets, not the custom-rendered card DOM.

The active review slice is UI-owned, with source reads/writes staying behind `ReviewApplicationService`. This change should not alter scheduler, queue, card CRUD, SRS editor, or backend persistence ownership.

## Goals / Non-Goals

**Goals:**

- Make review-card source editing available in place from the review surface.
- Replace the single-source modal contract with a multi-target `EditableTarget` contract.
- Support all editable review renderers with at least one safe whole-block Markdown target.
- Add extra targets only when the active renderer exposes precise named source block IDs.
- Protect unsaved edits by pausing review actions while the inline editor is open.
- Preserve the current write boundary while making the read boundary editor-friendly: `getEditableBlockMarkdown()` for load and `updateBlockMarkdown()` for save.

**Non-Goals:**

- No semantic field parser or field-level Markdown rewrite in MVP.
- No Protyle, Vditor, TipTap, or rendered-DOM editor for custom renderers.
- No Anki-style autosave in MVP.
- No default double-click-to-edit behavior in MVP.
- No image-occlusion editing through this flow.
- No scheduler, queue, SRS editor, or backend storage migration.

## Decisions

### Decision 1: `EditableTarget[]` replaces one `ReviewEditableSource`

`ReviewContent` will expose `getEditableTargets()` instead of `getEditableSource()`. Each target represents one whole source block:

- stable target id
- block id
- display title
- source kind: `block-markdown`
- renderer kind
- role or label hint, such as current content, concept, definition, descriptor, or current list item

Alternatives considered:

- Keep one source and choose from a menu. Rejected because semantic cards often have multiple meaningful source blocks and the user asked for an Anki-style all-target panel.
- Expose semantic fields as targets. Rejected for MVP because the codebase does not yet have a safe parser/rewrite contract for every custom renderer.

### Decision 2: Target collection uses named source IDs, never rendered HTML or broad dependencies

Every editable custom renderer gets at least one source target:

- main Protyle and quick: current block source
- multi-cloze: source block from the card/view model
- list template: current child item block
- concept: concept block
- descriptor: descriptor block
- concept-definition: concept block plus definition block

Extra targets may only come from named source identities already available on card metadata or prepared view models, such as `conceptBlockId`, `definitionBlockId`, `parentConcept.blockId`, and known semantic source keys in `fieldMapping`. The collector must not turn `dependencyBlockIds`, breadcrumbs, sibling descriptor IDs, arbitrary `fieldMapping` values, or rendered DOM nodes into edit targets.

Concept-definition currently resolves `definitionBlockId` internally but does not expose it on `ConceptDefinitionCardViewModel`; this change should add that field so the target resolver can be precise instead of guessing from `dependencyBlockIds` or `props.content.id`.

Alternatives considered:

- Use all `dependencyBlockIds` as editable targets. Rejected because those lists include refresh dependencies such as breadcrumbs and sibling descriptors, not just source fields.
- Use current `props.content.id` for every renderer. Rejected because concept-definition and semantic renderers can render from a different precise source block.

### Decision 3: Inline panel replaces the modal editor for review content

The visible edit button and `e` shortcut open an inline editor panel in the review content area. The visible button lives in the Review header toolbar as a compact icon-only action with tooltip/aria text, so the review content area is not occupied by a labeled "edit current content" row. The button remains visible and uses an active/pressed state while the inline editor is open; activating it again is a no-op so dirty editor contents are not reloaded. The panel shows all targets expanded by default. Each target loads its Markdown and tracks dirty state independently. Save writes only dirty targets; Cancel discards all in-panel changes.

The existing modal entry for "edit current content" should be replaced, not kept as a second visible path. The old runtime may be refactored into an inline multi-target runtime or removed once the inline runtime owns the flow.

Alternatives considered:

- Keep modal fallback in the More menu. Rejected because it creates two editing states and duplicate test paths.
- Autosave on blur or debounce, like Anki fields. Rejected for MVP because whole-block Markdown edits need explicit save/cancel affordances.

### Decision 3a: Inline editor reads clean block Markdown, not Kramdown

The editor load path uses a Review-owned `getEditableBlockMarkdown()` boundary backed by SiYuan `blocks.markdown`. The save path remains `updateBlockMarkdown()`.

This avoids showing Kramdown IAL/block attributes such as `{: id="..."}` in the textarea. It also avoids hand-written Kramdown stripping, which could delete user-authored text that only looks like block attributes.

Alternatives considered:

- Strip IAL from `getBlockKramdown()` before displaying it. Rejected because string cleanup risks corrupting legitimate Markdown and still keeps the editor coupled to Kramdown internals.
- Jump directly to semantic field editors. Rejected for MVP because field-level rewrite still needs renderer-specific parser contracts.

### Decision 4: Review actions pause while the inline editor is open

When the inline editor is open, reveal, grade, skip, back, and unmodified review hotkeys must be ignored or disabled. Text-input shortcuts stay local to the editor; Save and Cancel remain available. After successful save or cancel, review actions resume.

This is not a default content lock. It only protects dirty editor state after the user chooses to edit.

Alternatives considered:

- Allow review actions and prompt only when dirty. Rejected for MVP because it adds a nested save/discard decision to every review action.
- Allow free advancement with retained drafts. Rejected because drafts would need cross-card lifecycle and recovery rules.

### Decision 5: Save is dirty-target only and refreshes the current card

On Save, the runtime compares each target's current Markdown to its loaded original value and calls `updateBlockMarkdown()` only for dirty targets. It suppresses source refresh for each saved block id and then calls `refreshVisibleContent('manual-edit-save')` once. If any save fails, the panel remains open and the error is surfaced; already saved targets keep their new originals.

Alternatives considered:

- Save every target every time. Rejected because unchanged source writes create avoidable churn and refresh noise.
- Try to batch or transact multiple block updates. Rejected for MVP because the current review service boundary is per-block Markdown update.

## Risks / Trade-offs

- Whole-block Markdown editing exposes raw source structure -> Read clean block Markdown for the editor, keep labels clear, and defer semantic field editors until a parser/rewrite contract exists.
- Multiple block saves are not transactional -> Save dirty targets explicitly, keep the panel open on failure, and refresh only after attempted saves complete.
- Target overexposure can make semantic cards noisy -> Use named source IDs only and exclude dependencies, breadcrumbs, and siblings.
- Keyboard conflicts can accidentally grade cards while typing -> Route inline editor state through the existing review keyboard guard and action disabling.
- Existing tests assume `getEditableSource()` -> Migrate tests to target arrays and add coverage for multi-target semantic cases.

## Migration Plan

1. Add `ReviewEditableTarget` types and migrate `ReviewContent` from `getEditableSource()` to `getEditableTargets()`.
2. Expose precise named source IDs from prepared view models where required, starting with concept-definition `definitionBlockId`.
3. Add an inline multi-target editor runtime and component, reusing the current review service load/save boundary.
4. Replace `LargeTextEditorDialog` usage for review content editing with the inline panel and visible edit button.
5. Extend review editor state and keyboard handling so open inline editing pauses review actions.
6. Update focused ReviewContent, ReviewView, runtime, menu/button, keyboard, and save behavior tests.

Rollback is code-level only: revert the inline editor change and restore the previous single-source modal path.

## Open Questions

- None for MVP. Double-click-to-edit, autosave, and semantic field-level editors remain deferred follow-ups.
