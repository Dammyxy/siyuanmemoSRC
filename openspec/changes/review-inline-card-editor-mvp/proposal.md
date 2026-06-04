## Why

Inline review editing now edits source Markdown in place, but it is still split from the existing SRS/card editor and leaves the rendered preview above the editor. Users who choose to edit during review need one Anki-like card editing surface, not a preview plus a second duplicated editing region.

## What Changes

- Replace the current inline source-only panel with an inline card editor mode in the Review surface.
- Hide the Review content preview while card editor mode is open, so the review area is dedicated to editing.
- Reuse the existing card editor application service and SRS editor capabilities where possible instead of creating a separate metadata mutation path.
- Combine editable source targets with card-level controls such as card type, render family/direction, priority/suspend/schedule actions, and protected semantic overwrite confirmation.
- Make card type select a compatible render family while keeping direction as an explicit dependent control: when the user changes card type, the editor applies a compatible render target; when the user changes direction, render metadata and the card face identity stay synchronized.
- Keep explicit Save/Cancel for source text changes; keep immediate/confirmed mutation behavior for card metadata actions that already behave that way in the existing SRS editor.
- Preserve the current header edit active state, repeat-click no-op, source-refresh suppression, and review-action protection while editing.
- Keep unsupported source content editable through whole-block Markdown fallback; do not infer fields from rendered HTML or dependency block IDs.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `review-inline-editable-targets`: Evolve inline review editing from source-only Markdown editing into a full inline card editor mode and hide the preview while editing.

## Impact

- Affected Review UI: `ReviewView.vue`, `ReviewContent.vue`, `ReviewEditableTargetsPanel.vue` or replacement inline editor component, `reviewCurrentContentEditorRuntime.ts`, `reviewSrsEditorCommands.ts`, and focused Review tests.
- Affected SRS/card editor integration: reuse `SrsEditorDialog.vue` logic and `CardEditorApplicationService` contracts where practical, possibly extracting a shared inline editor body from the dialog.
- Affected card editor transition rules: `applyCardTypeTransition` / `applyRenderTargetTransition` tests must prove render family, direction metadata, and `faceKey`/legacy face identity stay synchronized.
- Affected docs/specs: update `review-inline-editable-targets` requirements and DDD backlog.
- No scheduler, queue membership, backend worker, storage migration, or new persistence owner intended.
