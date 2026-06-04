## 1. Editable Target Contract

- [x] 1.1 Add focused `ReviewContent` tests for `getEditableTargets()` covering main Protyle, list-template, quick, multi-cloze, concept, concept-definition, descriptor, and unsupported image-occlusion/html/empty content.
- [x] 1.2 Add tests proving concept-definition exposes separate concept and definition targets and does not infer targets from `dependencyBlockIds`.
- [x] 1.3 Replace `ReviewEditableSource` with `ReviewEditableTarget` types and migrate `ReviewContent` exposed API from `getEditableSource()` to `getEditableTargets()`.
- [x] 1.4 Expose precise named source IDs needed by target resolution, including `ConceptDefinitionCardViewModel.definitionBlockId`.
- [x] 1.5 Implement renderer-specific target collection using named source IDs only; exclude breadcrumbs, sibling descriptors, arbitrary `fieldMapping` values, and dependency-only IDs.

## 2. Inline Multi-Target Editor Runtime

- [x] 2.1 Add runtime tests for opening with multiple targets, loading each target Markdown, independent dirty tracking, no-op save with no dirty targets, and cancel discarding edits.
- [x] 2.2 Add runtime tests proving save writes only dirty targets, suppresses refresh for saved block IDs, refreshes visible content once, and keeps the editor open on save failure.
- [x] 2.3 Implement an inline review editable-target runtime that loads targets through the Review application service and saves through `updateBlockMarkdown()`.
- [x] 2.4 Add the inline multi-target Markdown editor component/panel using SiYuan-native compact styling, all targets expanded by default, and explicit Save/Cancel controls.
- [x] 2.5 Add a clean `getEditableBlockMarkdown()` read boundary for the inline editor so Kramdown IAL/block IDs are not shown in target textareas.

## 3. Review Surface Integration

- [x] 3.1 Add `ReviewView` tests proving the visible edit button opens the inline panel when targets exist and shows an unavailable message when no targets exist.
- [x] 3.2 Add keyboard tests proving `e` opens the inline editor outside text input and does not fire while typing.
- [x] 3.3 Replace `LargeTextEditorDialog` usage for review content editing with the inline panel; keep SRS editor dialog behavior unchanged.
- [x] 3.4 Update More menu `edit-current-content` to open the inline panel and use target-aware availability.
- [x] 3.5 Add review editor state wiring for inline Markdown editing so ReviewView can observe open/closed edit state.
- [x] 3.6 Move the visible edit affordance into the Review header toolbar as an icon-only button with tooltip/aria text.
- [x] 3.7 Keep the header edit button visible while inline editing, mark it active/pressed, and make repeat activation a no-op.

## 4. Review Action Protection

- [x] 4.1 Add tests proving reveal, grade, skip, back, and unmodified review hotkeys do not advance or mutate the review session while the inline editor is open.
- [x] 4.2 Disable or ignore ReviewActions controls while the inline editor is open while keeping Save and Cancel usable.
- [x] 4.3 Ensure review actions and hotkeys resume normal behavior after Save or Cancel closes the inline editor.

## 5. Cleanup And Validation

- [x] 5.1 Remove obsolete single-source modal runtime code or reduce it to shared helpers if still needed by the inline runtime.
- [x] 5.2 Update existing ReviewContent, ReviewView more-menu, source-refresh, and editor-state tests from `getEditableSource()` expectations to `getEditableTargets()` expectations.
- [x] 5.3 Update `docs/DDD_RESCAN_BACKLOG.md` with any Review-slice debt fixed or intentionally deferred by the implementation.
- [x] 5.4 Run focused Vitest for ReviewContent target resolution, inline editor runtime, ReviewView menu/button/keyboard behavior, and action protection.
- [x] 5.5 Run `openspec validate inline-review-editable-targets --strict`.
- [x] 5.6 Run `pnpm run check:boundaries` or `node scripts/check-hidden-fallbacks.cjs`, then `pnpm build`.
