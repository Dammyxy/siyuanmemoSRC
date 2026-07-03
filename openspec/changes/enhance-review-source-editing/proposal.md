## Why

Review-time source editing is already present, but custom-rendered cards still mix several user expectations: editing source Markdown, editing semantic fields, changing concept references, and keeping review state honest. This change turns the feature into a clear "edit source content while reviewing" workflow for fast card repair, with renderer-specific boundaries and safe queue impact.

## What Changes

- Rename the primary review affordance from generic card editing to source editing, so the feature promises "edit source content" rather than WYSIWYG card design.
- Keep the current card in place after save and refresh the visible renderer; source edits SHALL NOT grade, skip, or reset SRS progress automatically.
- Prefer structured fields for stable renderer families, with raw Markdown as the fallback when grammar is unsafe or unsupported.
- Protect answer integrity: unrevealed cards SHALL NOT expose answer-side fields without an explicit confirmation that also reveals the current card.
- Treat concept fields as relation targets, not editable document-body text: concept-definition and descriptor cards SHALL allow changing the referenced concept card via a selector flow, not by editing the concept document block contents.
- Scope renderer behavior:
  - list-template: field edit current item cue/answer only; full list and question source remain secondary/open-source actions.
  - quick: field edit question/answer only when source grammar is safely recognized; otherwise raw Markdown.
  - multi-cloze: raw Markdown only in this change; no cloze-field rewrite in the first pass.
  - concept-definition: edit definition text and change concept reference; relation direction/type remain read-only.
  - descriptor: edit descriptor cue/answer and change concept reference; relation direction/type remain read-only.
  - image-occlusion: remain unavailable for review-time source editing with a clear reason.
- Add dirty-exit handling for the inline editor: save, discard, or cancel before closing editor, leaving review, or changing cards.
- Preserve partial-save truth: successful block writes remain saved, failed targets stay in the editor with per-target errors.
- Refresh current and same-session same-source card snapshots after ordinary source edits without changing scheduling; CDF/live relation cards continue to use relation repair and preview flows.
- When a saved card no longer qualifies for review, remove it from the current session without scoring; route CDF relation issues to existing `cdf-abnormal`, and keep non-CDF issues as review-session diagnostics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-inline-editable-targets`: tighten source-editing behavior for custom renderers, structured fields, answer reveal protection, concept reference changes, save/refresh semantics, dirty exits, and invalid-card session impact.

## Impact

- Affected UI: `src/ui/review/v2/ReviewView.vue`, `ReviewContent.vue`, `ReviewInlineCardEditor.vue`, editable-target panel components, review toolbar/menu labels, hotkey behavior, and review session guards.
- Affected application boundary: `ReviewApplicationService` block Markdown read/write flow, CDF write-repair preview/apply path, source refresh suppression, and current-session snapshot refresh.
- Affected renderer logic: review render policy and structured field model for quick, list-template, multi-cloze, concept-definition, descriptor, and image-occlusion cards.
- Affected tests: review content editable target tests, inline editor runtime tests, more-menu/editor tests, structured field model tests, CDF relation write-repair tests, and focused review session queue impact tests.
- No breaking API changes are expected; this change refines review behavior and UI contracts on the existing capability.
