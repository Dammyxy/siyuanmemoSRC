## 1. Characterization

- [x] 1.1 Add `TopicDerivedItemService` regression proving derived child docs do not receive `custom-fsrs-reading-creation-rule-id` or `custom-fsrs-reading-answer-fingerprint` attrs.
- [x] 1.2 Add backend-command regression for the logged failure shape: Topic-derived command must not fail through nested `PROGRESSIVE_COMMAND_UNAVAILABLE` when child doc creation is otherwise valid.
- [x] 1.3 Add source eligibility tests for Topic source allowed, plain block under Topic allowed, and Item / Descriptor / Concept / cloze / unknown flashcard source rejected.
- [x] 1.4 Add handler/service tests for manual selection mark failure still creating the Item and reporting source mark failure.
- [x] 1.5 Add handler/service tests for newly applied mark rollback on Item creation failure and no rollback for pre-existing marks.
- [x] 1.6 Add current-block multi-mark test proving one source block is converted through one batched Topic-derived request.

## 2. Source Eligibility

- [x] 2.1 Add a role-aware Topic-derived source eligibility helper in the Progressive / Topic-derived slice.
- [x] 2.2 Teach the helper to inspect local card roles from `CardApplicationService` / source context without treating Topic-container ancestry alone as sufficient.
- [x] 2.3 Integrate eligibility into `SelectionTopicContinuationService.prepareSelection()` and `prepareCurrentBlockMarks()`.
- [x] 2.4 Integrate eligibility into AutoCard topic-derived execution so transaction-derived candidates obey the same default-reject policy.
- [x] 2.5 Surface clear rejection messages for default-rejected source roles.

## 3. Creation Chain

- [x] 3.1 Remove `ATTR_PROGRESSIVE_CREATION_RULE_ID` and `ATTR_PROGRESSIVE_ANSWER_FINGERPRINT` from child document attr writes in `TopicDerivedItemService`.
- [x] 3.2 Keep creation rule id and answer fingerprint in card `progressiveLineage` / metadata and keep dedupe loading from card lineage.
- [x] 3.3 Ensure `TopicDerivedItemService.executeFromBackend()` creates child docs through local Progressive child-doc behavior instead of a nested Progressive command facade.
- [x] 3.4 Consolidate right-click, hotkey selection, excerpt-derived, and current-block mark paths so they all call the same Topic-derived Item service method.
- [x] 3.5 Batch current-block mark candidates into one Topic-derived creation request while preserving per-candidate created/skipped accounting.

## 4. Mark Semantics

- [x] 4.1 Change manual selection Item creation so source mark apply failure is recorded as a diagnostic instead of aborting Item creation.
- [x] 4.2 Show success-with-warning copy when Item creation succeeds but source mark persistence failed.
- [x] 4.3 Keep rollback of newly applied marks when Item creation fails after mark persistence.
- [x] 4.4 Preserve pre-existing marks when Item creation fails.
- [x] 4.5 Keep AutoCard mark-mutation suppression scoped to programmatic marks and compatible with the new success-with-warning path.

## 5. Documentation And Validation

- [x] 5.1 Update `ARCHITECTURE.md` for Topic-derived Item ownership, source eligibility, and child-doc command ownership.
- [x] 5.2 Update `docs/DDD_RESCAN_BACKLOG.md` with touched slice, debt fixed, deferred debt, and validation.
- [x] 5.3 Run focused tests: `TopicDerivedItemService`, `SelectionTopicContinuationService`, `ProgressiveExcerptHotkeyHandler`, `BlockMenuHandler.progressive-excerpt`, and `AutoCardHandler.topic-derivation`.
- [x] 5.4 Run `openspec validate stabilize-topic-derived-item-creation --strict`.
- [x] 5.5 Run `node scripts/check-hidden-fallbacks.cjs`, `pnpm run check:boundaries`, `git diff --check`, and `pnpm build`.
