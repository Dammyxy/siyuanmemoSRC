## 1. Scope And Shared Editor Contract

- [x] 1.1 Add tests or characterization coverage for existing `SrsEditorDialog` card type, render target, priority, schedule, suspend, reset, and protected semantic overwrite behavior that must be preserved inline.
- [x] 1.2 Add card editor transition tests proving card type changes apply compatible render family metadata and keep render/direction synchronized.
- [x] 1.3 Add render-direction transition tests proving `applyRenderTargetTransition` synchronizes `renderProfile`, `typeMarker`, `templateID`, and compatible `faceKey` / `meta.faceKey` identity when switching concept-definition or descriptor direction.
- [x] 1.4 Identify the smallest shared SRS/card editor body extraction needed for dialog and inline Review usage without duplicating `CardEditorApplicationService` calls.
- [x] 1.5 Define inline card editor state in Review: open/closed, source draft dirty state, metadata loading state, and close behavior.

## 2. Preview Hidden Editing Mode

- [x] 2.1 Add `ReviewView` tests proving opening edit mode hides rendered `ReviewContent` preview and shows the inline card editor surface.
- [x] 2.2 Add tests proving Cancel restores preview without source writes and Save refreshes preview once after closing.
- [x] 2.3 Implement preview hiding while inline card editor mode is open, keeping Review header visible and edit action active.

## 3. Inline Source Editing Preservation

- [x] 3.1 Preserve existing editable-target Markdown load/save tests under the new full card editor surface.
- [x] 3.2 Preserve dirty-target only save, source-refresh suppression, save failure retention, and repeat edit no-op behavior.
- [x] 3.3 Keep unsupported source targets editable as whole-block Markdown fallback.

## 4. Inline Card Metadata Editing

- [x] 4.1 Add tests proving inline card editor can load current card metadata through existing card editor service contracts.
- [x] 4.2 Add tests proving card type changes drive render-family updates and reuse existing protected semantic overwrite confirmation behavior.
- [x] 4.3 Add tests proving direction changes update actual Review renderer direction and render cache identity when `faceKey.ruleId` and legacy `typeMarker` initially disagree.
- [x] 4.4 Add tests proving priority, schedule, suspend, and reset controls behave consistently with the existing SRS editor where included in the first inline version.
- [x] 4.5 Implement inline card metadata controls by reusing/extracting existing SRS editor body logic instead of creating a second metadata mutation path.

## 5. Review Action Protection And UX Polish

- [x] 5.1 Add tests proving reveal, grade, skip, back, and review hotkeys remain blocked while full inline card editor mode is open.
- [x] 5.2 Keep editor controls scroll-bounded, compact, and SiYuan-native; avoid nested cards and duplicate preview content.
- [x] 5.3 Keep header edit button visible and active while editor mode is open.

## 6. Cleanup And Validation

- [x] 6.1 Remove or adapt obsolete source-only inline panel/runtime code after the full inline card editor owns the Review edit path.
- [x] 6.2 Update `docs/DDD_RESCAN_BACKLOG.md` with Review/SRS editor debt fixed or intentionally deferred.
- [x] 6.3 Run focused Vitest for ReviewView editor mode, source editing runtime, SRS editor shared body, and Review action protection.
- [x] 6.4 Run `openspec validate review-inline-card-editor-mvp --strict`.
- [x] 6.5 Run `git diff --check`, `pnpm run check:boundaries`, and `pnpm build`.
