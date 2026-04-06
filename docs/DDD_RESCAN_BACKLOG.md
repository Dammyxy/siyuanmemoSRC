# DDD Re-Scan Backlog

Last update: 2026-04-06 (Round 42)

## 0. Task Deltas (newest first)

Use this section for task-level debt tracking when a task touches production code under `src/`.
Do not add an entry for skill-only or docs-only work.

### 2026-04-06 - filter-group queue sync, unlocked review editor, and strict-card neural roam reviews

- Task: Fix filter-group review-scope confirmation so the browser immediately reapplies the new filter without a manual toolbar refresh, remove the review main-Protyle auto-lock/read-only lifecycle, and restore neural roam exact flashcard resolution plus formal SRS writeback only for roam nodes backed by real flashcards.
- Touched slice: Filter queue signaling in `src/core/queue/domain/{BaseReviewQueue,FilterGroupQueue}.ts`, browser queue sync in `src/ui/browser/SRSBrowser.vue` and `src/ui/browser/composables/useBrowserAdapterSync.ts`, review editor behavior in `src/ui/review/v2/ReviewContent.vue`, neural query/queue logic in `src/core/queue/neural/ConceptQueryEngine.ts` and `src/core/queue/domain/NeuralRoamQueue.ts`, shared event typing in `src/types/unified-data-source.ts`, and targeted regression tests around those active paths.
- Debt fixed now: Added one narrow `requiresFullRefresh` queue-change hint instead of wiring the review dialog directly to browser refresh controls, removed the stale main-Protyle read-only plus double-click unlock path from the active review renderer, and stopped neural roam from collapsing exact paragraph flashcards into wrapper list items while reusing the existing scheduler path only when the roam node resolves to a real local flashcard.
- Debt deferred: The browser queue-change bus still uses one generic event shape instead of a richer taxonomy of queue mutation reasons, and neural roam still relies on best-effort SQL descendant resolution/candidate normalization rather than a dedicated persisted relation index for exact flashcard neighbors.
- Why deferred: A broader event taxonomy or a graph/index redesign would widen this targeted active-path repair across multiple bounded contexts beyond the three concrete regressions fixed here.
- Next safe step: If more queue surfaces need differentiated reload semantics or if neural-roam relation precision keeps surfacing as a recurring issue, extract the new full-refresh hint and exact-flashcard resolution rules into explicit queue and graph contracts instead of extending ad hoc event metadata further.
- Validation: `pnpm vitest run src/ui/browser/composables/__tests__/useBrowserAdapterSync.test.ts src/core/queue/domain/__tests__/FilterGroupQueue.session-transfer.spec.ts src/ui/review/v2/__tests__/ReviewContent.editor-state.spec.ts src/core/queue/neural/__tests__/ConceptQueryEngine.backlinks.test.ts src/core/queue/domain/__tests__/NeuralRoamQueue.test.ts`; `pnpm build`.

### 2026-04-06 - xiuyuan multi-card creation now emits CardCreated for doc-scope queue sync

- Task: Fix document-block/doc-tree filtered review so new item cards created through multi-cloze, formula-cloze, and other Xiuyuan multi-card creation flows immediately join the active doc-scope review queue instead of only appearing later in the browser.
- Touched slice: Xiuyuan creation finalization in `src/application/usecases/xiuyuan/shared/FinalizeXiuyuanCreation.ts`, multi-card use cases in `src/application/usecases/xiuyuan/{CreateXiuyuanFromBlocksUseCase,CreateListTemplateCardsUseCase,CreateConceptDescriptorCardsUseCase,CreateConceptDescriptorAutoUseCase,RebindDescriptorConceptUseCase}.ts`, concept-card shared resolution in `src/application/usecases/xiuyuan/shared/ConceptCardResolver.ts`, Xiuyuan app-service wiring in `src/application/services/XiuyuanApplicationService.ts`, composition in `src/application/ApplicationContext.ts`, and targeted Xiuyuan/review sync regression tests.
- Debt fixed now: Unified the shared Xiuyuan finalizer with the same post-save domain-event publication contract used by single-card creation, so every card created through `finalizeXiuyuanCreation()` now emits `CardCreated` after persistence and automatically reuses the existing `ReviewScopeCardCreationSyncService -> UnifiedDataSourceManager -> ReviewView` enqueue chain.
- Debt deferred: Post-save domain-event publication still does not have a compensating rollback path if event delivery fails after Xiuyuan persistence has already succeeded, and this task deliberately did not add a second UI-side/manual notification fallback.
- Why deferred: Adding rollback or a redundant fallback bus would widen this targeted active-path fix into a broader reliability design decision around Xiuyuan persistence semantics and duplicate event suppression.
- Next safe step: If event-delivery failures become observable in production, add one focused follow-up that records failed post-save Xiuyuan card events for retry or operator diagnostics instead of branching the UI onto a second notification path.
- Validation: `pnpm vitest run src/application/usecases/xiuyuan/__tests__/CreateXiuyuanFromBlocksUseCase.events.test.ts src/application/usecases/xiuyuan/__tests__/CreateListTemplateCardsUseCase.split-v2.test.ts src/application/usecases/xiuyuan/__tests__/CreateConceptDescriptorCardsUseCase.test.ts src/application/services/__tests__/ReviewScopeCardCreationSyncService.test.ts src/ui/review/v2/__tests__/ReviewView.doc-scope-card-created.spec.ts`; `pnpm build`.

### 2026-04-06 - review open-as preserves filtered queue transfer state

- Task: Fix document/doc-tree filtered review so opening the current review as a tab, right-side tab, or new window keeps the active filtered queue/session state instead of collapsing back to a plain retrieval or incremental queue after the source dialog clears the shared filter queue.
- Touched slice: Filter-backed review transfer types in `src/types/unified-data-source.ts`, filter queue snapshot/restore in `src/core/queue/domain/{BaseReviewQueue,FilterGroupQueue}.ts`, review tab serialization/restoration in `src/application/managers/TabManager.ts`, and active review transfer/session hydration in `src/ui/review/v2/{ReviewView.vue,useReviewSession.ts}` plus targeted tab/review/queue regression tests.
- Debt fixed now: Added an explicit serializable filter-group transfer state carrying filter scope, rollback queue state, and session counters; restored transferred review surfaces onto detached in-memory filter queues so dialog-close cleanup no longer wipes the new surface; and hydrated transferred review headers from existing session counters instead of restarting from zero.
- Debt deferred: Cross-surface transfer still does not preserve the `Back` undo stack, and the transfer path remains specific to filter-backed review sessions rather than becoming a generic queue snapshot protocol for every queue type.
- Why deferred: Carrying full undo history across surfaces would require broader lifecycle rules for answer rollback semantics, and generalizing the transfer contract across all queue types would widen this active-path fix beyond the document-scope filtered review bug.
- Next safe step: If more review surfaces need stateful handoff, extract the new filter-session transfer contract behind a queue-capability interface and define which queue-local histories are safe to serialize beyond counters plus remaining-order state.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/useReviewSession.spec.ts src/ui/review/v2/__tests__/ReviewView.open-as-menu.spec.ts src/ui/review/v2/__tests__/ReviewView.doc-scope-card-created.spec.ts src/application/managers/__tests__/TabManager.review-transfer.spec.ts src/application/managers/__tests__/TabManager.openReviewInNewWindow.spec.ts src/core/queue/domain/__tests__/FilterGroupQueue.session-transfer.spec.ts`; `pnpm build`.

### 2026-04-06 - doc-scope review sessions immediately absorb newly created item cards

- Task: Fix document/document-tree scoped review so item cards created while reviewing a topic immediately gain persisted `meta.rootId`, appear in the next doc-scope right-click review entry, and join the active review queue at the tail instead of only showing up in the browser.
- Touched slice: Doc-scope review entry routing in `src/application/managers/BlockMenuHandler.ts` and `src/application/entries/CoreReviewEntryService.ts`, filter-backed review dialog setup in `src/application/managers/DialogManager.ts`, doc-scope filtering in `src/types/unified-data-source.ts`, `src/application/queries/DataAccessFacade.ts`, and `src/core/card/domain/services/CardFilterService.ts`, card-created orchestration in the new `src/application/services/ReviewScopeCardCreationSyncService.ts` plus `src/application/ApplicationContext.ts` and `src/application/services/UnifiedDataSourceManager.ts`, and active review-session queue insertion in `src/ui/review/v2/ReviewView.vue` plus `src/application/adapters/UnifiedQueueStrategy.ts`.
- Debt fixed now: Replaced the old one-shot `blockIds` snapshot semantics with persistent `scopeDocIds` for doc-scope review sessions, eagerly persisted `meta.rootId` on `CardCreated` so doc-tree scope lookup no longer depends on browser-side lazy hydration, and added a tail-append path that keeps the current review pointer stable when new in-scope cards are created mid-session.
- Debt deferred: The new auto-enqueue path is intentionally limited to active doc-scope filtered review sessions and still skips excerpt Topic-card insertion conflicts by leaving the older progressive/excerpt-specific path in place; broader cross-queue auto-enqueue behavior is still undefined.
- Why deferred: Extending “new card auto-join” beyond doc-scope review would require product decisions about global queue semantics, duplicate suppression across different live session types, and whether non-item/topic creation flows should all share one insertion policy.
- Next safe step: If users want the same behavior outside doc/document-tree review, extract the new ReviewView doc-scope enqueue rules into a reusable session-level policy service and define explicit precedence between generic scope enqueue and progressive/excerpt-specific insertions.
- Validation: `pnpm vitest run src/application/entries/__tests__/CoreReviewEntryService.test.ts src/application/managers/__tests__/BlockMenuHandler.core-review-entry.test.ts src/application/managers/__tests__/DialogManager.review-header-variant.test.ts src/application/services/__tests__/UnifiedDataSourceManager.card-update-events.test.ts src/application/services/__tests__/ReviewScopeCardCreationSyncService.test.ts src/application/adapters/__tests__/UnifiedQueueStrategy.scope-append.spec.ts src/ui/review/v2/__tests__/ReviewView.doc-scope-card-created.spec.ts src/types/__tests__/unified-data-source.test.ts`; `pnpm build`.

### 2026-04-06 - progressive split performance and in-dialog progress feedback

- Task: Speed up document progressive split and add an in-dialog progress bar with staged progress reporting plus best-effort cancellation/cleanup so users can see what split is doing instead of waiting blindly.
- Touched slice: Progressive split execution in `src/application/services/ProgressiveReadingService.ts`, split dialog orchestration in `src/application/managers/DialogManager.ts`, the split dialog UI in `src/ui/progressive/ProgressiveSplitDialog.vue`, the shared dialog helper, progressive split i18n, and targeted service/manager/dialog regression tests.
- Debt fixed now: Replaced the old recursive `parent_id` block loading with one batched `root_id` scan plus in-memory tree construction, removed the eager per-piece `hpath` existence lookup from the hot path when Siyuan already returns a created doc ID, and stopped the dialog from going silent after confirm by wiring a single reactive running/cancelling progress state through the active split flow.
- Debt deferred: Best-effort cancellation still may leave partial split artifacts behind if Siyuan doc deletion or card deletion fails, and ordinary non-cancel split failures still do not run the same cleanup path yet.
- Why deferred: Full transactional rollback across Siyuan child-doc creation, block-attr writes, and card persistence would expand this bounded performance/UX pass into a higher-risk consistency project that needs separate failure-policy decisions.
- Next safe step: If partial artifacts after failures become a real user problem, add one focused follow-up that reuses the new cancellation cleanup tracker for non-cancel runtime exceptions and reports a structured post-failure cleanup summary.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/managers/__tests__/DialogManager.progressive-split.spec.ts src/application/managers/__tests__/BlockMenuHandler.progressive-split.test.ts src/ui/progressive/__tests__/ProgressiveSplitDialog.test.ts`; `pnpm build`.

### 2026-04-06 - progressive split dialog plus recursive heading-tree split

- Task: Add a SuperMemo-style marker-selection dialog before document progressive split, then replace the old flat piece generation with a recursive heading-tree split that creates true child-document hierarchies for selected heading levels while keeping the existing linear and nonlinear menu entries.
- Touched slice: Progressive reading split flow in `src/application/services/ProgressiveReadingService.ts`, dialog/menu orchestration in `src/application/managers/{DialogManager,BlockMenuHandler}.ts`, the new `src/ui/progressive/ProgressiveSplitDialog.vue`, progressive split i18n, and targeted manager/service regression tests.
- Debt fixed now: Removed the old hard-coded “all headings + hr” flat split policy from the active service path, centralized split validation/execution in one dialog-driven manager entrypoint, and changed split materialization/session ordering to respect recursive heading trees plus depth-first preorder activation.
- Debt deferred: The chosen split markers still apply only to the current run and are not persisted as per-user defaults or presets, and the dialog still only covers headings/hr/custom-string rather than broader SuperMemo marker families.
- Why deferred: Persisting defaults would expand this bounded split overhaul into settings/storage policy work, and adding more marker families needs separate SiYuan-specific semantics before it is safe to bake into the recursive split service.
- Next safe step: If users like this interaction, add one focused follow-up that remembers the last-used split config per client without changing the recursive service contract again.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/managers/__tests__/DialogManager.progressive-split.spec.ts src/application/managers/__tests__/BlockMenuHandler.progressive-split.test.ts`; `pnpm build`.

### 2026-04-06 - shorten new excerpt-doc titles for review readability

- Task: Reduce the visual footprint of new `Alt+X` excerpt Topic cards by shortening newly created excerpt child-document titles while keeping the excerpt body and document-card review path unchanged.
- Touched slice: Progressive reading excerpt creation in `src/application/services/ProgressiveReadingService.ts` plus progressive excerpt regression coverage in `src/application/services/__tests__/ProgressiveReadingService.test.ts`.
- Debt fixed now: Replaced the old long excerpt-doc preview title with a normalized short preview capped at about 12 characters, so new excerpt document Topic cards still keep `[摘录 NNN]` structure but no longer render oversized multi-line H1 titles in review.
- Debt deferred: Existing excerpt child docs keep their current long titles, and review rendering still treats excerpt docs like other document Topic cards instead of adding excerpt-specific display rules.
- Why deferred: Renaming historical child docs or adding a separate excerpt-only review render path would widen this targeted readability fix into data migration or UI policy work that is not necessary for the active-path problem.
- Next safe step: If short titles still feel visually heavy in review, add one focused follow-up to suppress or downsize titles only for `excerpt-doc` Topic cards without changing other document Topic behavior.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts`; `pnpm build`.

### 2026-04-05 - fix doc-tree child-path matching for right-click review counts

- Task: Restore document-block right-click review counts after the new doc-tree scope service started missing split piece and excerpt child docs because it matched descendants against `/doc.sy` instead of the real Siyuan child-doc directory prefix.
- Touched slice: Document-tree review scope in `src/application/services/DocTreeReviewScopeService.ts` plus recursive doc-scope regression coverage in `src/application/services/__tests__/DocTreeReviewScopeService.test.ts`.
- Debt fixed now: Replaced the incorrect `candidate.path.startsWith(current.path)` descendant check with a real child-doc prefix derived from the parent document path (`/doc/`), so physical-tree recursion now matches Siyuan's actual doc-path layout and parent doc review menus can see descendant piece/excerpt Topic cards again.
- Debt deferred: The doc-tree scope service still depends on one hydrated in-memory index instead of demand-loading paths per menu open, so index freshness remains the main operational invariant.
- Why deferred: Switching back to per-click SQL would recreate duplicated review-scope logic and undercut the single-source synchronous index we just established for doc menus.
- Next safe step: If users still report stale counts after large external tree mutations, add one focused freshness check around websocket-less move/rename flows before considering broader index invalidation changes.
- Validation: `pnpm vitest run src/application/services/__tests__/DocTreeReviewScopeService.test.ts src/application/managers/__tests__/BlockMenuHandler.doc-scope-concept-visibility.test.ts src/application/managers/__tests__/BlockMenuHandler.core-review-entry.test.ts`; `pnpm build`.

### 2026-04-05 - doc block menu recursive scope catches missing-root cards

- Task: Fix doc-block right-click review counts so ordinary flashcards plus split/excerpt child-doc Topic cards appear under parent document review menus even when stored cards lack `meta.rootId`.
- Touched slice: Block-menu review entry scope in `src/application/managers/BlockMenuHandler.ts` and synchronous document-tree/card-root indexing in `src/application/services/DocTreeReviewScopeService.ts`.
- Debt fixed now: Extended the doc-tree scope index to batch-resolve `blocks.root_id` for stored card block IDs, and routed `click-blockicon` document blocks through the same recursive doc-scope path as doctree/editor-title/breadcrumb menus instead of leaving them on subtree-only DOM collection.
- Debt deferred: Recursive doc-scope still depends on pre-hydrated in-memory indexes rather than a demand-loaded per-click SQL path, so startup/index freshness remains the main invariant to protect.
- Why deferred: Reintroducing ad hoc per-click SQL would recreate the old duplicated menu logic and pull the fix away from the new single-source doc-scope service.
- Next safe step: If users still find stale counts after heavy document-tree churn, add one focused integration check around websocket-less tree mutations before considering broader index invalidation changes.
- Validation: `pnpm vitest run src/application/managers/__tests__/BlockMenuHandler.doc-scope-concept-visibility.test.ts src/application/managers/__tests__/BlockMenuHandler.core-review-entry.test.ts src/application/services/__tests__/DocTreeReviewScopeService.test.ts src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts src/application/usecases/card/__tests__/CreateCardUseCase.test.ts`; `pnpm build`.

### 2026-04-05 - synchronous doc-tree review scope for block-menu review entrypoints

- Task: Fix doc-level SiYuanMemo block-menu review so parent documents can immediately see and open ordinary child-doc flashcards plus progressive split/excerpt Topic cards without relying on an async submenu mutation after the menu has already rendered.
- Touched slice: Doc-level review scope and menu construction in `src/application/managers/BlockMenuHandler.ts`, the new synchronous doc-tree index in `src/application/services/DocTreeReviewScopeService.ts`, startup wiring in `src/application/ApplicationContext.ts`, and progressive split/excerpt refresh hooks in `src/application/services/ProgressiveReadingService.ts`.
- Debt fixed now: Replaced the old “render current-doc menu first, then async splice submenu” path with one synchronous document-tree scope index hydrated before use, so doc-tree/editor-title/breadcrumb menus all build from the same recursive physical-tree snapshot and pass the same descendant card scope into review entry actions.
- Debt deferred: Document-tree freshness still depends on transaction websocket availability for automatic move/rename tracking; when that websocket path is disabled, the index still stays correct for startup and plugin-created split/excerpt docs but not every possible external document-tree mutation in real time.
- Why deferred: Broadening websocket lifecycle to be always-on regardless of incremental-sync settings would widen this fix into a larger infrastructure policy change; this task needed to stabilize the current doc-menu review path first.
- Next safe step: If users need move/rename-consistent doc-tree review even with incremental sync disabled, split out a follow-up that makes `TransactionWebSocketService` a first-class always-on infrastructure service with handler-level opt-in for each feature.
- Validation: `pnpm vitest run src/application/managers/__tests__/BlockMenuHandler.doc-scope-concept-visibility.test.ts src/application/managers/__tests__/BlockMenuHandler.core-review-entry.test.ts src/application/services/__tests__/DocTreeReviewScopeService.test.ts src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts src/application/usecases/card/__tests__/CreateCardUseCase.test.ts`; `pnpm build`.

### 2026-04-05 - block menu doc-tree recursive progressive review scope

- Task: Make doc-level SiYuanMemo block-menu review entries count split piece and excerpt Topic cards from descendant child docs, so progressive cards appear in document-tree recursive review just like SuperMemo-style material trees.
- Touched slice: Block-menu review scope in `src/application/managers/BlockMenuHandler.ts` plus doc-scope regression coverage in `src/application/managers/__tests__/BlockMenuHandler.doc-scope-concept-visibility.test.ts`.
- Debt fixed now: Replaced the old doc-root-only menu counting with a recursive document-tree scope keyed by current `box/path`, kept current-document DOM cards as a fallback for legacy cards that lack `rootId`, and left regular block subtree menus untouched so the change stays inside the doc-menu bounded context.
- Debt deferred: Doc-menu recursive counting still depends on an async SQL refresh after the top-level menu item is added, and breadcrumb/doc-tree/editor-title entrypoints still share this menu-refresh pattern rather than a more explicit precomputed document-scope cache.
- Why deferred: A dedicated document-scope cache or prefetch pipeline would widen the change beyond the active block-menu slice; the user-facing gap was specifically that progressive child-doc Topic cards were missing from doc-level review counts.
- Next safe step: If menu refresh latency becomes visible in real use, add one small document-scope cache keyed by doc id and invalidated when split/excerpt creation writes new child docs or Topic cards.
- Validation: `pnpm vitest run src/application/managers/__tests__/BlockMenuHandler.doc-scope-concept-visibility.test.ts src/application/managers/__tests__/BlockMenuHandler.core-review-entry.test.ts`; `pnpm build`.

### 2026-04-05 - optional Alt+X excerpts and minimized reading attrs

- Task: Make plugin-driven `Alt+X` excerpts opt-in by default, keep native Siyuan `Alt+X` working when the plugin switch is off, and minimize new excerpt-doc block attrs to Xiuyuan binding plus reading-source metadata.
- Touched slice: Progressive reading and review hotkey flow in `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts`, `src/ui/review/v2/ReviewView.vue`, `src/application/adapters/UnifiedReviewAdapter.ts`, excerpt metadata writing in `src/application/services/ProgressiveReadingService.ts` and `src/core/siyuan/block.ts`, Xiuyuan persistence in `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`, plus settings normalization/UI in `src/types/settings.ts`, `src/application/services/SettingsService.ts`, and `src/ui/settings/SettingsPanel.vue`.
- Debt fixed now: Replaced the implicit always-on excerpt behavior with one explicit default-off setting, stopped new excerpt docs from persisting `custom-fsrs-card-type`, moved new reading attrs onto the narrower `custom-fsrs-reading-*` namespace while keeping legacy reads compatible, and hid the review-side excerpt affordance when the feature is disabled.
- Debt deferred: Existing progressive/workbench attrs are still readable under the old namespace, and historical excerpt docs keep their old attrs because this task intentionally skips migration.
- Why deferred: Attribute migration across existing local notes is higher risk than this bounded behavior/settings pass and was not needed to restore the active excerpt path.
- Next safe step: If old progressive attr sprawl becomes a real maintenance burden, add one explicit maintenance command that previews legacy excerpt docs and rewrites them to the new minimal reading attr set.
- Validation: `pnpm vitest run src/types/__tests__/settings-normalization.test.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts src/core/xiuyuan/infrastructure/__tests__/XiuyuanRepository.list-template-split-v2.test.ts`; `pnpm build`.

### 2026-04-05 - native Alt+X progressive excerpt handoff and optional daily trace

- Task: Let native Protyle `Alt+X` coexist with progressive excerpt creation, switch excerpt source anchors to DOM-backed `*` block-ref rendering, and gate Daily Notes trace behind a default-off `progressiveReading` setting.
- Touched slice: Progressive reading active path in `src/application/services/ProgressiveReadingService.ts`, editor/review Alt+X routing in `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts` and `src/ui/review/v2/ReviewView.vue`, settings normalization/UI in `src/types/settings.ts`, `src/application/services/SettingsService.ts`, `src/ui/settings/SettingsPanel.vue`, and `src/application/managers/DialogManager.ts`, plus targeted tests.
- Debt fixed now: Removed the old assumption that the plugin must block native `Alt+X` on active Protyle surfaces, stopped relying on fragile handwritten markdown alias refs for excerpt child-doc bodies, and made Daily Notes trace an explicit optional behavior instead of a forced side effect.
- Debt deferred: There is still no migration of old excerpt docs/workbenches, and review `Alt+X` still only auto-excerpts Topic cards while other native-Protyle review cards get native appearance editing only.
- Why deferred: Old data migration is risky and was not requested in this task; widening review excerpt semantics beyond Topic cards would change review-product behavior more than this hotkey/trace pass requires.
- Next safe step: If users want excerpting from non-Topic review cards too, split that into a separate UX pass and define exactly which review card kinds should create progressive child-doc excerpts.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/types/__tests__/settings-normalization.test.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts src/application/usecases/card/__tests__/CreateCardUseCase.test.ts`; `pnpm build`.

### 2026-04-05 - progressive excerpts as child topic documents instead of shared workbenches

- Task: Replace the progressive shared-workbench excerpt model with a SuperMemo-style child excerpt-document flow, while keeping Daily Notes trace leaves and split-session inline insertion working.
- Touched slice: Progressive reading active path in `src/application/services/ProgressiveReadingService.ts`, review insertion in `src/ui/review/v2/ReviewView.vue`, progressive excerpt tests, and the DDD debt ledger.
- Debt fixed now: New `Alt+X` excerpts are created as child documents under the current source doc or split piece, their Topic cards bind to the excerpt document root with `isDocument` metadata, Daily Notes leaves now point at excerpt documents, and split review insertion now queues the new excerpt document directly instead of a workbench block.
- Debt deferred: Legacy workbench/daily-trace repair helpers still exist for old data and can still create compatibility workbench documents if invoked manually in the future, but the new excerpt flow no longer migrates or cleans historical workbench content.
- Why deferred: The user explicitly asked to change the landing model for new excerpts, not to run a risky migration of previously created progressive structures.
- Next safe step: If historical cleanup becomes important, add one explicit maintenance command that migrates old workbench excerpts into child excerpt documents with a preview/approval step.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts src/application/usecases/card/__tests__/CreateCardUseCase.test.ts`; `pnpm build`.

### 2026-04-05 - progressive inline source alias excerpts and split-session excerpt insertion

- Task: Make progressive `Alt+X` write canonical excerpts as `摘录内容 + *` in the same workbench block, and make split-piece excerpts immediately rejoin the current progressive review session as Topic cards.
- Touched slice: Progressive reading active path in `src/application/services/ProgressiveReadingService.ts`, review-session wiring in `src/ui/review/v2/ReviewView.vue`, progressive excerpt typing in `SelectionExcerptService.ts`, plus progressive i18n/test coverage.
- Debt fixed now: Replaced the old sibling source-ref scaffold with one inline block-ref alias on the canonical excerpt block, surfaced the created Topic card ID in the excerpt result contract, and updated split review filtering plus queue insertion so freshly excerpted Topic cards appear inside the same progressive session instead of only existing in storage.
- Debt deferred: The inline alias is still a plain `*` marker rather than a richer visual affordance, and current-session insertion is limited to the split-piece review path instead of all possible Topic review surfaces.
- Why deferred: The user-facing gap was specifically “摘录内容+*” and “split 摘录后马上能复习”; broader marker design and cross-queue insertion semantics need a separate UX decision to avoid overloading non-progressive review modes.
- Next safe step: If the marker needs to read more clearly, evaluate switching the alias from `*` to a stronger but still compact symbol such as `↗`, and decide whether ordinary Topic review sessions should opt into the same inline excerpt insertion behavior.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts src/application/usecases/card/__tests__/CreateCardUseCase.test.ts`; `pnpm build`.

### 2026-04-05 - progressive source-link routing without source content mutation

- Task: Stop progressive `Alt+X` from mutating source block markdown into raw span text, add source block refs beside canonical excerpts, and let split piece review cards jump back to the original source document.
- Touched slice: Progressive reading active path in `src/application/services/ProgressiveReadingService.ts`, review header mapping in `src/application/adapters/UnifiedReviewAdapter.ts` and `src/ui/review/v2/ReviewView.vue`, plus targeted progressive/review adapter tests.
- Debt fixed now: Removed the source-body mutation path that leaked raw HTML into notes, made workbench excerpts carry an explicit non-card source block ref sibling for manual context jumps, and unified progressive review source resolution so excerpt cards jump to source blocks while piece cards jump to source docs through the same toolbar action.
- Debt deferred: There is still no source-side visual marker or durable range anchor for previously excerpted text inside the original document.
- Why deferred: Reintroducing visible source-side trace safely would require a real SiYuan-supported annotation model or a plugin-rendered overlay; mutating markdown again would regress the just-fixed note pollution bug.
- Next safe step: If source-side trace remains important, evaluate a block-attr plus UI-overlay approach or a native annotation API instead of persisting inline markup into source content.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts src/application/usecases/card/__tests__/CreateCardUseCase.test.ts`; `pnpm build`.

### 2026-04-05 - progressive split stale session auto-reconcile

- Task: Let progressive split re-run after users manually delete previously generated piece child docs, instead of blocking forever on stale local session state.
- Touched slice: Progressive reading active path in `src/application/services/ProgressiveReadingService.ts` plus targeted progressive split tests.
- Debt fixed now: Replaced the blind `sourceDocToSession` guard with active-path session reconciliation that prunes orphaned source mappings and auto-removes split sessions whose recorded piece docs no longer exist, while keeping the block in place when real piece docs still remain.
- Debt deferred: There is still no explicit user-facing “reset split session” action for partial manual cleanup cases where some piece docs remain and others were deleted.
- Why deferred: A reset command affects product behavior and deserves a clearer UX decision than this bounded bugfix; the user-facing failure here was specifically the fully deleted child-doc case.
- Next safe step: Add a deliberate split-session reset/rebuild action once the desired partial-cleanup semantics are agreed, and wire it to the same reconciliation helpers.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/usecases/card/__tests__/CreateCardUseCase.test.ts`; `pnpm build`.

### 2026-04-05 - progressive reading canonical excerpt routing and trace repair

- Task: Fix progressive reading split subtree copying, convert `Alt+X` to canonical excerpt blocks plus companion workbenches, move Daily Notes to anchor/source-group/excerpt-ref leaves, and make Topic default faces answerless.
- Touched slice: Progressive reading active path in `src/application/services/ProgressiveReadingService.ts`, `ProgressiveSiyuanPort.ts`, `ProgressiveSiyuanAdapter.ts`, `src/infrastructure/siyuan/api.ts`, and Topic card creation in `src/application/usecases/card/CreateCardUseCase.ts`, plus targeted progressive/card tests.
- Debt fixed now: Replaced direct-child `markdown` splitting with subtree-safe `copyStdMarkdown`, removed new source-ref parent scaffolds from excerpt creation, changed source highlighting from `==...==` to an inert inline progressive marker, repaired plugin-authored legacy daily/workbench scaffolds with real block move/delete operations, and stopped Topic defaults from persisting a fake answer block.
- Debt deferred: Legacy repair still only targets plugin-authored progressive scaffolds and does not try to normalize arbitrary user-edited mixed trees; source highlighting still uses first-match text replacement instead of range-aware anchors.
- Why deferred: Broad tree reconciliation would risk touching user-authored structures without stronger ancestry/ownership rules, and accurate range persistence would cut across Protyle selection modeling plus post-edit block mutation stability.
- Next safe step: Add one focused integration harness for legacy scaffold move/delete repair, then evaluate stable selection-anchor metadata if source highlighting needs to survive repeated source edits.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/usecases/card/__tests__/CreateCardUseCase.test.ts`; `pnpm build`.

### 2026-03-18 - xiuyuan startup malformed riff block fail-open

- Task: Let Xiuyuan startup sync survive malformed Riff cards by reusing existing block-ID normalization and skipping unrecoverable records instead of aborting plugin initialization.
- Touched slice: Xiuyuan + Siyuan integration active path in `src/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter.ts` and `src/application/services/XiuyuanSyncService.ts`, plus targeted Xiuyuan sync tests.
- Debt fixed now: Reused the existing `normalizeBlockId` rule at the adapter boundary and again at Xiuyuan sync entry, filtered malformed Riff inputs before any `riffCard.id` usage, and prevented delete / blacklist cleanup from running on partial full-sync snapshots caused by malformed records.
- Debt deferred: Other non-Xiuyuan Riff consumers still do not share one canonical malformed-input preparation helper, so this resilience is localized to the active Xiuyuan sync path.
- Why deferred: The user-facing failure was isolated to plugin startup and Xiuyuan sync; widening the helper to unrelated Riff consumers would be a broader cross-slice refactor.
- Next safe step: If malformed Riff payloads show up elsewhere, extract one shared Riff input preparation utility and move the remaining consumers onto it with focused slice tests.
- Validation: `pnpm vitest run src/application/services/__tests__/XiuyuanSyncService.malformed-riff-input.test.ts src/application/services/__tests__/XiuyuanSyncService.quick-render-hint.test.ts src/application/services/__tests__/XiuyuanSyncService.formula-multi-cloze.test.ts src/application/services/__tests__/XiuyuanSyncService.card-type-sync.test.ts src/application/services/__tests__/XiuyuanSyncService.native-riff-semantic-routing.test.ts`; `pnpm build`.

### 2026-03-13 - neural roam history ring buffer, paging, and virtualized browser path

- Task: Expand neural roam history past the old 300/400-entry split limit without dragging down queue responsiveness or browser-side trajectory-path rendering.
- Touched slice: Neural roam queue/history core in `src/core/queue/domain/NeuralRoamQueue.ts`, `src/core/queue/neural/ConceptNeuralQueue.ts`, `src/core/queue/neural/NeuralHistoryStore.ts`, and `src/core/queue/neural/hyperspace/HyperspaceEngine.ts`; browser neural history/wake surfaces in `src/ui/browser/SRSBrowser.vue` and `src/ui/browser/neural/NeuralHistoryList.vue`; plus settings/i18n and targeted tests.
- Debt fixed now: Replaced divergent orbit/hyperspace hard caps with one configurable shared history store, moved browser neural refresh off the eager full-history snapshot path, added paged history/event/node-hit queries, and bounded history DOM cost with explicit load-more plus windowed rendering.
- Debt deferred: Anchor `inHistory` highlighting still derives from the currently loaded history window instead of an exact full-session node-membership index, and there is still no mounted `SRSBrowser` integration spec that exercises first-page load, load-more, selection, and wake convergence together.
- Why deferred: Exact session-wide membership needs either another queue-side read model or a broader history query surface, while a realistic browser integration harness would be heavier and more brittle than the bounded unit coverage added in this task.
- Next safe step: Extract one queue-level session history membership query/index and add one focused browser integration spec around paged history loading plus wake selection/convergence behavior.
- Validation: `pnpm vitest run src/core/queue/neural/__tests__/NeuralHistoryStore.test.ts src/core/queue/domain/__tests__/NeuralRoamQueue.test.ts src/ui/browser/neural/__tests__/NeuralHistoryList.test.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/ui/review/v2/__tests__/ReviewView.neural-nav-mode.spec.ts src/ui/review/v2/__tests__/ReviewView.neural-tab-bridge.spec.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts`; `pnpm build`.

### 2026-03-11 - neural history selected-frame override alignment

- Task: Fix the roam-history selected row so it no longer looks dimmer than Wake due to its own timeline-specific selected-style override.
- Touched slice: Browser neural history styling in `src/ui/browser/SRSBrowser.scss`.
- Debt fixed now: Removed the split visual treatment where history selection bypassed the shared selected-frame overlay and instead used a softer local background/shadow combination, which made the same selected state read inconsistently.
- Debt deferred: Selected styling is still managed by adjacent CSS rules instead of one shared reusable neural selected-frame primitive.
- Why deferred: The concrete problem was one history-specific override; consolidating all selected-state styling would be a broader stylesheet refactor.
- Next safe step: If more selection visuals drift, extract one reusable browser-side neural selected-frame pattern and make history/source/anchor all consume it.
- Validation: `pnpm build`.

### 2026-03-11 - neural list selected-frame contrast alignment

- Task: Tune browser-side neural selected rows so their blue frame matches the Wake selected-step brightness instead of staying slightly dimmer.
- Touched slice: Browser neural list styling in `src/ui/browser/SRSBrowser.scss`.
- Debt fixed now: Removed the remaining contrast gap between Wake selected cards and selected rows in history/source/anchor lists, so one selected-state model now reads with one consistent emphasis level.
- Debt deferred: The browser still uses separate selectors for timeline rows and generic neural list rows rather than one shared selected-state token block.
- Why deferred: This task is a bounded contrast adjustment; collapsing the selectors further would be style architecture work beyond the immediate visual bug.
- Next safe step: If more neural list variants appear, extract one shared selected-frame mixin/token set for all browser-side neural cards.
- Validation: `pnpm build`.

### 2026-03-11 - neural selection blue-frame parity for browser lists

- Task: Make selected neural history/source/anchor rows render a clearly visible blue frame comparable to the Wake selected-step card instead of only a subtle tint or timeline-dot change.
- Touched slice: Browser neural list styling in `src/ui/browser/SRSBrowser.scss`.
- Debt fixed now: Removed the visual mismatch where Wake had a strong selected frame but browser-side neural lists only showed low-contrast selection hints, which made the newly wired selection state look broken in real use.
- Debt deferred: Selected-row styling is still implemented by shared browser CSS selectors rather than a dedicated reusable neural selection token set.
- Why deferred: The bounded issue here is purely visual parity; extracting a fuller token system would broaden the task from a concrete UX fix into style architecture work.
- Next safe step: If neural browser visuals keep evolving, extract one shared selected-state token/mixin for history, source, anchor, and wake cards so contrast and shadow tuning stay aligned.
- Validation: `pnpm build`.

### 2026-03-11 - neural wake selected-node propagation across source and anchor surfaces

- Task: Make orbit centers, activation sources, worldline stations, and node-directed neural navigation actions push their selected node into the Wake selection state so the corresponding wake step gets the same blue selected frame.
- Touched slice: Browser neural roam UI in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/neural/{NeuralFocusList,NeuralAnchorList}.vue`, related browser neural styles, and targeted neural list tests.
- Debt fixed now: Removed the stale ownership split where only history or wake step selection updated the trace `isSelected` state, and deduped wake selection recomputation into one parent helper instead of scattering ad hoc event/node assignments.
- Debt deferred: History rows and source/anchor rows still do not share one unified cross-subview selection model; hidden subviews can retain their prior selected row semantics until the user reopens them.
- Why deferred: Solving the visible wake-highlight bug only requires parent-side trace selection propagation, while a full browser-wide selection model would broaden the slice into history selection persistence and subview state ownership.
- Next safe step: If cross-subview selection consistency becomes more important, extract one browser-level neural selection store that drives history, wake, source, and anchor selection from the same explicit mode (`event` vs `node`).
- Validation: Targeted `vitest` for `NeuralFocusList` and `NeuralAnchorList`, plus `pnpm build`.

### 2026-03-11 - browser explicit tab entry and split-screen tab workspace redesign

- Task: Restore an explicit browser-as-tab entry, let dialog browser sessions convert into stateful browser tabs, and make the browser tab layout usable in split-screen neural roam workflows without changing the default dialog-first entry path.
- Touched slice: Browser/dialog/menu/tab-manager UI slice in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/BrowserToolbar.vue`, `src/ui/browser/layoutProfile.ts`, `src/ui/browser/SRSBrowser.scss`, `src/application/managers/{TabManager,DialogManager,MenuManager}.ts`, plus i18n and targeted tests.
- Debt fixed now: Removed the hidden browser tab conversion path, separated tab layout preferences from dialog state, stopped coupling tab and dock layout rules, and introduced a serializable browser open-state handoff so dialog-to-tab conversion preserves the active neural/browser context.
- Debt deferred: There is still no full mounted `SRSBrowser` integration spec that drives dialog conversion, resize profile changes, and neural handoff across a real SiYuan surface lifecycle.
- Why deferred: The bounded value of this task is in the active browser surface slice, while a realistic multi-surface harness would be much heavier and more brittle than the targeted helper/component coverage added here.
- Next safe step: If the browser tab workspace keeps evolving, extract one dedicated browser-surface state hydrator from `SRSBrowser.vue` and add a narrow integration test around dialog-to-tab restoration plus layout-profile switching.
- Validation: Targeted `vitest` for tab manager, dialog manager, menu manager, browser toolbar, and tab layout helpers, plus `pnpm build`.

### 2026-03-11 - browser neural jump handoff to existing review tab

- Task: Make browser-side neural roam jumps reuse an already open neural review tab instead of always reopening the dialog, while keeping dialog fallback when no tab exists.
- Touched slice: Browser/review/tab-manager handoff in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/neural/reviewSurfaceHandoff.ts`, `src/ui/review/v2/ReviewView.vue`, `src/application/managers/TabManager.ts`, plus i18n and targeted tests.
- Debt fixed now: Removed the hard-wired browser `openNeuralRoamDialog()` reopen path for neural jump actions, added an explicit review-tab runtime bridge instead of implicit queue-state coupling, and localized the review-surface routing policy into a browser helper so future tab/dialog behavior changes stay in one slice.
- Debt deferred: There is still no full browser integration spec that mounts `SRSBrowser` and asserts end-to-end handoff across a real SiYuan custom-tab lifecycle.
- Why deferred: The active test stack has good unit seams around the new manager/helper bridge, but a realistic `SRSBrowser` plus SiYuan tab runtime harness would be substantially heavier and more brittle than the bounded value of this task.
- Next safe step: If this handoff evolves further, extract one browser-side neural navigation action helper from `SRSBrowser.vue` and add a focused slice test around jump/focus/fallback orchestration.
- Validation: Targeted `vitest` for the tab-manager neural sync path, the review-tab bridge, and the browser review-surface handoff helper, plus `pnpm build`.

### 2026-03-11 - wake convergence render split and lazy detail loading

- Task: Reduce Wake open-time jank by moving repeated-node convergence work off the first render path and resolving non-target route details only when the user selects or expands a step.
- Touched slice: Browser neural trace UI in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/neural/traceAggregation.ts`, `src/ui/browser/neural/NeuralActivationTracePanel.vue`, plus neural trace types, i18n, and targeted tests.
- Debt fixed now: Replaced the eager `step × history` convergence pass with a history index plus single-step resolver, removed duplicate trace-step selection work on panel preview/jump, and added explicit idle/loading/ready state so the UI no longer assumes every repeated step is fully materialized up front.
- Debt deferred: There is still no explicit perf telemetry or browser-slice integration test that asserts `getActivationTrace()` call counts across a full Wake open cycle.
- Why deferred: The active repo already lacks focused `SRSBrowser` neural trace integration coverage, and adding timing-sensitive assertions inside the Vue SFC test surface would add more brittleness than signal for this bounded task.
- Next safe step: If Wake still feels heavy in larger sessions, add one focused browser-slice helper extraction around trace hydration so call-count and cache invalidation behavior can be unit-tested directly.
- Validation: Targeted `vitest` for neural trace aggregation and Wake panel behavior, plus `pnpm build`.

### 2026-03-11 - wake convergence semantics for repeated node activations

- Task: Keep neural history event-first, then teach Wake to recognize repeated hits versus multi-route convergence when different paths activate the same node in one session.
- Touched slice: Browser neural trace UI in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/neural/traceAggregation.ts`, `src/ui/browser/neural/NeuralActivationTracePanel.vue`, `src/ui/browser/neural/NeuralHistoryList.vue`, plus neural trace i18n and targeted tests.
- Debt fixed now: Removed the ambiguity where duplicated history rows for the same node looked like a wake bug by surfacing repeat-hit counts in history and route convergence details in Wake without changing the core single-event trace contract.
- Debt deferred: Wake still renders only a primary route plus expandable alternates; there is still no full merged DAG view and no cross-session convergence merge.
- Why deferred: Expanding the domain trace contract to multi-parent graph semantics would cut across queue persistence, engine logic, and browser rendering, which is outside the safe boundary for this task.
- Next safe step: If the convergence model proves useful, add one focused visual iteration on alternate-route readability and decide whether a separate graph-only inspector is worth introducing later.
- Validation: Targeted `vitest` for neural trace aggregation, wake panel, history list, and neural-roam i18n labels, plus `pnpm build`.

### 2026-03-11 - wake trace semantic root and inferred badge cleanup

- Task: Fix Wake / 航迹 summary semantics so hyperspace traces show 当前 / 直接传导节点 / 主激活源, and stop synthetic trace steps from overwriting role labels with a generic root tag.
- Touched slice: Browser neural trace UI in `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/neural/NeuralActivationTracePanel.vue`, `src/ui/browser/neural/types.ts`, plus neural trace i18n and targeted tests.
- Debt fixed now: Removed positional `steps[0]` root guessing in wake summaries and replaced synthetic-root badge clobbering with role-preserving badges plus a weaker inferred marker.
- Debt deferred: Neural roam glossary is still only partially harmonized; other subviews and settings surfaces still carry older conductor/root wording outside the wake panel.
- Why deferred: This task is intentionally bounded to wake trace semantics so the browser slice changes stay low-risk and do not trigger a wider terminology sweep across unrelated surfaces.
- Next safe step: If the wake wording lands well in real use, do one focused glossary pass across source lists, history labels, and settings copy to align the rest of neural roam.
- Validation: Targeted `vitest` for wake panel and neural-roam i18n labels, plus `pnpm build`.

### 2026-03-11 - neural roam switch dedupe and path arrow alignment

- Task: Fix repeated neural roam path nodes after switching back into orbit and move the roam-path background arrow left into the path center.
- Touched slice: Queue/browser slice in `src/core/queue/domain/NeuralRoamQueue.ts`, `src/core/queue/domain/__tests__/NeuralRoamQueue.test.ts`, and `src/ui/browser/SRSBrowser.scss`.
- Debt fixed now: Removed another asymmetric engine-switch bridge bug by adding orbit-side carry-target reuse instead of always replaying `setCurrentFocus`, and replaced fragile percentage-only arrow positioning with bounded left offsets.
- Debt deferred: Visual tuning still relies on manual acceptance rather than automated layout assertions; neural roam path presentation still has no screenshot-style regression coverage.
- Why deferred: The current test stack is good for queue state and weak for pixel-accurate CSS, so adding brittle DOM-style assertions would create more maintenance cost than signal.
- Next safe step: If the arrow still feels off in real usage, do one focused visual pass on the roam-path pane and capture a stable screenshot-based acceptance workflow outside unit tests.
- Validation: Targeted `vitest` for `NeuralRoamQueue.test.ts`, plus `pnpm build` and `pnpm diagnostics`.

### 2026-04-05 - progressive reading split and excerpt topic flow

- Task: Add progressive reading split/excerpt on the active Topic + A-Factor path, including child-doc split sessions, linear piece release, editor/review `Alt+X` excerpting, Daily Notes trace routing, and excerpt source lineage on Topic cards.
- Touched slice: Progressive reading application slice across `src/application/services/ProgressiveReadingService.ts`, `SelectionExcerptService.ts`, `src/application/entries/ProgressiveSelectionResolver.ts`, review adapter/view wiring, `BlockMenuHandler`, progressive Siyuan port/adapter, `CreateCardCommand` / `CreateCardUseCase` / `XiuyuanRepository`, block attr policy, and targeted tests in `src/application/services/__tests__/ProgressiveReadingService.test.ts`.
- Debt fixed now: Removed the previous gap where "incremental learning" could only filter existing cards and had no real split/excerpt material flow; Topic cards can now explicitly persist `extractedFrom` and progressive lineage instead of hiding this in ad-hoc metadata.
- Debt deferred: Source-side excerpt highlighting still uses first-match markdown replacement and does not persist exact range offsets; editor-side excerpting still uses `Alt+X` as the primary entry without an additional explicit menu fallback.
- Why deferred: Accurate range persistence would cut across Protyle selection modeling, block mutation stability, and future resync semantics, and adding more editor UI entrypoints now would broaden the surface before the core progressive flow has user validation.
- Next safe step: Add a dedicated editor menu/button fallback for excerpting and, if needed after real use, introduce stable selection anchor metadata to upgrade source highlighting from first-match to range-aware restoration.
- Validation: Targeted `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts` plus `pnpm build`.

### Entry template

### YYYY-MM-DD - <short task name>

- Task: <user request or short internal summary>
- Touched slice: <bounded context and key files>
- Debt fixed now: <local debt removed in this task>
- Debt deferred: <high-risk or out-of-scope debt left for later>
- Why deferred: <reason it was not safe or reasonable now>
- Next safe step: <smallest safe follow-up>
- Validation: <build, diagnostics, targeted tests, or manual checks>

## 1. Re-scan summary

- Build verification: `pnpm build` passed.
- Code-only non-test scan (`*.ts/*.vue`, excluding tests):
  - `Result<any>` / `as any`: `0`
  - `getAllItems(` runtime usage: `0`
- Active-path fallback/degrade re-scan:
  - Browser/review/session/scheduler targeted fallback branches: cleared in this round.

## 2. Round 33 completed

- Browser single-path convergence (removed legacy TabManager fallback):
  - `src/ui/browser/SRSBrowser.vue`
  - `src/application/managers/DialogManager.ts`
  - `src/ui/browser/composables/useGridInteractions.ts`
- Scheduler strictness (removed silent fallback semantics):
  - `src/core/scheduler/SchedulerRouter.ts`
  - `src/core/scheduler/index.ts`
- Queue/neural degrade-branch removal:
  - `src/core/queue/sequencers/PrioritySequencer.ts` (drop legacy debug id fallback fields)
  - `src/core/queue/neural/HistoryFilter.ts` (remove filter failure degrade return path)
  - `src/core/queue/neural/WeightedWalkEngine.ts` (replace unreachable fallback return with explicit invariant error)
- Browser migration TODO/fallback wording cleanup:
  - `src/ui/browser/browserService.ts`
- Previously identified debt points verified cleared:
  - `src/application/handlers/AutoCardHandler.ts` (no fallback/degrade keywords)
  - `src/application/usecases/xiuyuan/*` (`Result<any>` = 0)
  - `src/ui/browser/*` (`as any` = 0)

## 3. Remaining non-DDD / debt focus (latest)

| Priority | Issue | Typical Locations | Suggested Action |
|---|---|---|---|
| P1 | Mojibake/encoding debt in long-lived docs and some comments | `ARCHITECTURE.md`, selected large Vue/TS files with historical garbled comments | Run dedicated UTF-8 restoration pass (content-preserving) |
| P1 | Legacy compatibility service surface still exists but no longer used on active browser path | `ApplicationContext` (`tabManager` service exposure) | Evaluate bounded removal/retire plan and adjust integration tests |
| P2 | Repeated local i18n helper patterns (`t(key, fallback)`) | UI components in browser/review | Optional dedupe via shared translator utility (low risk, non-functional) |

## 4. Next convergence batch

1. Execute UTF-8 restoration pass for architecture and core active docs.
2. Shrink `ApplicationContext` compatibility surface where active callers are already migrated.
3. Do low-risk i18n helper dedupe in browser/review slices.
