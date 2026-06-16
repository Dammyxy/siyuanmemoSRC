## Context

SiYuanMemo already uses a SuperMemo-like Topic -> derived Item model, but the active path is fragile in SiYuan because a block can be both reading material and a flashcard. The current path resolves Topic context, optionally applies a native `mark`, calls `SelectionTopicContinuationService`, and then calls `TopicDerivedItemService` to create a child document block and Item card.

The runtime log shows the immediate failure mode:

`TOPIC_DERIVED_COMMAND_UNAVAILABLE: PROGRESSIVE_COMMAND_UNAVAILABLE: BLOCK_ATTR_WRITE_FORBIDDEN: custom-fsrs-reading-creation-rule-id (large-or-high-churn-payload)`

The code already persists `creationRuleId` and `answerFingerprint` on card `progressiveLineage`, but also sends them as child document attrs. That makes command execution depend on attrs that the block attr policy correctly rejects as high-churn payload. RemNote's Incremental Everything plugin solves a related split by putting ordinary Rem into an Incremental powerup queue, while extracted highlights become child Rem. SiYuanMemo will not copy that model directly because SiYuan push/review integration still needs flashcards; instead, Topic/readable source cards stay reviewable and derived Items become child document-block flashcards.

## Goals / Non-Goals

**Goals:**
- Preserve the original Topic/source card when deriving Items.
- Make Topic-derived creation role-aware: allow Topic/reading/source roles and default-reject Item, Descriptor, Concept, cloze, or unknown flashcard roles.
- Share one creation chain for selection-derived Items, excerpt-derived Items, right-click Item creation, and current-block mark backfill.
- Decouple source `mark` persistence from Item creation success.
- Keep creation rule and answer fingerprint in card metadata / `progressiveLineage`, not block attrs.
- Avoid nested backend command facades inside Topic-derived backend execution.
- Reduce current-block multi-mark fan-out to one batched candidate path.

**Non-Goals:**
- Do not make arbitrary non-card Siyuan blocks enter the SiYuanMemo review queue in this change.
- Do not redesign scheduler algorithms, queue sorting, or Topic review semantics.
- Do not add fallback/degrade behavior when the command owner is unavailable.
- Do not change kernel companion, writer lease, AI workbench, or Xiuyuan sync ownership outside touched contracts.
- Do not migrate old block attrs beyond stopping new forbidden writes and tolerating old reads where already supported.

## Decisions

1. Keep option A: Topic/source remains a card; derived Items are child document-block cards.
   - Rationale: matches SuperMemo's source-preserving flow while respecting SiYuan/Riff's flashcard split.
   - Alternative rejected: allow non-card blocks into the plugin queue. That would bypass existing Riff/card contracts and require a wider queue model change.

2. Introduce a role-aware source eligibility decision in the Progressive / Topic-derived slice.
   - Eligible: Topic card, reading/source card, excerpt source, Topic document root, and plain source block under an eligible Topic context.
   - Rejected by default: Item, Descriptor, Concept, derived Item, cloze card, and unknown existing flashcard role.
   - Rationale: the current Topic-context check is too coarse; being inside a Topic container is not enough when the selected block is itself already a non-Topic card.

3. Make `TopicDerivedItemService` the command-owned creation chain for all Item derivation entrypoints.
   - Selection/right-click and current-block mark backfill still prepare input in `SelectionTopicContinuationService`, but candidate creation and child card creation converge in `TopicDerivedItemService`.
   - Rationale: one path keeps dedupe, lineage, rollback, Riff registration, and backend authority consistent.

4. Native `mark` is evidence, not authority.
   - Manual selection can derive an Item from prepared selection content even if applying the visual mark fails.
   - If mark succeeds and Item creation later fails, rollback the mark when it was newly applied.
   - Rationale: the Item command owns card creation; source decoration must not become the primary state machine.

5. Remove high-churn derivation identity from block attrs.
   - Child doc attrs keep stable source metadata only: kind, source doc/block, parent Topic/excerpt, and storage mode.
   - `creationRuleId` and `answerFingerprint` remain in `progressiveLineage` / card metadata and are loaded for dedupe from card state.
   - Rationale: block attr policy rejects high-churn payloads by design; duplicating lineage into attrs creates runtime failure.

6. Use local child-doc operations inside backend-owned Topic-derived execution.
   - When `TopicDerivedItemService.executeFromBackend()` runs, it must not call `ProgressiveReadingService.createChildDocFromSource()` if that method can re-enter `executeProgressiveCommandFacade`.
   - Use a local child-doc helper or an injected child-doc port that binds to local Progressive methods under the same backend owner.
   - Rationale: nested command facades turn a valid Topic-derived command into `PROGRESSIVE_COMMAND_UNAVAILABLE`.

7. Batch current-block mark candidates.
   - Build all current-block mark candidates first, then submit one Topic-derived command with multiple candidates.
   - Rationale: avoids N command submissions, N source context resolutions, and N backend relay round trips for one block.

## Risks / Trade-offs

- Risk: eligibility can reject a user-expected nested Item. Mitigation: default-reject is intentional; include clear UI message and tests for Item/Descriptor/Concept rejection.
- Risk: mark failure success message can feel surprising. Mitigation: show explicit "Item created, source mark failed" copy and keep derived Item lineage intact.
- Risk: removing attr writes could hide useful debugging info from block attrs. Mitigation: keep lineage on the card and log candidate diagnostics without attrs.
- Risk: old derived docs may still contain old attrs. Mitigation: stop new writes; keep old read tolerance if existing code already reads legacy attrs.
- Risk: batching current-block marks changes error granularity. Mitigation: return per-candidate created/skipped results and preserve existing all-or-error rollback semantics for document/card creation.

## Migration Plan

1. Add characterization tests for the log failure and current selection/right-click behavior.
2. Add role-aware eligibility and route all entrypoints through it.
3. Remove forbidden child-doc attr writes for creation rule and answer fingerprint.
4. Ensure backend Topic-derived execution uses local child-doc operations.
5. Add non-blocking mark failure and mark rollback behavior.
6. Batch current-block mark candidates.
7. Update architecture/backlog docs and run focused validation.

Rollback strategy: revert this change's Topic-derived slice commits. No persistent schema migration is required because new lineage continues to live in card metadata and old block attrs are not deleted by this change.

## Open Questions

None. Default policy is reject derivation from existing Item/Descriptor/Concept/cloze/unknown flashcard roles.
