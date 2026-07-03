## Context

Review v2 already has an inline multi-target editor driven by `ReviewContent.getEditableTargets()`, `ReviewView`, and `ReviewApplicationService.getEditableBlockMarkdown/updateBlockMarkdown`. That MVP edits whole Markdown blocks and already pauses review advancement while the editor is open. The next step is to make the feature product-safe for review-time repair of custom-rendered cards: fields where stable, raw Markdown where not, honest answer reveal behavior, concept references as relation targets, and safe session impact after saves.

The active slice is Review UI plus Review application service boundaries. The design must keep ownership in `ui -> application -> core -> infrastructure`, reuse existing CDF live relation repair for relation cards, and avoid adding fallback paths that hide unsafe parsing or write failures.

## Goals / Non-Goals

**Goals:**

- Make "edit source content" a clear review-time repair workflow, not a card design studio.
- Keep custom renderer behavior explicit by renderer family.
- Add structured field editing for safe sources while preserving raw Markdown as a visible fallback.
- Treat concept fields as concept-card reference changes, not document-body edits.
- Preserve review integrity by protecting answer-side content until reveal/confirmation.
- Keep source writes, same-session refresh, and CDF relation repair outcomes honest.

**Non-Goals:**

- No WYSIWYG editing inside custom-rendered card bodies.
- No first-pass cloze-field rewrite for multi-cloze cards.
- No review-time image occlusion editor.
- No automatic SRS reset or schedule mutation after content edits.
- No default batch concept reassignment across all same-source cards.
- No new abnormal-card system for CDF cases; use existing `cdf-abnormal`.

## Decisions

1. **Primary contract is source editing, not card editing.**
   - Decision: label the affordance as editing source content and keep saves routed through the review block Markdown boundary.
   - Rationale: the existing implementation and source-of-truth model already write source blocks; promising WYSIWYG would require a separate renderer-specific editor system.
   - Alternative considered: call it card editing and hide source details. Rejected because it overpromises structure editing, relation editing, and card metadata editing.

2. **Structured fields are an enhancement, not a replacement for source Markdown.**
   - Decision: build structured models only when grammar is safe; otherwise show raw Markdown with a warning.
   - Rationale: review-time repair should not block on parser gaps, but must not silently perform unsafe field rewrites.
   - Alternative considered: require all custom renderers to field-edit. Rejected because multi-cloze and ambiguous quick cards are not yet safe.

3. **Concept is a relation target.**
   - Decision: for concept-definition and descriptor cards, concept is selected/reassigned through a concept-card chooser; the editor does not edit the concept document block body as the concept field.
   - Rationale: users want to change which concept card a definition/descriptor belongs to, not edit the content of the concept document while reviewing.
   - Alternative considered: keep exposing concept block Markdown as an editable target. Rejected because it confuses "change reference" with "edit document contents".

4. **Answer-side fields require reveal honesty.**
   - Decision: hide answer-side fields while unrevealed; if the user explicitly edits answer-side content, reveal the card first.
   - Rationale: editing an answer is equivalent to seeing the answer in a review session.
   - Alternative considered: always show all fields. Rejected because it bypasses review state.

5. **Save keeps the current card unless validation says it is no longer reviewable.**
   - Decision: save refreshes in place, does not score, and does not reset progress. If post-save validation invalidates the current card, remove it from the session without scoring.
   - Rationale: editing is not a review answer; invalid cards should not remain as broken review prompts.
   - Alternative considered: automatically advance after every save. Rejected because users need to inspect the result.

6. **Ordinary same-source refresh is session-local; CDF changes use relation repair.**
   - Decision: ordinary quick/list/multi-cloze edits refresh visible and same-session same-source snapshots without schedule impact. CDF relation cards use existing write-repair preview/apply.
   - Rationale: content freshness and relation correctness have different authority and blast radius.
   - Alternative considered: run broad rebuilds for every custom renderer save. Rejected because a typo fix should not trigger global queue changes.

## Risks / Trade-offs

- **Concept selector can become too broad** -> Start with current relation as default and require explicit confirmation for same-source batch application.
- **Field parser gaps may confuse users** -> Display a raw Markdown fallback warning and keep save behavior explicit.
- **Partial saves can leave mixed source state** -> Report partial success, keep failed targets open, and do not rollback successful source writes.
- **Same-session snapshot refresh can fail after source write** -> Preserve the source write and warn; force later cards to reload from source where possible.
- **Dirty-exit prompts can interrupt review flow** -> Use one consistent save/discard/cancel guard for editor close, review close, and card navigation.
- **Invalid-card routing may conflate CDF and non-CDF errors** -> Route only CDF relation issues to `cdf-abnormal`; keep non-CDF removals as review-session diagnostics.
