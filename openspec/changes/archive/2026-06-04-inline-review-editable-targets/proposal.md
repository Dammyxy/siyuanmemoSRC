## Why

Custom-rendered review cards are readable but awkward to fix during review because their current Markdown editor opens as a modal and only targets one inferred source block. Users need an Anki-like way to edit the source material in place, especially for semantic renderers whose visible card may be assembled from multiple source blocks.

## What Changes

- Replace the review "edit current content" modal entry with an inline review editor panel opened from a compact right-top review toolbar edit button and the `e` shortcut.
- Keep that header edit button visible and highlighted while the inline editor is open, so the review surface has an explicit editing-state indicator.
- Introduce `EditableTarget` as the review-side contract for one or more source blocks, with each target editing whole `block-markdown` in MVP.
- Show all available editable targets in an Anki-style panel, expanded by default, with explicit Save and Cancel actions.
- Load editable target Markdown from a clean block Markdown read boundary so Kramdown IAL/block IDs are not shown in the inline editor.
- Save only dirty targets, suppress source refresh for saved block IDs, and refresh the current visible review content after save.
- Pause reveal, grade, skip, back, and review hotkey actions while the inline editor is open so dirty Markdown cannot be lost by accidental review advancement.
- Keep semantic field-level parsing and rewrite out of MVP; the first version edits whole block Markdown only.
- Do not expose image occlusion as editable in this flow.

## Capabilities

### New Capabilities

- `review-inline-editable-targets`: Defines inline review editing, editable target resolution, multi-target save behavior, and review-action protection while editing.

### Modified Capabilities

- None.

## Impact

- Affected Review UI: `src/ui/review/v2/ReviewView.vue`, `src/ui/review/v2/ReviewContent.vue`, `src/ui/review/v2/types.ts`, `src/ui/review/v2/reviewEditorState.ts`, review keyboard/menu/editor runtimes, and focused Review tests.
- Affected card rendering contracts: prepared view models for semantic renderers may need to expose precise editable block IDs, especially concept-definition `definitionBlockId`.
- Affected services: `ReviewApplicationService.getEditableBlockMarkdown()` owns the inline editor read boundary, while `updateBlockMarkdown()` remains the save boundary.
- No scheduler, queue membership, card CRUD, SRS editor, Protyle editor, or backend persistence contract changes are intended.
