## 1. Source Edit Entry And Availability

- [x] 1.1 Rename review edit affordance copy, labels, tooltips, and menu text to source editing
- [x] 1.2 Keep the review header edit action visible when editing is unavailable and surface renderer-specific unavailable reasons
- [x] 1.3 Ensure the `e` shortcut opens the inline source editor only outside text input and respects unavailable reasons
- [x] 1.4 Show active or pressed state on the header edit action while the inline editor is open without discarding drafts

## 2. Editable Target Modeling

- [x] 2.1 Extend `EditableTarget` modeling to distinguish Markdown block targets from concept-card reference targets
- [x] 2.2 Filter dependency-only blocks out of editable Markdown targets for custom-rendered cards
- [x] 2.3 Expose concept-definition definition text as editable source and concept as a reference selector
- [x] 2.4 Expose descriptor cue or answer source as editable source and concept as a reference selector
- [x] 2.5 Keep image-occlusion, HTML-only, empty, and unsupported renderers unavailable with explicit reasons

## 3. Structured Field Editor Behavior

- [ ] 3.1 Build safe structured field models for recognized quick question and answer source grammar
- [ ] 3.2 Build safe structured field models for list-template current-item cue and answer only
- [x] 3.3 Build safe structured field models for concept-definition definition text while keeping relation direction and kind read-only
- [x] 3.4 Build safe structured field models for descriptor cue and answer while keeping relation direction and kind read-only
- [ ] 3.5 Force multi-cloze source editing to raw Markdown in this change
- [ ] 3.6 Fall back to raw Markdown with warning when parser or rewrite safety cannot be proven

## 4. Answer Reveal And Dirty Exit Guards

- [x] 4.1 Hide answer-side fields while the current card is unrevealed
- [x] 4.2 Add explicit confirmation that reveals the current card before exposing answer-side edits
- [ ] 4.3 Add one Save, Discard, Cancel dirty-exit guard for closing the editor, leaving review, or navigating cards
- [ ] 4.4 Keep reveal, grade, skip, back, and review hotkeys disabled or ignored while the inline editor is open

## 5. Save, Conflict, And Partial Failure Flow

- [x] 5.1 Load editable Markdown through `ReviewApplicationService.getEditableBlockMarkdown`
- [x] 5.2 Save only dirty Markdown targets through `ReviewApplicationService.updateBlockMarkdown`
- [x] 5.3 Preserve per-target original/current values and skip service writes for no-op saves
- [x] 5.4 Report partial saves exactly, keeping successful writes saved and failed targets open with errors
- [x] 5.5 Apply field-level merge where structured fields allow it and use whole-block conflict handling for raw Markdown

## 6. Concept Reference Reassignment

- [x] 6.1 Add concept-card selector flow for concept-definition and descriptor concept reference targets
- [x] 6.2 Default concept reference changes to the current relation or card only
- [x] 6.3 Require secondary explicit confirmation before applying concept changes to same-source related relations
- [x] 6.4 Route confirmed concept relation edits through existing CDF preview and write-repair flow

## 7. Session Refresh And Invalid-Card Impact

- [ ] 7.1 Refresh the current visible renderer once after successful save handling completes
- [ ] 7.2 Refresh same-session same-source snapshots after ordinary custom-rendered source edits without schedule changes
- [ ] 7.3 Warn without rollback when same-session snapshot refresh fails after source write success
- [ ] 7.4 Re-evaluate the current card after save and keep it visible when still reviewable
- [ ] 7.5 Remove newly invalid cards from the current session without scoring and advance when possible
- [ ] 7.6 Route invalid CDF relation cards to existing `cdf-abnormal` diagnostics and keep non-CDF invalid removals session-local

## 8. Tests And Validation

- [x] 8.1 Add ReviewContent editable-target tests for quick, list-template, multi-cloze, concept-definition, descriptor, image-occlusion, and dependency-only blocks
- [x] 8.2 Add inline editor runtime tests for dirty-only writes, no-op saves, partial failures, raw Markdown fallback, and conflict handling
- [x] 8.3 Add ReviewView interaction tests for toolbar entry, `e` shortcut, active edit state, unavailable reasons, dirty exit, and paused review actions
- [x] 8.4 Add answer reveal protection tests for unrevealed answer-side field access
- [x] 8.5 Add CDF relation edit tests for concept selector default scope, batch confirmation, preview, repair, and `cdf-abnormal` routing
- [ ] 8.6 Add session impact tests for same-source refresh, refresh failure warnings, invalid post-save removal, and no SRS schedule mutation
- [x] 8.7 Run focused test suites, boundary checks, hidden-fallback check, and production build for the touched Review slice
