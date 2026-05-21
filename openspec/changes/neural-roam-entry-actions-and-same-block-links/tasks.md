## 1. Shared Entry Action Service

- [x] 1.1 Add `NeuralRoamEntryActionService` and typed command/result contracts for station actions, concept actions, temporary roam starts, and immediate roam starts.
- [x] 1.2 Move the existing block-menu concept-card creation/add-to-queue/immediate-roam orchestration behind the service without changing user-visible block-menu behavior.
- [x] 1.3 Update `BlockMenuHandler` to call the service for `制作为概念卡并加入队列` and `制作为概念卡并立即漫游`, including high-priority queue insertion semantics.
- [x] 1.4 Ensure immediate concept roam opens NeuralRoam with an explicit `focusBlockId`, `includeFocusAsFirst: true`, and `startNewSession: true` instead of relying on stale queue focus state.
- [x] 1.5 Register the service through the existing application/context wiring so review UI and block menu share the same implementation path.

## 2. NeuralRoam Entry Session Runtime

- [x] 2.1 Extend NeuralRoam open/start parameters to carry `seedBlockId`, optional `sourceReviewCardId`, optional `conceptBlockId`, `includeFocusAsFirst`, `startNewSession`, and entry-session kind.
- [x] 2.2 Implement temporary roam start so `从当前块临时漫游` uses the current block as the graph seed while keeping the current review card as the first displayed card when a `sourceReviewCardId` is present.
- [x] 2.3 Implement `从概念临时漫游` so descriptor/related cards resolve selectable concept targets, start from the selected concept block/card, and do not show the descriptor card as the first NeuralRoam card.
- [x] 2.4 Force `orbit` mode for temporary entries and restore the previous tab-local engine mode on tab close unless the user manually changes the NeuralRoam engine in that tab.
- [x] 2.5 Force `orbit` mode for establish-and-roam and concept-card-and-roam actions without restoring the previous mode.
- [ ] 2.6 Guard missing `blockId` and virtual/legacy card cases so NeuralRoam entry actions are hidden or rejected with a typed result instead of starting an invalid roam.

## 3. Review UI Menu

- [ ] 3.1 Add one icon-only NeuralRoam toolbar/menu trigger to review cards, with route-style icon and tooltip `神经漫游`.
- [ ] 3.2 Build a two-level menu with groups `临时漫游`, `建立并漫游`, and `建立`, hiding unavailable actions and empty groups.
- [ ] 3.3 Show concept-card actions for existing concept cards without duplicate `从当前块临时漫游` entries.
- [ ] 3.4 Show CDF descriptor/related-card concept temporary roam actions only when concept targets can be resolved; show a concept-target submenu when multiple concept targets exist.
- [ ] 3.5 Show ordinary block/station actions for non-concept review cards: `建立为空间站`, `建立为空间站并立即漫游`, and valid concept creation actions.
- [ ] 3.6 Wire review UI actions to `NeuralRoamEntryActionService` and keep toast/message rendering in the UI caller rather than inside the service.

## 4. Station And Queue Semantics

- [ ] 4.1 Implement `建立为空间站` as a no-navigation, no-engine-switch action that records the ordinary block as a station/activation source.
- [ ] 4.2 Implement `建立为空间站并立即漫游` as station creation plus a new NeuralRoam session focused on that block in `orbit` mode.
- [ ] 4.3 Keep `制作为概念卡` separate from `制作为概念卡并加入队列`; concept creation alone must not imply joining the NeuralRoam queue/source pool.
- [ ] 4.4 Implement `加入神经漫游队列` for existing concept cards/sources without creating a duplicate concept card.
- [ ] 4.5 Preserve the existing short menu label `制作为概念卡并加入队列` while using NeuralRoam-specific wording in result/toast text where needed.

## 5. Same-Block Multi-Card Links

- [ ] 5.1 Add a same-block card relationship source to NeuralRoam expansion using block id as the node identity and card id as display/feedback identity.
- [ ] 5.2 Resolve same-block card candidates from the local card universe through `UnifiedDataSourceManager.getCards({ blockIds })` or the active local data source, without querying Riff or `fsrs_cards`.
- [ ] 5.3 Include all reviewable same-block card types and sort candidates with due cards ahead of non-due cards.
- [ ] 5.4 Limit same-block expansion to at most one sibling card per expansion cycle.
- [ ] 5.5 Rank same-block candidates above normal graph neighbors but below explicit entry first-screen cards.
- [ ] 5.6 Exclude the current/source card id from same-block candidates so the first next-card choice does not immediately repeat the entry card.
- [ ] 5.7 Apply two-layer dedupe: graph traversal by `blockId`, card candidate selection by `cardId`.

## 6. History, Trace, And Diagnostics

- [ ] 6.1 Extend NeuralRoam history entries to store `nodeId = blockId` plus optional `cardId` for same-block multi-card visits.
- [ ] 6.2 Add activation trace metadata for same-block relationships with association type `same-block-card`, label `同块卡片`, and compact badge `同块`.
- [ ] 6.3 Ensure feedback/rating writes to the displayed card id while graph progression continues from the block id.
- [ ] 6.4 Add focused diagnostics for entry-session parameters and same-block candidate selection without logging full card payloads.

## 7. Tests And Validation

- [ ] 7.1 Add unit tests for `NeuralRoamEntryActionService` covering concept creation, queue insertion, station creation, immediate roam focus, and typed failure results.
- [ ] 7.2 Add review UI tests for menu visibility, group hiding, concept-target submenu behavior, and missing-block guards.
- [ ] 7.3 Add block menu regression tests proving the existing concept action labels and high-priority immediate-roam semantics are preserved through the shared service.
- [ ] 7.4 Add NeuralRoam runtime tests for temporary orbit mode, tab-local engine restore, manual engine-switch override, and explicit first-card behavior.
- [ ] 7.5 Add queue/graph tests for same-block candidates, due-first sorting, one-sibling limit, current-card exclusion, ranking, history card id, and trace labels.
- [ ] 7.6 Run targeted NeuralRoam and review-entry tests.
- [ ] 7.7 Run `node scripts/check-hidden-fallbacks.cjs`, `node scripts/check-srs-runtime-hygiene.cjs --dist`, `pnpm run check:boundaries`, and `pnpm build`.
