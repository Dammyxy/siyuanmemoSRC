# DDD Re-Scan Backlog

Last update: 2026-04-15 (Round 68)

## 0. Task Deltas (newest first)

### 2026-04-15 - review tab split lifecycle refresh for multi-card special renderers

- Task: Fix native review TAB split flows where special-rendered cards from one block with multiple card faces could still fail to open in direct right split because the custom TAB lifecycle did not re-sync the exact current card identity after split/update/resize.
- Touched slice: Review tab runtime normalization and lifecycle wiring in `src/application/managers/TabManager.ts`, review tab runtime contract in `src/types/review-tab.ts`, review TAB bridge typing in `src/ui/review/v2/types.ts`, review tab surface refresh/rebind logic in `src/ui/review/v2/ReviewView.vue`, and focused review-tab lifecycle regression coverage in `src/application/managers/__tests__/TabManager.review-transfer.spec.ts`.
- Debt fixed now: Review tab runtime state now persists explicit `currentCardId/currentBlockId` in addition to the queue snapshot; old runtime snapshots without those fields are upgraded from `queueSnapshot.currentItem`; `TabManager` now keeps `runtime.data` and `tab.model.data` in sync; and review custom tabs now respond to Siyuan `resize/update` lifecycle callbacks by asking `ReviewView` to refresh the current review surface by card id and force a bounded renderer remount, which specifically protects same-block multi-card special renderers during direct split/right-pane restore.
- Debt deferred: The review tab bridge is still a Vue exposed API rather than a smaller application-facing review-tab lifecycle service, and the refresh path still relies on a bounded renderer remount instead of a renderer-specific incremental resize protocol.
- Why deferred: Extracting a dedicated lifecycle service or teaching every special renderer its own resize/rebind contract would widen this split bugfix into a broader review-tab architecture project with much larger regression surface than the active native split failure warrants.
- Next safe step: If native split still shows one remaining renderer-specific edge case, move the current `refreshTabSurface` behavior behind a small review-tab lifecycle service and let individual special renderers optionally expose a lightweight resize/recover hook before considering a larger rewrite.
- Validation: `pnpm vitest run src/application/managers/__tests__/TabManager.review-transfer.spec.ts src/application/managers/__tests__/TabManager.openReviewInNewWindow.spec.ts src/ui/review/v2/__tests__/ReviewView.open-as-menu.spec.ts`; `pnpm build`.

### 2026-04-15 - review tab runtime-state snapshot restore for special renderers

- Task: Fix review TAB split/reload restores where special-rendered retrieval-practice cards could come back as blank custom panes because the tab only persisted static queue metadata and lost the current card/runtime session context that special renderers depend on.
- Touched slice: Review tab runtime data wiring in `src/application/managers/TabManager.ts`, review queue wrapper snapshot support in `src/application/adapters/UnifiedQueueStrategy.ts`, review session bootstrap in `src/ui/review/v2/useReviewSession.ts`, review tab state emission in `src/ui/review/v2/ReviewView.vue`, shared review-tab snapshot contracts in new `src/types/review-tab.ts`, plus focused tab/session regression coverage.
- Debt fixed now: Review custom tabs now keep a bounded serializable runtime snapshot (`showAnswer`, session counters, current card, queue wrapper position/cache state) in `runtime.data.reviewState`; `TabManager` restores that snapshot before mounting `ReviewView`; and `useReviewSession` can now hydrate from a restored current item instead of always consuming `queue.next()` on mount, which is what previously left special renderers without the card metadata they need after native split/reload restore.
- Debt deferred: The persisted runtime snapshot still does not preserve full review back-history/rollback transactions, and filter-group native split restore still keeps using its older detached transfer-state snapshot for underlying queue membership instead of one unified review-surface snapshot model.
- Why deferred: Serializing undo/back transactions and fully unifying filter-group transfer with review-tab runtime snapshots would widen this bounded split fix into a larger review-session persistence redesign with more compatibility risk than needed for the active blank-pane bug.
- Next safe step: If users next need exact split-session continuation including `Back`, add a dedicated review-tab session snapshot contract that also models history/rollback state and lets `TabManager` persist live filter-group transfer state alongside the wrapper snapshot.
- Validation: `pnpm vitest run src/application/adapters/__tests__/UnifiedQueueStrategy.scope-append.spec.ts src/ui/review/v2/__tests__/useReviewSession.spec.ts src/application/managers/__tests__/TabManager.review-transfer.spec.ts`; `pnpm build`.

### 2026-04-15 - retrieval practice split locate-source target fix for special renderers

- Task: Fix retrieval-practice review split/open-as flows where special-rendered cards could not reliably open in split view because the review surface used the scheduler/reference block id instead of the renderer's current source block when locating the source block.
- Touched slice: Review open-as/source-locate handling in `src/ui/review/v2/ReviewView.vue` plus focused open-as regression coverage in `src/ui/review/v2/__tests__/ReviewView.open-as-menu.spec.ts`.
- Debt fixed now: `ReviewView` now distinguishes between the "current card reference block" used for queue/scheduler semantics and the "current source block" used by locate-source split actions; open-as locate actions now prefer the active editable/source block exposed by `ReviewContent`, then fall back to the rendered content block, instead of blindly leading with `actions.cardMeta.blockID`, which was only a representative Xiuyuan block for many special renderers.
- Debt deferred: Other review-side actions still read `resolveCurrentReviewBlockId()` directly even when their semantics are "current card identity" versus "current rendered source", and the split/open-as source-target policy still lives inside `ReviewView` instead of a smaller review navigation helper.
- Why deferred: The active bug is strictly on the open-as locate-source path; widening this into a broader review action semantics cleanup would touch SRS editing, neural actions, and AI context payload semantics that were not broken here.
- Next safe step: If another review action misroutes on special-render cards, extract a small review-surface target resolver that names the distinct identities explicitly (`cardReferenceBlockId`, `renderedSourceBlockId`, `editableSourceBlockId`) and migrate the remaining call sites one by one.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewView.open-as-menu.spec.ts`; `pnpm build`.

### 2026-04-15 - neural review tab split handoff stabilization

- Task: Fix review TAB splitting / neural handoff regressions where the split surface could appear blank because the review tab bridge reported sync failure before the newly loaded node had settled into the current review state.
- Touched slice: Review tab bridge logic in `src/ui/review/v2/ReviewView.vue` plus focused tab/split regression coverage in `src/ui/review/v2/__tests__/ReviewView.neural-tab-bridge.spec.ts` and `src/application/managers/__tests__/TabManager.neural-review-tab-sync.spec.ts`.
- Debt fixed now: `ReviewView.syncToNeuralQueueCurrentNode()` no longer does a single immediate post-load comparison against the current review block id; it now waits through the reactive tick boundary and only fails after a bounded settled-state check, which keeps neural review tab handoff/split flows from falsely reporting failure while the card state is still converging.
- Debt deferred: The neural handoff path still relies on `ReviewView` exposing a UI-level bridge method rather than a smaller dedicated application-facing review-tab sync abstraction.
- Why deferred: Extracting a dedicated bridge service would widen this bounded split regression fix into a broader review-tab ownership refactor with little immediate benefit once the active state-settling bug is removed.
- Next safe step: If review-tab handoff grows again, move the bridge sync contract behind a small tab-facing review session service so TabManager stops depending on a Vue exposed API.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewView.neural-tab-bridge.spec.ts src/application/managers/__tests__/TabManager.neural-review-tab-sync.spec.ts src/ui/review/v2/__tests__/ReviewView.open-as-menu.spec.ts src/ui/browser/neural/__tests__/reviewSurfaceHandoff.test.ts`; `pnpm build`.

### 2026-04-15 - formula review attr-tail cleanup on inline render path

- Task: Fix formula cards in review that were leaking SiYuan block attribute tails like `{: custom-fsrs-card-type=...}` after the rendered math expression.
- Touched slice: Formula/multi-cloze review rendering in `src/core/card/multi-cloze/application/MultiClozeCardRenderService.ts`, shared block-attribute cleanup in new `src/core/card/common/utils/stripSiyuanBlockAttributeArtifacts.ts`, bounded quick-card reuse cleanup in `src/core/card/quick-card/infrastructure/SiyuanBlockAdapter.ts`, and focused multi-cloze/quick renderer regression coverage.
- Debt fixed now: The active `inline-formula-cloze` source path now strips trailing SiYuan block attrs before cloze extraction and math normalization; the stored-face fallback for formula cards now applies the same cleanup instead of re-showing raw `{: ...}` tails when source kramdown is unavailable; and the duplicated quick-card attribute cleanup regex now reuses the same helper so formula/quick renderers stop drifting apart locally.
- Debt deferred: Other card slices such as concept-definition still keep their own nearby attribute-tail stripping logic instead of consuming the new shared helper.
- Why deferred: Widening this bugfix into a repo-wide attribute-cleanup refactor would touch multiple unrelated renderers and increase regression surface beyond the bounded formula-card path that is actively broken.
- Next safe step: If another renderer leaks raw SiYuan attrs again, migrate that bounded slice onto the shared helper and then collapse the remaining duplicate regexes in one dedicated cleanup pass.
- Validation: `pnpm vitest run src/core/card/multi-cloze/application/__tests__/MultiClozeCardRenderService.inline-formula.test.ts src/core/card/multi-cloze/application/__tests__/MultiClozeCardRenderService.test.ts src/core/card/quick-card/infrastructure/__tests__/SiyuanBlockAdapter.test.ts src/ui/review/components/__tests__/MultiClozeCardRenderer.test.ts`; `pnpm build`.

### 2026-04-15 - review rich renderer editing and markdown parity

- Task: Reuse the shared AI-side large text editor on the review surface so special review renderers can open/edit the current source block, and fix list-template review cards that were still rendering cue/answer content as plain text instead of markdown-rich block content.
- Touched slice: Review Siyuan port/application boundary in `src/application/ports/ReviewSiyuanPort.ts`, `src/infrastructure/siyuan/ReviewSiyuanAdapter.ts`, and `src/application/services/ReviewApplicationService.ts`; review UI/runtime in `src/ui/review/v2/{types.ts,ReviewView.vue,ReviewContent.vue}`; list-template review renderer in `src/ui/review/v2/components/XiuyuanListTemplateCard.vue`; shared cue/answer parsing in new `src/core/xiuyuan/parseCueAndAnswer.ts` plus Xiuyuan creation callers; related i18n, `ARCHITECTURE.md`, and focused review/Xiuyuan regression coverage.
- Debt fixed now: Review no longer needs to bypass the active port boundary to read/write raw block markdown; `ReviewContent` now exposes one bounded editable-source contract and a review-local refresh token so same-block saves re-run special/main renderer detection instead of serving stale cached output; and list-template review cards now read current/previous child paragraph kramdown as runtime truth and render cue/answer through shared rich markdown instead of frozen plain-text meta strings.
- Debt deferred: Image-occlusion review still has no current-content edit entry, and special review cards still edit raw block markdown through the large textarea instead of embedding a true in-place Protyle/WYSIWYG editor inside each renderer.
- Why deferred: Image-occlusion editing needs separate mask-metadata modeling beyond simple block markdown writes, while embedding native Protyle inside every special renderer would widen this bounded review parity task into a much larger renderer-lifecycle and keyboard-focus redesign.
- Next safe step: If users next want closer native editing parity, add one follow-up that models image-occlusion editable metadata separately and evaluate whether one bounded Protyle-backed editor surface can replace raw-markdown editing for selected special renderers without duplicating review session logic.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewView.more-menu.spec.ts src/ui/review/v2/__tests__/ReviewContent.editor-state.spec.ts src/ui/review/v2/components/__tests__/XiuyuanListTemplateCard.test.ts src/application/services/__tests__/ReviewApplicationService.reschedule-membership.test.ts`; `pnpm build`.

### 2026-04-15 - ai chat rich rendering message editing and one-shot use-context

- Task: Upgrade the AI workbench chat shell with selectable rich message rendering, local assistant/result editing, and one-shot `Use Context` attachments inspired by F toolbox interaction patterns without copying its implementation.
- Touched slice: AI workbench message/context contracts in `src/types/ai.ts`, runtime orchestration in `src/application/services/AIWorkbenchService.ts`, provider metadata in `src/application/services/AIWorkbenchContextProviderRegistry.ts`, reusable rendering/editor UI in `src/ui/shared/{RichMarkdownContent,LargeTextEditorDialog}.vue` plus `src/ui/shared/rich-content.ts`, AI chat UI in `src/ui/ai/AiWorkbenchPane.vue`, related i18n, `ARCHITECTURE.md`, and focused AI workbench regression coverage.
- Debt fixed now: AI chat messages are no longer locked to plain text and button-only copy; assistant text and structured sections now render through one reusable markdown/code/math/mermaid renderer with normal text selection enabled; temporary context attachments now travel through the active `AIWorkbenchService` payload path instead of forcing users to overload prompt text; and assistant-text / assistant-result history can now be edited locally and persisted through the same session store without creating a second chat path.
- Debt deferred: Context provider titles/descriptions and some AI contract copy are still hardcoded inside the bounded AI slice instead of flowing through a fuller i18n/domain presentation pass, and the current document / selected-content providers still use pragmatic DOM-plus-port resolution rather than a broader shared context-provider platform.
- Why deferred: A complete i18n sweep or a cross-plugin provider platform would widen this bounded AI chat enhancement into much larger UX/platform work with more merge risk than needed to ship the active chat improvements.
- Next safe step: If `Use Context` keeps growing, extract provider resolution into a dedicated AI-context service with typed provider-specific tests, then fold provider metadata/copy into the normal i18n path in the same bounded slice.
- Validation: `pnpm vitest run src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/application/services/__tests__/AIWorkbenchSessionStoreService.test.ts src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts`; `pnpm build`.

### 2026-04-15 - ai prompt dual-layer behavior/system-contract split

- Task: Replace the fully editable structured first-run prompts with a dual-layer model where users edit behavior prompts while the plugin owns the JSON/schema contract for tutor, explain, make-card, and CDF make-card runs.
- Touched slice: AI settings normalization in `src/types/settings.ts`, structured prompt registry/runtime assembly in `src/application/services/{AIPromptContractRegistry,AIWorkbenchService,AIPromptComposer}.ts`, settings UI in `src/ui/settings/SettingsPanel.vue`, related i18n, `ARCHITECTURE.md`, and focused settings/AI regression coverage.
- Debt fixed now: Normal users no longer have to stare at `workingDefinition` / `candidates` / `fieldMapping`-style schema text in the main prompt editor just to tune tone and behavior; the structured JSON contract now has one code-owned source of truth shared by runtime assembly and the settings read-only advanced view; and a one-time `promptContractVersion` migration resets legacy fully-exposed prompt text to the new behavior/follow-up template set instead of carrying brittle schema wording forward.
- Debt deferred: The system contract is still fixed and internal rather than user-configurable, and settings still do not provide a richer schema-health simulator beyond the bounded runtime validation/error guidance already in place.
- Why deferred: Opening schema customization or building a full prompt-contract simulator would widen this bounded hardening into a larger product/tooling project with new UX and compatibility decisions.
- Next safe step: If advanced users later need controlled schema editing, add a separate expert-mode contract editor backed by explicit schema validation instead of re-exposing the raw runtime contract inside the normal prompt textarea.
- Validation: `pnpm vitest run src/types/__tests__/settings-normalization.test.ts src/application/services/__tests__/AIPromptComposer.test.ts src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/ui/settings/__tests__/SettingsPanel.test.ts`; `pnpm build`.

### 2026-04-15 - ai explain legacy-field compatibility and raw-content fallback

- Task: Fix `AI 解释卡片` chat messages that rendered only the title bar because some valid JSON responses used legacy alias keys like `workDefinition` / `testPoint` / `confusionBoundary` instead of the current explain schema.
- Touched slice: AI explain normalization in `src/application/services/AIWorkbenchService.ts`, AI chat rendering fallback in `src/ui/ai/AiWorkbenchPane.vue`, and focused regression coverage in `src/application/services/__tests__/AIWorkbenchService.review-session.test.ts` plus `src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts`.
- Debt fixed now: The active explain pipeline now accepts the legacy/alias explain field names and string-valued list fields, so new runs normalize into the current `workingDefinition / whatItTests / whyItsTricky / connections / triggers` shape; persisted historical explain messages can also recover from `rawContent` when their stored normalized payload is empty, so existing blank bubbles no longer stay blank.
- Debt deferred: Prompt customization can still drift into completely different JSON schemas that the plugin cannot infer safely, and tutor/make-card prompts still rely on their own stricter field contracts beyond the light string-list hardening added here.
- Why deferred: Inferring arbitrary user-defined schemas would turn this bounded compatibility fix into a generic prompt-to-UI mapping system with much broader product and UX implications.
- Next safe step: If users continue heavily editing explain/tutor prompts, add a prompt health preview that validates required keys against the expected runtime schema before first run or save.
- Validation: `pnpm vitest run src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts`; `pnpm build`.

### 2026-04-15 - ai structured json-mode hardening

- Task: Fix AI workbench structured runs that could fail with `AI response is not valid JSON` even when the prompt still requested JSON, by hardening the structured-output boundary for explain/tutor/make-cards.
- Touched slice: AI workbench request/parse flow in `src/application/services/AIWorkbenchService.ts`, LLM port/adapter contract in `src/application/ports/LLMPort.ts` and `src/infrastructure/llm/OpenAICompatibleLLMAdapter.ts`, focused regression coverage in `src/application/services/__tests__/AIWorkbenchService.review-session.test.ts` and `src/infrastructure/llm/__tests__/OpenAICompatibleLLMAdapter.test.ts`, plus `ARCHITECTURE.md`.
- Debt fixed now: Structured first-run tasks now explicitly request `json_object` output mode at the LLM boundary instead of relying only on prompt wording; the local JSON extractor now tolerates fenced JSON wrappers before falling back to brace slicing; and follow-up chat remains freeform so the new hardening stays scoped to the structured-result contract.
- Debt deferred: Providers that advertise an OpenAI-compatible endpoint but do not actually accept `response_format` still rely on their server-side compatibility quality; the settings surface still has no prompt linter that warns users before they save a JSON-breaking template.
- Why deferred: Adding provider-specific downgrade logic or a prompt-schema validator would widen this bounded runtime hardening into a larger compatibility/tooling project that is not required to fix the active parse failure on the main path.
- Next safe step: If users report a specific provider rejecting `response_format`, add one bounded adapter capability check keyed to the concrete provider behavior, and if prompt customization keeps causing failures, add a lightweight JSON-contract health check in settings.
- Validation: `pnpm vitest run src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/infrastructure/llm/__tests__/OpenAICompatibleLLMAdapter.test.ts`; `pnpm build`.

### 2026-04-15 - ai workbench chat sessions and persistent history

- Task: Upgrade the AI workbench from single-result panels into a chat-style companion with persistent session history, unified cross-entry session semantics, collapsible context/history drawers, and make-card candidate boards embedded in the same conversation shell.
- Touched slice: AI workbench runtime wiring in `src/application/ApplicationContext.ts`, `src/application/services/{AIWorkbenchSessionStoreService,ReviewAIWorkbenchRegistry,AIWorkbenchService}.ts`, AI chat UI in `src/ui/ai/AiWorkbenchPane.vue`, supporting `FileService` persistence, related i18n, `ARCHITECTURE.md`, and focused AI workbench / entrypoint regression coverage.
- Debt fixed now: Removed the last ephemeral in-memory-only AI history path by moving session storage onto `FileService`; unified standalone/review/tab/template-dialog openings onto one persistent session model with context-signature-based session rollover; and replaced the old result-panel + ad hoc follow-up surface with a single message-thread shell where tutor/explain results and make-card candidate boards share the same topbar/history/context/composer contract.
- Debt deferred: History rename/delete still use lightweight prompt/confirm interactions instead of a dedicated polished modal flow, and candidate-board edits persist through a small debounced write rather than a richer draft-presence lifecycle.
- Why deferred: A dedicated history-management interaction model and a more granular session-write scheduler would widen this bounded AI workbench upgrade into extra UX/state tooling work without blocking the core shift to persistent chat sessions.
- Next safe step: If users start managing large numbers of sessions or long candidate-editing passes, add a dedicated history management dialog and a more explicit draft-presence indicator around debounced session persistence.
- Validation: `pnpm vitest run src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts src/application/managers/__tests__/DialogManager.quick-template-filter.test.ts src/application/managers/__tests__/TabManager.review-ai-companion.spec.ts`; `pnpm build`.

### 2026-04-15 - ai prompt full exposure and cdf make-card mode

- Task: Fully expose AI run/follow-up prompts as editable full text, remove legacy `promptProfiles` persistence/runtime composition, and add a dedicated `CDF` make-card mode that reuses the concept definition/descriptor candidate pipeline.
- Touched slice: AI settings normalization in `src/types/settings.ts`, AI runtime flow in `src/application/services/{AIPromptComposer,AIWorkbenchService}.ts`, AI/settings surfaces in `src/ui/{ai/AiWorkbenchPane.vue,settings/SettingsPanel.vue}`, template-dialog entry in `src/application/managers/DialogManager.ts`, related i18n, and focused regression coverage.
- Debt fixed now: Removed the hidden prompt-composer layer where runtime silently stitched shared prefixes and follow-up protocol around user-edited text; collapsed prompt persistence onto one explicit `run/followUp` truth source with legacy flat-string migration; and added a first-class `cdf` mode so concept-anchor/descriptor-style AI card generation no longer has to overload the older generic card-candidate prompt.
- Debt deferred: Fully editable prompts can still drift away from the JSON response contract, and the settings surface still has no prompt-specific validator/preview that warns users before a broken template reaches runtime.
- Why deferred: Adding schema-aware prompt linting or dry-run preview would widen this bounded prompt/runtime cleanup into a larger AI authoring-tooling project with new UX and model-coupling decisions.
- Next safe step: If users start heavily customizing prompts, add a lightweight prompt health check in settings that validates required JSON-shape instructions per prompt group before save or first run.
- Validation: `pnpm vitest run src/types/__tests__/settings-normalization.test.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/application/managers/__tests__/DialogManager.quick-template-filter.test.ts src/application/services/__tests__/AIPromptComposer.test.ts`; `pnpm build`.

### 2026-04-14 - settings panel left-nav regroup and large responsive dialog

- Task: Rebuild the plugin settings surface into a larger responsive dialog with left-side vertical navigation, workflow-based category regrouping, and dedicated maintenance/about tabs while keeping the existing settings save contract unchanged.
- Touched slice: Settings UI in `src/ui/settings/SettingsPanel.vue`, dialog sizing in `src/application/managers/DialogManager.ts`, related i18n strings, and focused settings-panel regression coverage.
- Debt fixed now: Removed the overloaded two-tab information architecture where study/capture-sync mixed unrelated settings into long vertical lists; maintenance-only cleanup actions now live outside the normal save footer path; and the settings dialog no longer uses the cramped fixed `700x600` desktop size.
- Debt deferred: `SettingsPanel.vue` still owns a large amount of presentation and form-state logic in one file even after the navigation regrouping.
- Why deferred: Splitting each settings category into dedicated subcomponents would widen a bounded settings-surface redesign into a larger UI module refactor with higher merge risk and little immediate user-facing payoff.
- Next safe step: If this settings surface changes again soon, extract category-level subcomponents around the new left-nav sections first so future UX work can stay local without revisiting one monolithic Vue file.
- Validation: `pnpm vitest run src/ui/settings/__tests__/SettingsPanel.test.ts`; `pnpm build`.

### 2026-04-14 - review header queue-title regression fix

- Task: Fix the review header so the top-left title shows the real current review surface name instead of collapsing every queue to the generic retrieval/review label.
- Touched slice: Review header presentation in `src/ui/review/v2/ReviewHeader.vue`, review surface title shaping in `src/application/adapters/UnifiedReviewAdapter.ts`, and focused header/adapter regression coverage.
- Debt fixed now: Removed the duplicated title regression where the header brand text was hardcoded to the generic review label and the unified review adapter also emitted generic `header.title` / `stats.queueName` values, which made dialog/tab/context review surfaces lose their queue identity.
- Debt deferred: `queueProgress.queueLabel` still follows queue-type-centric labeling instead of the full contextual surface title for every special header variant.
- Why deferred: Extending every progress snapshot and downstream consumer to carry contextual surface titles would widen a bounded header regression fix into a broader queue-progress contract change.
- Next safe step: If any other review surface still shows a mismatched contextual title outside the top-left header brand, audit `ReviewQueueProgressSnapshot.queueLabel` consumers and decide whether contextual variants need a second, display-only title field.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewHeader.spec.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts`; `pnpm build`.

### 2026-04-14 - review header counter notifications moved to SiYuan host toast

- Task: Move the review-header counter hide/show feedback from the header-local floating notice into the host SiYuan notification channel, and align the copy with the new queue-progress wording.
- Touched slice: Review header interaction in `src/ui/review/v2/ReviewHeader.vue`, focused header interaction coverage in `src/ui/review/v2/__tests__/ReviewHeader.spec.ts`, and the related i18n strings.
- Debt fixed now: Counter hide/show feedback no longer overlays the review header area itself, so the review surface stays visually cleaner while still acknowledging the action immediately through the host notification system.
- Debt deferred: The review header now imports `showMessage(...)` directly instead of routing host notifications through a dedicated review-surface abstraction.
- Why deferred: Building a shared notification port just for this bounded UX tweak would widen a small presentation adjustment into a larger UI infrastructure task without enough immediate payoff.
- Next safe step: If review surfaces need richer or typed notifications later, add a tiny review notification adapter so header/content/actions can share one host-message contract instead of importing SiYuan APIs directly.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewHeader.spec.ts`; `pnpm build`.

### 2026-04-14 - conflicted doc mitigation for suspended state and managed riff sync

- Task: Lower flashcard `Conflicted` document risk by removing plugin-owned block-attr writes from review/browser suspend flows, switching suspended queries to storage-first state, moving managed Riff Xiuyuan lookup to repository/storage `blockId` truth, and normalizing the legacy high-frequency incremental-sync trigger triplet.
- Touched slice: Browser query/action flow in `src/ui/browser/browserService.ts` and `src/application/queries/browser/shared/BrowserDeckQueryKernel.ts`, review/card-editor suspend flow in `src/application/services/CardEditorApplicationService.ts`, unified card querying in `src/core/storage/UnifiedStorageManager.ts` and `src/application/queries/DataAccessFacade.ts`, managed Riff sync/repository behavior in `src/application/services/XiuyuanSyncService.ts` and `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`, plus settings normalization/migrators and focused regression tests.
- Debt fixed now: `custom-fsrs-suspended` is no longer a write target for review/browser pause actions; browser suspended preset/stats now query unified storage instead of attributes SQL; managed `builtin-riff-sync` / `meta.source='riff-sync'` Xiuyuans no longer background write or clear `custom-xiuyuan-id`; stale binding attrs are no longer auto-self-healed during sync; and the untouched legacy incremental-sync trigger triplet now collapses to `['plugin-start']` to reduce background sync amplification.
- Debt deferred: Hard delete still performs native Riff/document writes and can still race into real sync conflicts across devices; legacy `custom-fsrs-suspended` / `custom-xiuyuan-id` compatibility reads remain in place for old data.
- Why deferred: Changing delete semantics or removing all legacy compatibility would widen this bounded conflict-risk reduction into a migration-heavy data-policy redesign with materially higher regression risk.
- Next safe step: If users still report `Conflicted` docs after this reduction, split destructive native Riff deletion from local hide/tombstone semantics first, then add concrete cross-device concurrency diagnostics before deciding whether the remaining legacy attr-read compat can be removed.
- Validation: `pnpm vitest run src/application/services/__tests__/CardEditorApplicationService.test.ts src/ui/browser/__tests__/browserService.block-id-paths.test.ts src/core/storage/__tests__/UnifiedStorageManager.query-cards.test.ts src/application/queries/browser/__tests__/GetBrowserCardsQueryHandler.priority-regression.test.ts src/core/xiuyuan/infrastructure/__tests__/XiuyuanRepository.riff-sync-binding.test.ts src/types/__tests__/riffIntegrationConfig.test.ts src/types/__tests__/settings-normalization.test.ts src/utils/__tests__/configMigrator.test.ts src/utils/__tests__/simpleModeRemovalMigrator.test.ts`; `pnpm build`.

### 2026-04-14 - review tab exit parity and standard tab-dialog surface conversion

- Task: Add a real completed-empty exit path for review tabs, and make standard review queues convertible from TAB back into dialog without routing through the default new-tab preference.
- Touched slice: Review surface composition in `src/ui/review/v2/ReviewView.vue`, forced dialog opening in `src/application/managers/DialogManager.ts` and `src/application/factories/createUnifiedReviewDialog.ts`, review-tab closing in `src/application/managers/TabManager.ts`, review/dialog i18n keys, and focused review/dialog/tab manager tests.
- Debt fixed now: The completed `No Card` state no longer strands TAB sessions without a usable close action; review surface closing is now centralized instead of split between empty-state and open-as branches; and standard queue TAB->dialog conversion uses an explicit active-path helper that bypasses the global new-tab default instead of relying on brittle UI-only branching.
- Debt deferred: Non-standard review sessions such as `subset-review`, `temporary-drill`, `leech`, and filter-backed contextual variants still do not expose TAB->dialog conversion, and dialog->TAB still only preserves explicit transfer state for filter-group sessions rather than all queue counters.
- Why deferred: Those sessions depend on ephemeral queue instances or header/queue combinations that the current surface-transfer contract cannot restore safely, while full counter/state parity for every dialog->TAB path would require broadening `ReviewTabTransferState` beyond the bounded fix needed here.
- Next safe step: If we want wider surface parity later, first define a serializable review-surface transfer contract that covers contextual queue identity plus session counters, then opt additional queue/header combinations into the same conversion helper one by one.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewView.empty-state.spec.ts src/ui/review/v2/__tests__/ReviewView.open-as-menu.spec.ts src/ui/review/v2/__tests__/ReviewView.more-menu.spec.ts src/application/factories/__tests__/createUnifiedReviewDialog.mode.test.ts src/application/managers/__tests__/DialogManager.review-header-variant.test.ts src/application/managers/__tests__/TabManager.review-close.spec.ts`; `pnpm build`; `rg -n "createUnifiedReviewDialog|openStandardReviewDialog|closeReviewTab" src/application/managers/DialogManager.ts src/application/factories/createUnifiedReviewDialog.ts src/application/managers/TabManager.ts src/ui/review/v2/ReviewView.vue`.

### 2026-04-14 - browser search hint removal and review empty-state exit-only flow

- Task: Remove the main browser search placeholder hint text, and make completed review empty states actionless except for a dialog-only `退出` button.
- Touched slice: Browser toolbar in `src/ui/browser/BrowserToolbar.vue`, review empty-state contract in `src/ui/review/v2/types.ts` and `src/application/adapters/UnifiedReviewAdapter.ts`, review composition in `src/ui/review/v2/ReviewView.vue`, plus focused browser/review adapter/view tests.
- Debt fixed now: The active browser toolbar no longer leaks advanced query examples into the main search field; review empty states are now explicitly typed as placeholder-vs-completed so the dialog surface can hide invalid `显示答案` / `跳过` actions and expose one real exit path only when the queue is actually finished.
- Debt deferred: The initial review placeholder still reuses the generic empty-content shell before the first `queue.next()` resolves, so users may still briefly see the existing `No due cards` content frame during very slow first-card loads.
- Why deferred: Replacing that first-frame placeholder with a dedicated loading or skeleton state would widen this bounded empty-action fix into a broader review session loading-state redesign across dialog/tab/mobile flows.
- Next safe step: If that initial empty flash becomes user-visible enough to matter, add a separate review loading state contract in `useReviewSession` / `ReviewView` instead of overloading the existing `empty` content type further.
- Validation: `pnpm vitest run src/ui/browser/__tests__/BrowserToolbar.spec.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts src/ui/review/v2/__tests__/ReviewView.empty-state.spec.ts`; `pnpm vitest run src/ui/review/v2/__tests__/ReviewView.more-menu.spec.ts src/ui/review/v2/__tests__/ReviewView.open-as-menu.spec.ts`; `pnpm build`; `rg -n "<BrowserToolbar|import BrowserToolbar from './BrowserToolbar.vue'" -S src/ui/browser/SRSBrowser.vue`.

### 2026-04-14 - review more-menu priority actions and default review open routing

- Task: Add current-card priority editing plus current-card review commands to the review more-menu, register empty-default hotkey commands for priority/suspend/delete, and let global desktop review entries respect new-tab/fullscreen UI defaults.
- Touched slice: Review surface actions in `src/ui/review/v2/ReviewView.vue`, review command integration in `src/index.ts` and `src/application/handlers/ReviewCommandRequestEvents.ts`, review dialog routing in `src/application/managers/DialogManager.ts` plus `src/application/factories/createUnifiedReviewDialog.ts`, settings normalization/panel flow in `src/types/settings.ts` and `src/ui/settings/SettingsPanel.vue`, and focused review/settings/dialog-manager coverage.
- Debt fixed now: The review more-menu can now show and edit the current card priority in place without detouring through the full SRS editor; current-card priority/suspend/delete actions are exposed through proper SiYuan command registrations with empty default hotkeys; and desktop global review entry routing is centralized so dialog-vs-tab plus dialog fullscreen defaults come from one UI settings source.
- Debt deferred: `subset-review`, `temporary-drill`, `leech`, and other context/live-queue review sessions still do not have tab restore parity, so they intentionally remain dialog-only even when the global new-tab default is enabled.
- Why deferred: Those sessions depend on ephemeral queue instances or runtime-only context that the current review tab payload cannot reconstruct safely; forcing them through tabs now would hide state loss behind an apparently working entry path.
- Next safe step: When we want tab parity for contextual review sessions, first design a serializable transfer-state contract for subset/temporary/live queue instances, then let `DialogManager` opt those entry points into the same standard review routing helper.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewView.more-menu.spec.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/types/__tests__/settings-normalization.test.ts src/application/managers/__tests__/DialogManager.review-header-variant.test.ts`; `pnpm build`.

### 2026-04-14 - review header hover counter and local hide notice

- Task: Remove the duplicated centered queue title from the review header, switch desktop counter details to hover-open behavior, and let desktop clicks toggle a session-local hidden counter state with a header-local notice.
- Touched slice: Review header interaction/presentation in `src/ui/review/v2/ReviewHeader.vue`, focused header interaction coverage in `src/ui/review/v2/__tests__/ReviewHeader.spec.ts`, and nearby i18n strings.
- Debt fixed now: The review header no longer repeats the queue title in two places, desktop count inspection now matches the intended lightweight hover model instead of overloading click-open behavior, and the hidden-count state stays inside the header component instead of leaking into review/application contracts.
- Debt deferred: The header-local notice remains an inline component implementation with no shared review toast primitive, and keyboard-first focus opening still relies on local interaction guards instead of a dedicated accessibility interaction model.
- Why deferred: Extracting a shared review notice system or a richer input-modality abstraction would widen a bounded header polish pass into a broader review-surface UI architecture task with more regression risk than this interaction refinement needs.
- Next safe step: If we iterate on review-header polish again, extract the counter chip/popover/notice interaction into a dedicated review-header primitive so desktop, mobile, and tab surfaces can share one tested accessibility model.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewHeader.spec.ts`; `pnpm build`.

### 2026-04-14 - review header and more-menu convergence

- Task: Align the review header with the new RemNote-like layout by collapsing the top bar to one total counter chip plus `AI 侧栏` / `更多`, moving secondary actions into the more-menu, and adding fast suspend/delete actions for the current card and same-block peer cards.
- Touched slice: Review header / toolbar presentation in `src/ui/review/v2/{ReviewHeader.vue,ReviewView.vue}`, review adapter shaping in `src/application/adapters/UnifiedReviewAdapter.ts`, direct card-action application flow in `src/application/services/CardEditorApplicationService.ts`, plus focused review/application/i18n tests.
- Debt fixed now: The review surface now has a single centered counter with a detail popover, queue-specific controls stay visible while generic tools are collapsed into one more-menu, AI entry is unified into one sidecar launcher, and destructive/suspend actions now run through the existing application services instead of pushing new write logic into the UI.
- Debt deferred: The more-menu still builds from imperative `Menu` item assembly inside `ReviewView.vue`, and the counter popover remains a local component implementation rather than a shared review/header primitive.
- Why deferred: Extracting a generic review action-menu / popover abstraction would widen a bounded UI convergence task into a broader review-surface component refactor with a larger regression surface across dialog/tab/mobile entry points.
- Next safe step: If we iterate on review polish again, extract the more-menu item builder and counter popover model into shared review-header utilities so dialog and tab review surfaces can evolve without growing `ReviewView.vue`.
- Validation: `pnpm vitest run src/application/services/__tests__/CardEditorApplicationService.test.ts src/application/adapters/__tests__/UnifiedReviewAdapter.spec.ts src/ui/review/v2/__tests__/ReviewHeader.spec.ts src/ui/review/v2/__tests__/ReviewView.open-as-menu.spec.ts src/ui/review/v2/__tests__/ReviewView.srs-editor-schedule.spec.ts src/ui/review/v2/__tests__/ReviewView.more-menu.spec.ts`; `pnpm build`.

### 2026-04-14 - Quick bidirectional render detection guard

- Task: Fix blank quick bidirectional cards in review by restoring quick render detection for Xiuyuan quick templates
- Touched slice: Review render policy, Xiuyuan -> FSRSCard mapping, ReviewContent tests
- Debt fixed now: Template-driven quick cards now carry a stable renderProfile and are no longer bypassed by semantic fallback
- Debt deferred: Full audit of other template IDs that should imply quick rendering
- Why deferred: Requires broader template inventory review beyond the current blank-card regression
- Next safe step: Add a template-category mapping test that asserts renderProfile defaults for all quick templates
- Validation: pnpm build; pnpm vitest run src/ui/review/v2/__tests__/ReviewContent.editor-state.spec.ts

Use this section for task-level debt tracking when a task touches production code under `src/`.
Do not add an entry for skill-only or docs-only work.

### 2026-04-14 - quick-card structural blank render fallback

- Task: Fix blank review rendering for single-block bidirectional quick cards like `北京<>首都`, and audit the shared quick-card render family so `>>`, `<<`, and `{{}}` do not silently render as empty content when SiYuan returns structurally blank block DOM.
- Touched slice: Review + quick-card rendering in `src/core/card/quick-card/infrastructure/{SiyuanBlockAdapter,QuickCardRepository}.ts` and focused regression coverage in `src/core/card/quick-card/infrastructure/__tests__/*` plus `src/ui/review/v2/__tests__/ReviewContent.editor-state.spec.ts`.
- Debt fixed now: Hardened the active quick-card kramdown render boundary with attribute-tail cleanup, SpinBlockDOM-to-Md2BlockDOM retry, and normalized raw-kramdown fallback when both renderers only return scaffolding; enforced a repository-level invariant that non-empty quick faces do not collapse to empty rendered HTML; and added real routing/face-direction regression coverage for bidirectional single-block quick cards alongside the shared quick renderer family.
- Debt deferred: Quick-card review still relies on the dedicated quick renderer and repository reconstruction instead of rendering through a true native Protyle inline contract, and the broader quick-card component styling still uses plugin-owned reading typography rather than inheriting the exact live theme scale from a host Protyle instance.
- Why deferred: Moving quick-card review onto the native Protyle render contract would widen a bounded visibility bugfix into a larger review adapter redesign, while exact theme-scale inheritance is a separate styling concern that is not required to stop the current blank-card failure.
- Next safe step: If users report any remaining quick-card rendering drift after this fix, audit the actual HTML returned by the surviving quick renderer family in production and then decide whether the next bounded step is renderer-style parity or a deeper native-Protyle integration pass.
- Validation: `pnpm vitest run src/core/card/quick-card/infrastructure/__tests__/SiyuanBlockAdapter.test.ts src/core/card/quick-card/infrastructure/__tests__/QuickCardRepository.test.ts src/ui/review/v2/__tests__/ReviewContent.editor-state.spec.ts src/ui/review/components/__tests__/QuickCardRenderer.test.ts`; `pnpm build`.

### 2026-04-14 - multi-cloze review font scale restoration

- Task: Restore the reading-scale font size for multi-cloze review cards after the native-theme pass made the content inherit the smaller review container default font size.
- Touched slice: Review multi-cloze renderer in `src/ui/review/components/MultiClozeCardRenderer.vue`.
- Debt fixed now: Reintroduced only the missing reading-scale typography on the dedicated multi-cloze content shell using a responsive card-level font-size/line-height token, without bringing back the old component-wide mark overrides or flattening the rest of the native-themed rich-text styling.
- Debt deferred: The renderer still uses a plugin-owned reading scale rather than reading the exact final font size from a SiYuan-native Protyle editor instance or user theme runtime contract.
- Why deferred: Pulling the exact effective editor font scale from native Protyle/theme internals would widen a small typography correction into a larger integration exercise with more theme/runtime coupling than this bounded UI fix needs.
- Next safe step: If users still want closer parity with a specific SiYuan theme, audit the live theme CSS variables exposed by the host editor and replace the current responsive fallback token with the nearest stable native variable.
- Validation: `pnpm vitest run src/ui/review/components/__tests__/MultiClozeCardRenderer.test.ts`; `pnpm build`.

### 2026-04-14 - multi-cloze native-theme marker styling

- Task: Make multi-cloze review cards inherit SiYuan's native themed rich-text look more closely while keeping the current active inline reveal flow, and highlight only the active cloze/answer instead of flattening the whole card into custom typography.
- Touched slice: Review + multi-cloze rendering in `src/core/card/multi-cloze/application/MultiClozeCardRenderService.ts`, `src/ui/review/components/MultiClozeCardRenderer.vue`, `src/index.scss`, and focused multi-cloze service/component tests.
- Debt fixed now: Removed the lingering dependence on literal `==[...]==` placeholder text in the active multi-cloze render path; switched the renderer to a minimal Protyle shell so SiYuan theme typography and rich block styling can flow through again; and narrowed the touched global styling so only the active multi-cloze placeholder/revealed answer gets a lightweight highlight instead of every mark-like span in the card being flattened to one custom style.
- Debt deferred: Multi-cloze still does not use the real native Protyle inline-hide/reveal contract, and the broader review-level `mark` styling remains shared by other custom renderers instead of being fully decomposed into per-renderer style scopes.
- Why deferred: Moving multi-cloze onto the native Protyle reveal contract would widen a bounded styling fix into a larger review adapter redesign, while fully untangling the remaining shared review `mark` styling would expand this task beyond the active multi-cloze slice and risk incidental visual regressions in unrelated custom cards.
- Next safe step: If theme parity still feels off after this pass, audit the remaining review-wide `mark` styling and split it into renderer-specific selectors so each custom card can inherit more native SiYuan defaults without affecting neighboring renderers.
- Validation: `pnpm vitest run src/core/card/multi-cloze/application/__tests__/MultiClozeCardRenderService.test.ts src/core/card/multi-cloze/application/__tests__/MultiClozeCardRenderService.inline-formula.test.ts src/ui/review/components/__tests__/MultiClozeCardRenderer.test.ts src/ui/review/v2/__tests__/ReviewContent.editor-state.spec.ts`; `pnpm build`.

### 2026-04-14 - multi-cloze inline rich review rendering

- Task: Fix quick-created multi-cloze review cards so they render with source-block rich text, keep sequential per-face review, and reveal the current answer inline at the cloze position instead of showing a separate answer panel below.
- Touched slice: Review + multi-cloze rendering in `src/core/card/multi-cloze/application/MultiClozeCardRenderService.ts`, `src/ui/review/components/MultiClozeCardRenderer.vue`, and the active review routing/tests in `src/ui/review/v2/{ReviewContent.vue,__tests__/ReviewContent.editor-state.spec.ts}` plus focused multi-cloze component/service tests.
- Debt fixed now: Removed the split responsibility where the service only emitted raw face strings and the renderer reassembled a front-preview-plus-answer-panel layout; taught the active multi-cloze path to prefer source kramdown parsing and block-DOM rendering for native-like rich content; stripped trailing block-attribute artifact lines from the source kramdown before rendering so review no longer shows raw `{: ...}` metadata; and added focused regression coverage so multi-cloze cards stay on the dedicated review renderer without accidentally falling back to Protyle or the old below-answer layout.
- Debt deferred: Multi-cloze still uses a dedicated renderer rather than the true native Protyle inline-hide/reveal contract, and source rendering still falls back to persisted face text when the underlying block no longer exposes a matching cloze structure.
- Why deferred: Extending native Protyle inline reveal to `builtin-multi-cloze` would widen this bounded review fix into a larger adapter/contract redesign that currently only exists for `builtin-riff-sync`, while removing the fallback would make edited historical cards more brittle instead of more resilient.
- Next safe step: If users later want fully native editing semantics for multi-cloze cards, add one follow-up that models per-face inline hidden-content metadata in the review adapter and then teaches the main Protyle path to reveal only the active cloze.
- Validation: `pnpm vitest run src/core/card/multi-cloze/application/__tests__/MultiClozeCardRenderService.test.ts src/core/card/multi-cloze/application/__tests__/MultiClozeCardRenderService.inline-formula.test.ts src/ui/review/components/__tests__/MultiClozeCardRenderer.test.ts src/ui/review/v2/__tests__/ReviewContent.editor-state.spec.ts`; `pnpm build`.

### 2026-04-14 - trim mode suffix from concept-card source labels

- Task: Remove the `模式` suffix from the zh_CN display names for `概念卡：轨道中心模式` and `概念卡：激活源模式` so the browser/review neural roam UI reads more directly as `概念卡：轨道中心` and `概念卡：激活源`.
- Touched slice: Neural roam naming in `src/i18n/zh_CN.json`, browser/review neural fallbacks in `src/ui/browser/SRSBrowser.vue` and `src/ui/review/v2/ReviewView.vue`, plus focused zh_CN and review/AI tests.
- Debt fixed now: Removed the lingering verbose `模式` suffix from the active orbit-center / activation-source labels, their node/badge/list variants, and the matching runtime fallback strings so zh_CN naming stays consistent even if a key lookup falls back.
- Debt deferred: The full engine labels still intentionally keep `轨道环绕模式` / `超空间远征模式`, and en_US wording is still on the previous English glossary outside those engine labels.
- Why deferred: This follow-up only narrows the concept-card source naming; changing engine-mode copy or the broader English glossary would widen a small terminology polish into a larger cross-locale wording pass.
- Next safe step: If you want an even tighter zh_CN glossary, do one pass that also reviews nearby labels like `概念卡：轨道中心节点` and `主概念卡：激活源` for tone consistency in badges, menus, and AI summaries.
- Validation: `pnpm vitest run src/i18n/__tests__/zh_CN.neural-roam-label.test.ts src/ui/review/v2/__tests__/ReviewView.neural-nav-mode.spec.ts`; `pnpm build`.

### 2026-04-14 - neural i18n naming convergence

- Task: Converge zh_CN neural roam and card-type naming so Item/Topic/Concept/Descriptor stay in English, history/trace wording becomes `双链轨道` and `激活链路`, and Orbit/Hyperspace surfaces split short button labels from full descriptive mode labels while elevating orbit-center and activation-source display names to `概念卡：轨道中心模式` / `概念卡：激活源模式`.
- Touched slice: Browser/review neural roam UI and i18n in `src/i18n/{zh_CN,en_US}.json`, `src/ui/shared/neuralRoamLabels.ts`, `src/ui/browser/{SRSBrowser.vue,neural/NeuralNavigationBar.vue}`, `src/ui/review/v2/{ReviewHeader.vue,ReviewView.vue}`, plus focused neural/i18n tests.
- Debt fixed now: Removed mixed Chinese translations for the four card-type names in the touched zh_CN surfaces; eliminated old `轨迹路径` and `Wake / 航迹` wording from the active browser/review chain in favor of `双链轨道` and `激活链路`; and centralized neural engine short/full label resolution so buttons, tooltips, and switch feedback no longer drift across slices or fall back to stale Chinese terminology.
- Debt deferred: The en_US glossary still keeps the existing English terms such as `Wake`, `Orbit Center`, and `Activation Source` outside the newly added full engine labels, and a few unused historical i18n keys remain broader than the narrowed zh_CN naming pass.
- Why deferred: This task was explicitly scoped to zh_CN naming convergence on the active browser/review path, and broad English glossary churn would widen a bounded UI copy pass into a cross-locale terminology project with larger regression surface.
- Next safe step: If you want the English side to match the new mental model too, do one follow-up that audits all neural roam en_US keys and component fallbacks together, then updates the remaining tests in one pass.
- Validation: `pnpm vitest run src/i18n/__tests__/en_US.neural-roam-label.test.ts src/i18n/__tests__/zh_CN.neural-roam-label.test.ts src/ui/browser/neural/__tests__/NeuralNavigationBar.test.ts src/ui/review/v2/__tests__/ReviewHeader.spec.ts src/ui/review/v2/__tests__/ReviewView.neural-nav-mode.spec.ts`; `pnpm build`.

### 2026-04-13 - rollback source-side super-block excerpt materialization

- Task: Remove the multi-block progressive excerpt behavior that first materialized a source-side super block, because the block mutations could destabilize SiYuan indexing and produce malformed live editor structure; keep multi-block excerpts themselves, but collapse visible tracking down to the first selected block reference.
- Touched slice: Progressive excerpt orchestration in `src/application/services/ProgressiveReadingService.ts`, excerpt-specific Siyuan port surface in `src/application/ports/ProgressiveSiyuanPort.ts` and `src/infrastructure/siyuan/ProgressiveSiyuanAdapter.ts`, plus focused excerpt regression coverage.
- Debt fixed now: Deleted the active source-document mutation path for multi-block excerpts so excerpting no longer inserts/moves/deletes source blocks; removed the excerpt-only DOM insert boundary that existed solely to support that materialization; and simplified visible tracking so multi-block excerpt bodies now append only the first source block reference while preserving full internal `sourceBlockIds` for dedupe and lineage.
- Debt deferred: Multi-block daily-note excerpts now anchor to the first inserted block because we no longer wrap them in a container block, so opening a daily-note excerpt jumps to that first block rather than to one synthetic grouped entity.
- Why deferred: Introducing a new non-super-block grouping anchor just for daily-note excerpts would widen this rollback into a larger excerpt-entity modeling change, and the current product goal is specifically to stop source/document corruption rather than redesign excerpt grouping.
- Next safe step: If users later need a stronger grouped jump target without reintroducing super blocks, add one follow-up that stores a lightweight logical excerpt range marker or explicit first-block-centered navigation metadata instead of mutating the document structure.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/services/__tests__/ExcerptRecordService.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/application/managers/__tests__/BlockMenuHandler.progressive-excerpt.test.ts`; `pnpm build`.

### 2026-04-13 - progressive excerpt super-block live DOM integrity fix

- Task: Fix multi-block progressive excerpts so the source-side and excerpt-side super blocks render as real editable block trees immediately after insertion instead of collapsing into one page-wide selectable region with missing block markers.
- Touched slice: Progressive excerpt source materialization and excerpt DOM construction in `src/application/services/ProgressiveReadingService.ts`, Siyuan move-block port wiring in `src/application/ports/ProgressiveSiyuanPort.ts` and `src/infrastructure/siyuan/ProgressiveSiyuanAdapter.ts`, plus focused regression coverage.
- Debt fixed now: Replaced the fake one-shot nested super-block insert with a native-shaped flow that first inserts an empty source super block, then moves full source blocks into it and inserts only the split boundary fragments as new child blocks; removed the non-native `protyle-action` stub from generated super-block DOM; and stamped valid SiYuan node IDs onto excerpt DOM before any direct API insertion so live websocket updates keep block markers and selection boundaries intact.
- Debt deferred: The new DOM-ID stamping utility is still heuristic and only understands `data-type="Node*"` block elements, so any future excerpt payload that embeds nonstandard block-like custom nodes may still need explicit ID rules at the boundary.
- Why deferred: Broadening the DOM normalizer to every custom/third-party block shape would widen this bounded multi-block excerpt repair into a general SiYuan DOM-schema synchronization project, and we do not yet have evidence that the active excerpt path needs that broader surface.
- Next safe step: If users later report malformed live rendering for other inserted rich block types, extract the DOM normalization helper into the Siyuan boundary and expand its block-shape registry with fixture coverage for those concrete payloads.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts`; `pnpm build`.

### 2026-04-13 - progressive excerpt super-block child normalization fix

- Task: Fix progressive excerpts failing with `源侧超级块创建后未能解析完整的子块结构` when SiYuan normalizes the newly inserted source-side super block into a different direct-child shape than the original multi-block selection.
- Touched slice: Progressive excerpt source materialization and source-highlighting in `src/application/services/ProgressiveReadingService.ts` and `src/application/entries/ProgressiveExcerptHighlight.ts`, plus focused regression coverage.
- Debt fixed now: Removed the brittle invariant that a freshly inserted source-side super block must expose exactly one direct child per original selected block; taught the materialization flow to keep the new canonical super-block anchor even when SiYuan wraps or merges children during insertion; and made prepared full-block highlighting understand super blocks so a container-level source highlight can still color every editable descendant with one stable block update.
- Debt deferred: We still do not reconstruct a semantic one-to-one mapping between each original selected block and each normalized descendant inside the new source super block when SiYuan rewrites the structure, so downstream logic only keeps a container-level highlight target in those cases.
- Why deferred: Recovering an exact per-selection descendant mapping after list/container normalization would widen this bounded excerpt bugfix into a more complex DOM/AST reconciliation pass that is not required to stop the hard failure and preserve the canonical source anchor.
- Next safe step: If users later need per-child post-materialization metadata inside normalized list/super-block structures, add one follow-up that walks the inserted subtree and derives stable descendant anchors from the persisted block tree instead of assuming direct-child parity.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/entries/__tests__/ProgressiveExcerptHighlight.test.ts`; `pnpm build`.

### 2026-04-13 - progressive excerpt source-side super-block materialization

- Task: Change all multi-block progressive excerpt entrypoints so they first materialize a real source-side SiYuan super block in the original document, then create the excerpt from that super block while keeping rich content and making the super block the canonical source anchor.
- Touched slice: Progressive excerpt selection/materialization/highlight flow in `src/application/entries/ProgressiveSelectionResolver.ts`, `src/application/services/{ProgressiveReadingService,SelectionExcerptService}.ts`, Siyuan block-mutation boundary in `src/application/ports/ProgressiveSiyuanPort.ts` and `src/infrastructure/siyuan/ProgressiveSiyuanAdapter.ts`, and editor/review/block-menu entrypoints in `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts`, `src/application/managers/BlockMenuHandler.ts`, and `src/ui/review/v2/ReviewView.vue`.
- Debt fixed now: Removed the still-virtual multi-block source model by materializing one real source-side super block before dedupe/highlight/excerpt creation; tightened boundary snapshots so cross-block selections retain `beforeHtml` / `afterHtml` data for exact first/last-block splitting; unified all active excerpt entrypoints on one materialization-first flow instead of keeping block-menu and text-selection side paths; and extended the active Siyuan adapter contract with DOM insertion rather than leaking source rewrites into UI-layer transaction code.
- Debt deferred: The new source-side materialization still rebuilds the selected region by inserting a new super block plus rewriting/deleting the original boundary blocks, instead of performing a true move-preserving block transaction with stable child identities; exact super-block reuse is intentionally strict and only kicks in for full-block selections that already equal all children of one existing super block.
- Why deferred: Preserving original child block identities across partial splits would widen this bounded excerpt-flow repair into a much larger SiYuan block-transaction/original-id reconciliation project, and broadening reuse heuristics now would risk accidental matches across nested or partially-selected super blocks before we have a stronger structural anchor model.
- Next safe step: If users need stronger lineage continuity inside the source document, add one follow-up that teaches the Siyuan port a true split-and-move transaction so multi-block materialization can keep more original child ids while still producing one canonical super-block anchor.
- Validation: `pnpm vitest run src/application/entries/__tests__/ProgressiveSelectionResolver.test.ts src/application/entries/__tests__/ProgressiveExcerptHighlight.test.ts src/application/services/__tests__/ExcerptRecordService.test.ts src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts src/application/managers/__tests__/BlockMenuHandler.progressive-excerpt.test.ts src/application/managers/__tests__/MenuManager.topbar-menu-render.test.ts`; `pnpm build`.

### 2026-04-13 - multi-block progressive excerpts and record-center removal

- Task: Let progressive excerpting work across multiple selected blocks, preserve the original rich inline/block structure inside excerpt artifacts, add a whole-block `摘录` action to the block menu for multi-block selection, and remove the excerpt record-center UI while keeping internal dedupe records.
- Touched slice: Progressive excerpt selection/highlight/orchestration in `src/application/entries/{ProgressiveSelectionResolver,ProgressiveExcerptHighlight}.ts`, `src/application/services/{ProgressiveReadingService,ExcerptRecordService}.ts`, editor/review/block-menu entrypoints in `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts`, `src/ui/review/v2/ReviewView.vue`, `src/application/managers/BlockMenuHandler.ts`, and excerpt-center wiring removal in `src/application/{interfaces/IDialogManager.ts,managers/DialogManager.ts,managers/MenuManager.ts}` plus `src/index.ts`.
- Debt fixed now: Removed the single-block-only excerpt assumption from the active selection pipeline; stopped flattening excerpt content down to plain text so links and other inline structure survive into excerpt docs/blocks; unified duplicate detection around ordered `sourceBlockIds` plus normalized text fingerprints instead of only one anchor block; and deleted the now-obsolete excerpt-center dialog/command/menu entry instead of keeping a second management path alive beside the active excerpt entry surfaces.
- Debt deferred: Multi-block excerpt anchoring and replay still depend on live block order/DOM snapshots rather than a durable offset-anchor model, and rich excerpt persistence/highlight replay still assume the source blocks have not materially changed between capture and async write-back.
- Why deferred: A durable cross-block anchor model would widen this bounded excerpt flow repair into a larger selection-serialization/concurrency project, and adding content-version conflict detection would extend the current feature fix into a broader editor-state reconciliation layer.
- Next safe step: If users report stale jump/highlight behavior after editing the source between selection and excerpt creation, add one follow-up that records per-block offset anchors or content hashes and validates them before replaying highlight or duplicate jumps.
- Validation: `pnpm vitest run src/application/entries/__tests__/ProgressiveSelectionResolver.test.ts src/application/entries/__tests__/ProgressiveExcerptHighlight.test.ts src/application/services/__tests__/ExcerptRecordService.test.ts src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts src/application/managers/__tests__/BlockMenuHandler.progressive-excerpt.test.ts src/application/managers/__tests__/MenuManager.topbar-menu-render.test.ts`; `pnpm build`.

### 2026-04-13 - browser all-cards hierarchy snapshot and reload de-dup

- Task: Fix the browser bug where opening the default `全部闪卡` view only showed a partial left-side document list until the user toggled to `已暂停` and back, and remove the duplicate reloads caused by explicit browser navigation handlers and reactive watchers racing each other.
- Touched slice: Browser state orchestration in `src/ui/browser/SRSBrowser.vue`, internal hierarchy snapshot policy in `src/ui/browser/hierarchySnapshotPlan.ts`, and focused browser regression coverage for hierarchy snapshots and global view switching.
- Debt fixed now: Wired the previously-declared `snapshotDelayMs` option into the real hierarchy snapshot flow; split hierarchy refresh behavior into focus/all/none modes so all-cards uses a delayed full snapshot instead of the first infinite-grid page; added explicit invalidation for stale hierarchy snapshot work between reloads; and made `handleSelectGlobal()` / `handleSelectQueue()` own their programmatic state transitions under the existing watcher-suspend guard so they no longer trigger duplicate reloads through `currentPreset` / `currentCardType` / `searchQuery` watchers.
- Debt deferred: `SRSBrowser.vue` still owns a large amount of browser state, async loading, and navigation orchestration in one component, and the real `BrowserHierarchy.vue` title-resolution path still relies on its own async doc-title fetch behavior instead of sharing a dedicated browser read-model.
- Why deferred: Extracting browser orchestration out of `SRSBrowser.vue` would widen this bounded browser bugfix into a larger UI architecture refactor, while reworking document-title resolution would extend a state-flow fix into a broader browser read-model project that is not required to stop the missing-doc regression.
- Next safe step: If more browser hierarchy regressions appear, extract the hierarchy snapshot/navigation state machine into a dedicated browser controller or composable, then add one higher-level integration test that runs through the real `BrowserHierarchy.vue` title-fetch path instead of a focused browser stub.
- Validation: `pnpm vitest run src/ui/browser/__tests__/SRSBrowser.hierarchy-regression.spec.ts src/ui/browser/__tests__/hierarchySnapshotPlan.test.ts`; `pnpm build`.

### 2026-04-13 - progressive reading native riff sync and topic continuation redesign

- Task: Redesign progressive reading so split-piece Topics, excerpt Topics, and Topic-derived Items become real SiYuan native Riff cards immediately; let excerpt-inside-Topic create child Topics with explicit lineage; and let quick-symbol continuation inside Topic contexts create child Items without being blocked by existing Topic Xiuyuan bindings.
- Touched slice: Progressive reading orchestration in `src/application/services/{ProgressiveReadingService,TopicDerivedItemService,ProgressiveSourceContextResolver.ts}`, native Riff wiring in `src/application/ports/ProgressiveNativeRiffPort.ts`, `src/infrastructure/siyuan/ProgressiveNativeRiffAdapter.ts`, and `src/application/ApplicationContext.ts`, plus Topic continuation routing in `src/application/handlers/AutoCardHandler.ts` and focused regression coverage.
- Debt fixed now: Removed the half-synced progressive path where local Topic/Item records existed without native Riff registration; unified Topic/excerpt context resolution so ordinary docs, piece docs, excerpt docs, excerpt blocks, and Topic docs share one lineage decision path; preserved `parentTopicCardId` / `parentExcerptId` on nested excerpts instead of inferring hierarchy from storage location; and made Topic continuation ignore Topic-owned Xiuyuan bindings while still protecting non-Topic Xiuyuan blocks.
- Debt deferred: Progressive rollback currently removes the newly created doc/block and local card but can still leave reused or newly created empty workbench containers in place, and progressive native Riff sync still assumes `addRiffCards()` is idempotent without a dedicated read-back verification layer.
- Why deferred: Cleaning up empty workbench containers safely would widen this bounded progressive repair into a broader container-lifecycle policy change, while adding native Riff read-back verification would extend the current creation-path fix into a larger sync-observability project.
- Next safe step: If users still report stranded progressive containers or deck drift, add one follow-up that tracks whether the current workbench container was created inside the failing transaction and prunes it when empty, then layer a small native Riff verification/read-model probe on top of the new progressive sync port.
- Validation: `pnpm vitest run src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/services/__tests__/TopicDerivedItemService.test.ts src/application/handlers/__tests__/AutoCardHandler.topic-derivation.test.ts src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts`; `pnpm build`.

### 2026-04-13 - remove srs dialog grade preview strip

- Task: Remove the compact inspector's grade preview strip from `编辑 SRS 数据` after it proved visually redundant, while keeping the rest of the dialog's compact inspector layout and existing edit actions intact.
- Touched slice: Review/SRS UI in `src/ui/srs/SrsEditorDialog.vue` plus focused dialog regression coverage in `src/ui/srs/__tests__/SrsEditorDialog.spec.ts`.
- Debt fixed now: Removed a non-essential transparency layer that added visual weight and extra local UI state (`selectedPreviewRating` / shared preview detail) without helping the main edit task; simplified the dialog's first-screen reading order back to overview, state summary, and actions; and deleted the now-dead preview-specific styling so the compact inspector has fewer layout branches to maintain.
- Debt deferred: `SrsTransparencyApplicationService` still computes `gradePreviews` even though the dialog no longer renders them, and the preview-related i18n keys remain in the locale files for now.
- Why deferred: Removing `gradePreviews` from the transparency view model would widen this bounded UI simplification into an application-level contract change that could affect future inspector ideas, while pruning the locale keys is low-value churn compared with the current product/UI fix.
- Next safe step: If we later decide the transparency model should be slimmer, audit every consumer of `SrsTransparencyViewModel` first and then remove unused preview fields and locale keys in one dedicated cleanup.
- Validation: `pnpm vitest run src/ui/srs/__tests__/SrsEditorDialog.spec.ts`; `pnpm build`.

### 2026-04-12 - compact srs inspector dialog

- Task: Refactor the review-side `编辑 SRS 数据` dialog from a large multi-panel workbench into a compact inspector that shows overview, rating preview, state summary, primary actions, and folded secondary sections without changing scheduler data flow.
- Touched slice: Review/SRS UI in `src/ui/srs/SrsEditorDialog.vue`, dialog entry sizing in `src/ui/review/v2/ReviewView.vue` and `src/application/managers/BlockMenuHandler.ts`, supporting i18n copy, and focused dialog component regression coverage.
- Debt fixed now: Removed the oversized hero/quick-edit/snapshot duplication that made the dialog read like a second workstation; merged repeated state surfaces into one compact summary; replaced four large preview cards with one shared-detail preview strip; and aligned both dialog entrypoints on the same smaller inspector-sized shell instead of keeping a layout optimized for the previous heavyweight panel.
- Debt deferred: Secondary editor sections still rely on native `details` folding with all content mounted in the DOM, and the compact inspector still rebuilds its overview from the same snapshot/transparency model instead of introducing a more opinionated SRS-specific read-model contract.
- Why deferred: Virtualizing or unmounting folded content would widen this bounded UI compaction into a broader component-state/accessibility pass, while a new read-model contract would expand a layout refactor into an application-layer redesign that the current task explicitly avoids.
- Next safe step: If users still want even less visual noise, add one follow-up that threads review-session `nextDues` into the dialog when available and trims the folded sections further by hiding storage-only metadata behind a second developer-only disclosure.
- Validation: `pnpm vitest run src/ui/srs/__tests__/SrsEditorDialog.spec.ts`; `pnpm build`.

### 2026-04-12 - fsrs review-state sanitation and invalid due hard-fail

- Task: Fix the misleading FSRS v6 review-card scheduling path where corrupted review-state fields (`NaN` stability/scheduledDays and drifted elapsedDays) could make `ts-fsrs` emit invalid preview/review due dates that our adapter silently masked as fake `+1 day` schedules.
- Touched slice: Scheduler core in `src/core/scheduler/strategies/TSFSRSScheduler.ts` plus focused regression coverage in `src/core/scheduler/strategies/__tests__/{TSFSRSScheduler.test.ts,TSFSRSScheduler.shortterm.test.ts}`.
- Debt fixed now: Removed the active-path fallback that converted invalid `ts-fsrs` output into deceptive one-day due dates; normalized dirty review-card state before entering `ts-fsrs` so preview/review/retrievability share the same repaired invariants; and restored short-term `learning_step` write-back so scheduler state no longer drops a live learning-step signal on the round-trip back into our card model.
- Debt deferred: Dirty FSRS state is still repaired heuristically inside `TSFSRSScheduler` instead of being surfaced as an explicit card-health diagnostic or repaired at persistence boundaries, and preview cache keys still only depend on card id plus minute instead of the full scheduler state snapshot.
- Why deferred: Adding explicit card-health diagnostics would widen this bounded scheduler bugfix into a broader editor/persistence UX project, while stronger preview-cache invalidation semantics are a separate scheduler-performance contract change that is not required to stop the fake one-day outputs.
- Next safe step: If more corrupted scheduler snapshots surface, add one lightweight diagnostic/read-model warning in the SRS transparency layer that flags repaired FSRS fields to the user or developer without reintroducing fallback scheduling behavior.
- Validation: `pnpm vitest run src/core/scheduler/strategies/__tests__/TSFSRSScheduler.test.ts src/core/scheduler/strategies/__tests__/TSFSRSScheduler.shortterm.test.ts`; `pnpm build`.

### 2026-04-12 - review srs transparency layer in existing editor dialog

- Task: Borrow Incrementum's explanation-first transparency idea without importing its queue/store architecture, by upgrading the existing review-side `编辑 SRS 数据` dialog into a single live-path transparency + editing surface for `fsrs-v6`, `sm15`, and `a-factor-v2`.
- Touched slice: Review/SRS UI in `src/ui/srs/SrsEditorDialog.vue`, application read-model assembly in `src/application/services/SrsTransparencyApplicationService.ts`, shared next-due formatting in `src/application/helpers/formatNextDue.ts`, active wiring in `src/application/ApplicationContext.ts`, existing review preview consumer in `src/application/adapters/UnifiedQueueStrategy.ts`, i18n, and focused regression coverage.
- Debt fixed now: Removed the drift risk where the SRS editor had no active-path explanation model and would have encouraged UI-side scheduler recomputation; centralized transparency assembly in one read-only application service; made the dialog reuse the same scheduler preview semantics as review next-due previews; and shared the next-due formatter between queue preview generation and the new transparency layer instead of duplicating the relative-time rules.
- Debt deferred: The transparency layer still recomputes previews from the scheduler router instead of reusing already-materialized `nextDues` from an active review session when available, and algorithm-specific facts are still a compact summary rather than a full inspector with deeper per-scheduler breakdowns.
- Why deferred: Threading session-local `nextDues` through the existing dialog open path would widen this bounded transparency upgrade into a larger review-session state plumbing change, while a richer inspector would turn the current explanation-first enhancement into a broader product/UI redesign.
- Next safe step: If users want even tighter alignment with the live review surface, pass the already-computed review `nextDues` into the dialog open flow when the current card came from an active session, and let the transparency service fall back to router preview only when session previews are absent.
- Validation: `pnpm vitest run src/application/services/__tests__/SrsTransparencyApplicationService.test.ts src/ui/srs/__tests__/SrsEditorDialog.spec.ts`; `pnpm build`.

### 2026-04-09 - excerpt highlight prepared block transaction path

### 2026-04-09 - excerpt highlight adapter-backed block update path

- Task: Replace the still-unreliable progressive excerpt source-color persistence path with one that applies the already-prepared highlighted block DOM through the active Progressive Siyuan adapter and `/block/updateBlock`, so excerpt source coloring follows the same storage-level update path that makes equivalent manual edits visibly stick.
- Touched slice: Progressive excerpt source-highlighting in `src/application/entries/ProgressiveExcerptHighlight.ts`, progressive Siyuan integration in `src/application/ports/ProgressiveSiyuanPort.ts` and `src/infrastructure/siyuan/ProgressiveSiyuanAdapter.ts`, excerpt orchestration in `src/application/services/{ProgressiveReadingService,SelectionExcerptService}.ts`, editor/review callers in `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts` and `src/ui/review/v2/ReviewView.vue`, plus focused regression coverage.
- Debt fixed now: Removed the remaining dependence on Protyle `updateTransaction` as the persistence mechanism for excerpt source colors; pushed prepared source-highlight block writes onto the active adapter-backed DOM update contract; unified editor and review highlight replay around the same selection-excerpt service boundary instead of each surface persisting source DOM ad hoc; and added one bounded live-block refresh step so a successful storage-level update is reflected immediately in the current editor surface.
- Debt deferred: Highlight preparation still assumes the source block has not changed between selection capture and block update, and current view refresh still relies on one best-effort local block replacement plus optional Protyle reload instead of a stronger editor-state reconciliation contract.
- Why deferred: Adding optimistic concurrency checks or a broader editor-state reconciliation layer would widen this bounded storage-path repair into a larger cross-surface synchronization project beyond the active excerpt bug.
- Next safe step: Validate the new adapter-backed source-color path in a real SiYuan desktop session; if users still hit misses on actively edited blocks, add one lightweight source-block version check before `updateDomBlock` and surface a retry message when the block changed under the prepared highlight.
- Validation: `pnpm vitest run src/application/entries/__tests__/ProgressiveExcerptHighlight.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts src/application/services/__tests__/ProgressiveReadingService.test.ts`; `pnpm build`.

### 2026-04-09 - excerpt highlight prepared block transaction path

- Task: Replace the still-unreliable progressive excerpt source-color replay with a more stable path that prepares the exact block HTML mutation before async excerpt creation, then commits the prepared highlight through the active Protyle block transaction after creation or duplicate detection.
- Touched slice: Progressive excerpt source-highlighting in `src/application/entries/ProgressiveExcerptHighlight.ts`, editor/review excerpt orchestration in `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts` and `src/ui/review/v2/ReviewView.vue`, plus focused regression coverage.
- Debt fixed now: Removed the remaining dependency on excerpt completion leaving a live DOM selection/range behind; switched source highlighting from post-hoc toolbar replay to a deterministic prepared block mutation with `span[data-type="text"]` and `background-color: var(--b3-font-background4)` already baked in; aligned editor/review duplicate handling so an already-existing excerpt can still restamp the visible source highlight instead of skipping coloring entirely; and forced a Protyle reload after the prepared transaction so persisted source colors are re-rendered immediately instead of waiting on editor cache invalidation.
- Debt deferred: The stable path still assumes the selected source block remains unchanged between highlight preparation and transaction application, and it still depends on an active Protyle `updateTransaction` contract instead of a storage-level block-update adapter.
- Why deferred: Adding content-version conflict detection or moving highlight persistence onto a broader adapter-level block-update path would widen this bounded excerpt-entry repair into a larger concurrency and integration-policy project.
- Next safe step: If users still hit missed colors in surfaces without an active Protyle transaction contract, extract one progressive source-highlight persistence port that can apply the already-prepared block HTML through an adapter-backed block update after checking for concurrent block changes.
- Validation: `pnpm vitest run src/application/entries/__tests__/ProgressiveExcerptHighlight.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts`; `pnpm build`.

### 2026-04-09 - excerpt highlight persistence fallback

- Task: Diagnose why progressive excerpts still left no visible source background color after creation, and make the source highlight path persist the requested `var(--b3-font-background4)` styling even when SiYuan's native inline-mark replay does not materialize a block mutation.
- Touched slice: Progressive excerpt source-highlighting in `src/application/entries/ProgressiveExcerptHighlight.ts` plus focused regression coverage in `src/application/entries/__tests__/ProgressiveExcerptHighlight.test.ts`.
- Debt fixed now: Removed the false-positive path where `Toolbar.setInlineMark(... backgroundColor ...)` could be called successfully yet leave no durable source mutation; taught the highlight entry to verify that the target block actually gained the expected text-background styling; and added one bounded fallback that wraps the live selected range in `span[data-type="text"]` with `background-color: var(--b3-font-background4)` and commits it through the active Protyle transaction path instead of reviving mark/cloze syntax.
- Debt deferred: The fallback still operates on the live DOM selection range rather than a serialized offset anchor, and it currently assumes the active Protyle instance exposes `updateTransaction` so there is no secondary persistence path when that editor contract is absent.
- Why deferred: Converting progressive excerpt highlights onto durable offset anchors would widen this bounded source-color repair into a larger selection-anchor project, while adding another non-Protyle persistence path would broaden the active editor integration fix into cross-surface mutation-policy work.
- Next safe step: If highlight persistence still misses in additional surfaces, extract one dedicated range-to-inline-style persistence helper with a proper serialized anchor model before widening beyond the active Protyle transaction contract.
- Validation: `pnpm vitest run src/application/entries/__tests__/ProgressiveExcerptHighlight.test.ts`; `pnpm build`.

### 2026-04-09 - source-child excerpt storage and editor menu entry completion

- Task: Finish the progressive excerpt follow-up by making “在原文档块目录下” a first-class storage mode, fixing live source coloring stability, adding excerpt-center access to the topbar right-click menu, and exposing editor selected-text right-click excerpting without relying on the hotkey toggle.
- Touched slice: Progressive excerpt entry and coloring in `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts`, `src/application/entries/ProgressiveExcerptHighlight.ts`, and `src/index.ts`; excerpt storage orchestration in `src/application/services/{ConfiguredCaptureStorageService,ProgressiveReadingService}.ts`; progressive settings schema/defaults/normalization in `src/types/settings.ts` plus `src/ui/settings/SettingsPanel.vue`; topbar menu wiring in `src/application/managers/MenuManager.ts`; i18n and focused regression coverage.
- Debt fixed now: Removed the product mismatch where the UI only exposed library/daily-note even though excerpts still silently fell back to source-adjacent docs; stabilized source-color replay for text-wrapped selections by retrying the native background-color mark path instead of falling back to cloze-sensitive mark syntax; unified editor hotkey and selected-text menu excerpt creation behind one shared action path; and surfaced excerpt-center access on the active topbar context menu instead of leaving it command-only.
- Debt deferred: The editor selected-text menu entry still depends on live DOM selection snapshots at menu-open time rather than a more explicit persisted selection contract, source-child mode still preserves but ignores notebook/target-block fields instead of clearing them on mode switch, and excerpt center still lives only in the plugin topbar menu rather than an editor-top-right selection toolbar.
- Why deferred: A stronger selection contract would widen this bounded editor-entry task into deeper editor/session integration work, auto-clearing ignored fields is a product-state decision that could surprise users who expect values to be restored when switching back to library/daily-note, and adding another editor-surface management entry would broaden the current menu cleanup into a larger interaction design pass.
- Next safe step: If users want even more local excerpt controls, extract one dedicated editor excerpt-entry service that can back the right-click menu, any future editor-toolbar affordance, and stronger active-selection lifecycle handling without duplicating DOM discovery.
- Validation: `pnpm vitest run src/application/entries/__tests__/ProgressiveExcerptHighlight.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/application/managers/__tests__/MenuManager.topbar-menu-render.test.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/types/__tests__/settings-normalization.test.ts src/application/services/__tests__/ProgressiveReadingService.test.ts`; `pnpm vitest run src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts src/__tests__/topbar-contextmenu.test.ts`; `pnpm build`.

### 2026-04-09 - progressive excerpt source coloring and record center

- Task: Make progressive excerpts behave more like SuperMemo by writing a real background color back to the live source selection after excerpt creation, prevent duplicate excerpts on the same source block/text, and add a standalone excerpt record center for jumping, archiving, and deleting excerpt entities without removing source coloring.
- Touched slice: Excerpt persistence and dedupe orchestration in `src/application/services/{ExcerptRecordService,ProgressiveReadingService,SelectionExcerptService}.ts`, editor/review entry handling in `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts` and `src/ui/review/v2/ReviewView.vue`, source-color replay in `src/application/entries/ProgressiveExcerptHighlight.ts`, dialog/command wiring in `src/application/{ApplicationContext.ts,interfaces/IDialogManager.ts,managers/DialogManager.ts}` plus `src/index.ts`, tab navigation in `src/application/services/TabApplicationService.ts`, new record-center UI in `src/ui/progressive/ExcerptRecordCenterDialog.vue`, i18n, and focused regression coverage.
- Debt fixed now: Removed the old “highlight is just best-effort UI replay with no durable excerpt index” gap by adding a file-backed excerpt record registry keyed by normalized source-block fingerprints; stopped duplicate excerpt creation before new doc/block/card side effects run; unified editor and review excerpt callers around discriminated `created/duplicate` outcomes; switched the persisted excerpt highlight token onto the SiYuan theme background variable instead of a plugin-only RGBA literal; and added one bounded management surface for source jump, excerpt jump, archive, and delete so users can manage excerpt artifacts without mutating source highlights.
- Debt deferred: Record-center stale detection still uses normalized `getBlockKramdown()` substring matching instead of a first-class range anchor, archive/delete still assume the excerpt entity can be removed through the generic block deletion path without a richer “already missing / partially deleted” recovery policy, and excerpt source coloring is still fixed to `var(--b3-font-background4)` instead of a documented user setting.
- Why deferred: Introducing durable range anchors or reversible color accounting would widen this bounded SM-style visibility slice into a more invasive anchoring and overlap-management project, robust missing-entity recovery would need a broader excerpt/card lifecycle contract, and making excerpt colors configurable would expand a core behavior repair into settings/product design work that the current plan explicitly left out.
- Next safe step: If users still need more precise excerpt lifecycle control, add one dedicated excerpt-anchor contract that can round-trip live selections into stable offsets before attempting overlap-aware recolor/decolor or richer stale recovery, and only then decide whether color should become user-configurable.
- Validation: `pnpm vitest run src/application/services/__tests__/ExcerptRecordService.test.ts src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts src/ui/progressive/__tests__/ExcerptRecordCenterDialog.test.ts`; `pnpm build`.

### 2026-04-09 - hydrate configured library doc info before excerpt creation

- Task: Fix progressive excerpts failing in configured library mode on some devices with `无法解析固定库摘录目标路径`, caused by incomplete doc metadata returned for the configured parent document.
- Touched slice: Configured capture storage resolution in `src/application/services/ConfiguredCaptureStorageService.ts` and focused regression coverage in `src/application/services/__tests__/ConfiguredCaptureStorageService.test.ts`.
- Debt fixed now: Removed the hidden assumption that `getDocInfo` always returns a usable `hpath` for configured library docs; centralized a SQL-backed hydration step so feature-root docs and explicit target docs are both normalized before progressive excerpt or AI draft flows consume them; and fixed the active shared storage path instead of adding an excerpt-only fallback branch.
- Debt deferred: `ProgressiveReadingService` still carries its own similar doc-info hydration helper instead of both slices sharing one adapter-level normalization path.
- Why deferred: Moving doc-info normalization into a shared infrastructure helper would touch multiple ports/adapters across the progressive slice and widen this bounded production bugfix beyond the configured-capture path that is actually failing in 3.6.0.
- Next safe step: If more `getDocInfo` shape drift shows up elsewhere, extract one shared Siyuan doc-info normalization utility and migrate both `ConfiguredCaptureStorageService` and `ProgressiveReadingService` onto it in a dedicated refactor.
- Validation: `pnpm vitest run src/application/services/__tests__/ConfiguredCaptureStorageService.test.ts`; `pnpm build`.

### 2026-04-09 - remove progressive excerpt Daily Notes trace feature

- Task: Remove the progressive excerpt "Daily Notes trace" feature so excerpts no longer create extra Daily Notes index artifacts, and remove the related settings/UI surface instead of leaving a dead optional toggle behind.
- Touched slice: Progressive excerpt persistence in `src/application/services/ProgressiveReadingService.ts`, progressive settings schema/validation/normalization in `src/types/settings.ts` and `src/application/services/SettingsService.ts`, settings UI in `src/ui/settings/SettingsPanel.vue`, i18n copy, and focused regression coverage.
- Debt fixed now: Removed the user-facing setting that no longer matched the new configured storage model; stopped honoring the old runtime branch that appended Daily Notes trace blocks after excerpt creation; and deleted a now-dead cluster of Daily Notes trace repair/helpers in `ProgressiveReadingService` instead of keeping dormant legacy scaffolding around the active excerpt path.
- Debt deferred: Legacy trace attrs/constants still remain in `core/siyuan/block.ts` because they are still referenced by non-excerpt concepts/neural queries and older data may still exist in user workspaces, and historical backlog entries still mention Daily Notes trace as past behavior.
- Why deferred: Removing the cross-slice legacy attr vocabulary would widen this bounded feature removal into a broader storage/query compatibility audit, while rewriting historical backlog entries would make the debt ledger less truthful about prior architecture states.
- Next safe step: If we later decide to fully retire all legacy Daily Notes trace data, audit `core/queue/neural` and any surviving attr readers first, then do one explicit compatibility cleanup for the old trace attrs and query semantics.
- Validation: `pnpm vitest run src/types/__tests__/settings-normalization.test.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/application/services/__tests__/ProgressiveReadingService.test.ts`; `pnpm build`.

### 2026-04-09 - clearer Topic continuation naming in settings and feedback

- Task: Rename the user-facing "Topic 派生练习 / Topic-derived practice" wording to clearer "Topic 下继续制卡 / Continue card creation under Topic" copy so users do not confuse this quick-card behavior with progressive excerpts.
- Touched slice: User-visible wording in `src/ui/settings/SettingsPanel.vue`, `src/i18n/{zh_CN,en_US}.json`, and quick-card feedback/error messages in `src/application/{handlers/AutoCardHandler.ts,services/TopicDerivedItemService.ts}`, plus focused regression coverage in settings and topic-routing tests.
- Debt fixed now: Removed the main UX ambiguity where the feature name sounded like an excerpt variant instead of "keep the current Topic and continue creating cards under it"; aligned the settings title, toggle label, storage hint, success toast, and one surfaced error message around the same continuation mental model; and kept internal config/schema names stable so the wording cleanup does not create migration churn.
- Debt deferred: Internal symbol/type names still use `topicDerivation`, and other developer-facing comments/tests continue to use "derivation" terminology even though the UI now presents the feature as continuing card creation under Topic.
- Why deferred: Renaming internal settings keys and type/service symbols would widen this bounded copy clarification into a behavior-neutral but high-churn refactor with compatibility surface and little user-facing value.
- Next safe step: If the new wording proves clearer, do one separate implementation-level cleanup that renames `topicDerivation` internals behind an explicit compatibility plan instead of mixing that churn into this UI copy pass.
- Validation: `pnpm vitest run src/ui/settings/__tests__/SettingsPanel.test.ts src/application/handlers/__tests__/AutoCardHandler.topic-derivation.test.ts`; `pnpm build`.

### 2026-04-09 - xiuyuan startup blank riff question fail-open

- Task: Let Xiuyuan startup and sync survive Riff cards whose block IDs are valid but whose question content is blank or zero-width-only, instead of aborting plugin initialization with `Question cannot be empty`.
- Touched slice: Xiuyuan active sync path in `src/application/services/XiuyuanSyncService.ts`, focused malformed-input coverage in `src/application/services/__tests__/XiuyuanSyncService.malformed-riff-input.test.ts`, and backlog truth sync.
- Debt fixed now: Extended the existing malformed-Riff preparation step to reject blank/zero-width-only question content before any create/save path runs; unified the malformed log path so blank-question cards reuse the same skipped-count / partial-snapshot protections as bad block IDs; and removed the Riff single-face placeholder fallback that previously synthesized `Block <id>` pseudo-questions instead of enforcing real content.
- Debt deferred: Other non-Riff Xiuyuan creation paths still contain legacy `Block <id>` placeholder question/answer fallbacks, so placeholder-text cleanup is not yet consistent outside the active Riff startup/sync path.
- Why deferred: The user-facing crash lived specifically in the Xiuyuan Riff startup flow, while widening this change into all other Xiuyuan creation entrypoints would be a broader cross-slice behavior decision with more compatibility surface than this bounded fail-open repair needs.
- Next safe step: Audit the remaining non-Riff Xiuyuan creation paths that still use `Block <id>` fallbacks and decide, slice by slice, whether they should hard-fail on blank content or migrate onto one shared explicit blank-block policy.
- Validation: `pnpm vitest run src/application/services/__tests__/XiuyuanSyncService.malformed-riff-input.test.ts src/application/services/__tests__/XiuyuanSyncService.card-type-sync.test.ts`; `pnpm build`.

### 2026-04-08 - configurable storage strategy for excerpts and AI drafts

- Task: Unify progressive excerpts and AI-assisted card drafts behind one explicit configured storage strategy so each flow can save either into a fixed notebook/library target or into a chosen notebook's Daily Notes, instead of mixing source-adjacent docs, workspace docs, and source-derived Daily Note routing.
- Touched slice: Shared configured-capture storage contracts/services in `src/application/{ports,services}` and `src/infrastructure/siyuan`, settings schema/normalization and settings UI in `src/types/settings.ts` plus `src/ui/settings/SettingsPanel.vue`, excerpt persistence in `src/application/services/ProgressiveReadingService.ts`, AI draft persistence/workbench copy in `src/application/services/{AIDailyNoteDraftService,AIWorkbenchService}.ts` and `src/ui/ai/AiWorkbenchPane.vue`, dialog wiring in `src/application/{ApplicationContext.ts,managers/DialogManager.ts}`, and focused regression coverage.
- Debt fixed now: Replaced the previous split storage behavior where excerpts and AI drafts each inferred their own save location differently; introduced one shared storage model (`library` vs `daily-note`, fixed notebook, optional target block); moved Daily Note resolution onto a native helper instead of path templating for the new configured flows; allowed excerpt results to point to either docs or blocks so Daily Note excerpts can remain block-native; and removed AI workbench copy/runtime assumptions that drafts always live in Daily Notes.
- Debt deferred: Legacy installs still retain one compatibility branch when the new storage fields have never been configured, excerpt library mode still only accepts document targets instead of richer hpath/ordinary-block destinations, and `AIDailyNoteDraftService` keeps its Daily Note-biased class name even though it now handles library storage as well.
- Why deferred: Hard-cutting old installs off from legacy routing would be risky without a migration UX, widening excerpt library targets would broaden this bounded storage-policy task into a larger placement product/design surface, and renaming the AI draft service would spread churn across stable call sites without changing runtime behavior.
- Next safe step: If the explicit storage settings prove stable in daily use, add one focused migration pass that retires the legacy compat branch after first save, then decide whether excerpt placement needs hpath/ordinary-block targets and whether the AI draft service should be renamed to reflect its now storage-neutral role.
- Validation: `pnpm vitest run src/application/services/__tests__/ConfiguredCaptureStorageService.test.ts src/application/services/__tests__/ProgressiveReadingService.test.ts src/application/services/__tests__/AIDailyNoteDraftService.test.ts src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/types/__tests__/settings-normalization.test.ts`; `pnpm vitest run src/ui/settings/__tests__/SettingsPanel.test.ts src/application/managers/DialogManager.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts`; `pnpm build`.

### 2026-04-08 - progressive excerpt static anchors and safe source highlighting

- Task: Finish the progressive excerpt stabilization work by fixing excerpt source anchor text so excerpt docs render `原文 *` instead of expanding the source block inline, and by replaying excerpt selections into a plugin-owned non-mark source highlight right after excerpt creation across editor and review entrypoints.
- Touched slice: Progressive excerpt selection/highlight wiring in `src/application/entries/{ProgressiveSelectionResolver,ProgressiveExcerptHighlight}.ts` and `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts`, review excerpt orchestration in `src/ui/review/v2/ReviewView.vue`, excerpt doc rendering in `src/application/services/ProgressiveReadingService.ts`, plus focused regression coverage.
- Debt fixed now: Removed the local excerpt/render mismatch where source suffix refs used a dynamic block-ref subtype and therefore expanded into redundant full-text anchors; introduced one shared live selection snapshot shape so editor/review excerpt paths no longer duplicate selection replay concerns; and kept auto-card isolation by applying excerpt source highlights through non-`mark` Protyle text background styling instead of reusing cloze-sensitive mark syntax.
- Debt deferred: Command-palette fallback highlight still depends on best-effort native Protyle discovery from the live DOM, and the highlight color is still a hard-coded plugin constant rather than a documented progressive-reading setting or theme token policy.
- Why deferred: A first-class app-wide “current active Protyle” contract does not yet exist on the active path, while making excerpt highlight user-configurable would widen this bounded behavior fix into a settings/product decision beyond the current source-anchor and safe-highlighting repair.
- Next safe step: If command-palette fallback still misses highlights in some editor surfaces, extract one shared active-Protyle locator at the plugin/application boundary and then decide whether excerpt highlight color belongs in progressive-reading settings or should stay as a fixed plugin affordance.
- Validation: `pnpm vitest run src/application/entries/__tests__/ProgressiveExcerptHighlight.test.ts src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts src/application/services/__tests__/ProgressiveReadingService.test.ts`; `pnpm build`.

### 2026-04-08 - stable progressive excerpt command and shortcut routing

- Task: Replace the fragile review/editor `Alt+X` piggyback path with one officially registered progressive excerpt command that keeps Siyuan native `Alt+X` untouched and uses plugin-owned `⌥⇧X` routing across editor, review, command palette, and keymap settings.
- Touched slice: Progressive excerpt command wiring in `src/index.ts` and `src/application/handlers/ProgressiveExcerptHotkeyHandler.ts`, review-surface excerpt handling in `src/ui/review/v2/ReviewView.vue`, plus focused i18n/settings/test coverage for the new shortcut semantics.
- Debt fixed now: Removed the device-specific global `document.keydown` interception that depended on native `Alt+X` behavior and timing; registered excerpting as a first-class Siyuan command with `editorCallback` plus generic `callback`; unified review and editor excerpt entrypoints behind one command/request flow so command palette and remapped keymaps can trigger the same behavior; and updated user-facing copy/tests so the plugin now advertises `⌥⇧X` while leaving native `Alt+X` to Siyuan recent appearance.
- Debt deferred: The settings model still stores the enable flag under the legacy `progressiveReading.altXExcerptEnabled` name, and review/editor excerpt invocation still depends on DOM selection resolution instead of a higher-level shared selection/session abstraction.
- Why deferred: Renaming persisted settings would widen this bounded shortcut-stability repair into a migration task with compatibility risk, while introducing a shared selection abstraction would cut across editor/review/application boundaries well beyond the hotkey registration problem being fixed here.
- Next safe step: If this command path stays stable, do one follow-up that renames the persisted setting to a shortcut-neutral field via explicit migration and then evaluate whether review/editor selection capture should move behind a shared excerpt invocation service.
- Validation: `pnpm vitest run src/application/handlers/__tests__/ProgressiveExcerptHotkeyHandler.test.ts`; `pnpm vitest run src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts`; `pnpm vitest run src/ui/settings/__tests__/SettingsPanel.test.ts`; `pnpm build`.

### 2026-04-08 - topic next-button sticky focus in review footer

- Task: Fix the topic-card review footer so clicking the `下一张` button no longer leaves the button stuck in its focused/highlighted state until the user clicks elsewhere.
- Touched slice: Review footer action handling in `src/ui/review/v2/ReviewActions.vue`, with focused regression coverage in `src/ui/review/v2/__tests__/ReviewActions.spec.ts`.
- Debt fixed now: Removed the local interaction mismatch where topic-mode review keeps reusing the same primary action button across cards, causing pointer-triggered native focus to persist visually after advancing; normalized the footer's back/reveal/grade button clicks to clear pointer focus without changing keyboard-triggered activation behavior; and locked the topic-next regression with a mounted focus test.
- Debt deferred: The skip-menu dropdown and other review-surface toolbar controls still rely on their own focus handling, so similar pointer-focus polish would need to be applied separately if the same symptom shows up there.
- Why deferred: This bug lived in the review footer's plain button path, while widening the change into nested menu controls or repo-wide focus-visible styling would cross component ownership boundaries and broaden a small behavior fix into a larger UI policy pass.
- Next safe step: If users report similar sticky highlights in the skip menu or review header tools, extract one shared review-action pointer-focus helper or adopt a consistent focus-visible policy for those sibling controls.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewActions.spec.ts`; `pnpm build`.

### 2026-04-08 - AI draft field normalization and atomic candidate save

- Task: Fix AI make-cards draft saving so candidates generated with generic `front/back` field names still save against real Xiuyuan template fields like `question/answer`, and prevent failed candidate saves from leaving half-written Daily Note headings behind.
- Touched slice: AI draft save orchestration in `src/application/services/AIWorkbenchService.ts`, Daily Note draft persistence in `src/application/services/AIDailyNoteDraftService.ts`, and focused regression coverage in `src/application/services/__tests__/{AIWorkbenchService.review-session,AIDailyNoteDraftService}.test.ts`.
- Debt fixed now: Removed the active-path mismatch where AI candidates were passed to draft persistence with raw model field keys instead of template-normalized field names, which made `builtin-basic-qa` saves fail after creating only the candidate heading; added template-aware alias normalization (`front/back` -> `question/answer`, etc.) before saving drafts; made draft persistence validate all required field bodies before creating candidate blocks so a failed save no longer pollutes the Daily Note with orphaned candidate headings; and taught retries in the same AI session to recover an already-written candidate heading by `candidateId` instead of appending another duplicate heading.
- Debt deferred: The candidate editor UI still displays and edits the model-produced field keys until a broader template-aware form model is introduced, so users may still see `front/back` labels even when the underlying draft save normalizes them to template fields.
- Why deferred: Converting the candidate editor into a fully template-shaped form would widen this bounded save-path repair into a broader AI candidate editing UX redesign involving dynamic field relabeling, template switches, and migration of already-loaded candidate state.
- Next safe step: Add one focused follow-up that derives editable candidate field rows from the selected template schema itself, so AI-generated aliases are normalized visually as well as during persistence.
- Validation: `pnpm vitest run src/application/services/__tests__/AIDailyNoteDraftService.test.ts src/application/services/__tests__/AIWorkbenchService.review-session.test.ts`; `pnpm vitest run src/infrastructure/siyuan/__tests__/AISiyuanAdapter.test.ts`; `pnpm build`.

### 2026-04-08 - AI Daily Note native lookup and session reuse

- Task: Align AI make-cards Daily Note drafts with Siyuan native daily-note semantics, reuse one AI draft session within the current workbench, and normalize the AI draft root title to `SiYuanMemo AI 制卡`.
- Touched slice: AI draft persistence and Siyuan integration across `src/application/services/{AIDailyNoteDraftService,AIWorkbenchService}.ts`, `src/application/ports/AISiyuanPort.ts`, `src/infrastructure/siyuan/{AISiyuanAdapter,api}.ts`, `src/types/ai.ts`, `src/ui/ai/AiWorkbenchPane.vue`, `src/application/ApplicationContext.ts`, plus focused regression coverage.
- Debt fixed now: Removed the active-path mismatch where AI drafts guessed Daily Note docs via rendered hpaths instead of using native `custom-dailynote-*` / `createDailyNote`; stopped dirty candidate edits from discarding their known draft locations and therefore forcing new `###` sessions on every resave; upgraded AI draft persistence from append-only candidate blocks to session-aware upsert/delete behavior; and normalized the AI Daily Note root heading to `SiYuanMemo` when reusing existing AI draft roots.
- Debt deferred: Progressive reading Daily Note traces still use their own older Daily Note resolution path and existing `SiYuan Memo` naming, and AI draft cleanup still depends on explicit save actions rather than background reconciliation when users leave stale drafts behind.
- Why deferred: Pulling progressive reading onto the same native daily-note helper would widen this bounded AI repair into a broader cross-context Daily Note migration, while automatic background cleanup would need stronger product decisions around auditability and draft retention.
- Next safe step: If the native AI Daily Note flow feels stable, extract one small shared daily-note resolver used by both AI drafts and progressive traces, then decide separately whether stale AI draft sessions should get explicit archive/cleanup UX.
- Validation: `pnpm vitest run src/application/services/__tests__/AIDailyNoteDraftService.test.ts src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/infrastructure/siyuan/__tests__/AISiyuanAdapter.test.ts src/application/managers/__tests__/DialogManager.quick-template-filter.test.ts src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts`; `pnpm build`.

### 2026-04-08 - review footer equal-height layout for topic and grading states

- Task: Fix the review v2 footer so desktop topic/concept "下一张" mode and item/descriptor grading mode keep the left back button, center action buttons, and right skip menu at the same visual height without shrinking the intentionally larger main action button.
- Touched slice: Review UI footer layout in `src/ui/review/v2/ReviewActions.vue` and `src/ui/review/v2/components/SkipMenuButton.vue`, plus focused regression coverage in `src/ui/review/v2/__tests__/ReviewActions.spec.ts`.
- Debt fixed now: Removed the active-path layout mismatch where desktop review footers only gave the center grading/topic column a metadata row, leaving back/skip at standalone button height; made the expanded footer state explicit instead of relying on topic-only markup quirks; and aligned skip-button height behavior with the review footer container instead of its own content height.
- Debt deferred: There is still no screenshot-style visual regression for desktop review footer states, and mobile keeps the existing compact footer strategy instead of adopting a separate expanded equal-height mode.
- Why deferred: The user-visible bug was in the desktop review footer structure, and the current unit stack can safely lock DOM/state transitions without adding a heavier visual harness or widening the task into a mobile footer redesign.
- Next safe step: If footer visuals drift again, add one focused screenshot/manual acceptance workflow for desktop reveal, grading, and topic-next states before changing mobile behavior.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewActions.spec.ts`; `pnpm build`.

### 2026-04-08 - AI document-block context reads body content

- Task: Fix AI workbench make-cards/explain/tutor context assembly so document-block cards and document-block selections use the document body as AI material instead of only the document title.
- Touched slice: AI review/browser/template context assembly in `src/application/services/AIWorkbenchService.ts`, AI Siyuan port wiring in `src/application/ports/AISiyuanPort.ts` and `src/infrastructure/siyuan/AISiyuanAdapter.ts`, plus focused regression coverage in AI service and adapter tests.
- Debt fixed now: Removed the active-path mismatch where review AI treated document blocks as ordinary `blocks.content` rows and therefore fed titles like full materials into candidate generation; deduped AI-only document handling behind the AI port instead of mutating `CardContentQueryService`'s broader semantics; and made document body read failures surface as explicit AI workbench errors instead of silently degrading back to title-only context.
- Debt deferred: AI still relies on one simple `copyStdMarkdown` body read per document block, with no token-budget trimming, structural chunking, or richer doc-scope expansion for multi-document learning flows.
- Why deferred: Smarter summarization, chunking, or recursive doc-scope expansion would widen this bounded context-repair into a broader AI prompt-budget and product-behavior redesign beyond the immediate title-vs-body bug.
- Next safe step: If large documents now produce noisy prompts, add one small AI-only context compaction layer that trims or samples long document markdown after body retrieval, without reintroducing title fallback.
- Validation: `pnpm vitest run src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/application/services/__tests__/AIDailyNoteDraftService.test.ts src/infrastructure/siyuan/__tests__/AISiyuanAdapter.test.ts src/application/managers/__tests__/DialogManager.quick-template-filter.test.ts`; `pnpm build`.

### 2026-04-08 - AI make-cards Daily Note draft flow

- Task: Replace the AI make-cards v1 "candidate + source-adjacent temp block insertion" flow with an explicit Daily Note draft flow: generate candidates, save confirmed drafts into today's Daily Note, then create cards only from those saved draft blocks.
- Touched slice: AI workbench and Siyuan integration across `src/application/services/{AIWorkbenchService,AIDailyNoteDraftService,BlockAttrPolicy}.ts`, `src/application/{ApplicationContext.ts,managers/DialogManager.ts}`, `src/application/ports/AISiyuanPort.ts`, `src/infrastructure/siyuan/AISiyuanAdapter.ts`, `src/types/ai.ts`, `src/ui/ai/AiWorkbenchPane.vue`, related i18n, and focused regression coverage for service/dialog/UI behavior.
- Debt fixed now: Removed the active-path leak where AI candidate creation materialized edited field text into arbitrary source-adjacent Siyuan blocks before delegating to Xiuyuan creation; split the make-cards flow into generate/save/create with explicit draft-state tracking (`unsaved/saved/dirty/...`); isolated Daily Note draft persistence into its own AI-side service instead of coupling AI to `ProgressiveReadingService`; and added dedicated `custom-fsrs-ai-*` attrs to the managed block-attr cleanup policy so AI draft entities are no longer invisible to plugin maintenance tooling.
- Debt deferred: Saved AI draft sessions in Daily Notes are append-only for now, with no retention policy, dedupe, or cleanup UX for superseded draft sessions after users re-save or successfully create cards.
- Why deferred: Auto-pruning or mutating historical draft sessions would need product decisions around auditability, user trust, and whether created cards should keep a visible Daily Note trail, which is broader than this bounded flow repair.
- Next safe step: Add one small follow-up that lets users collapse, archive, or clean stale AI draft sessions in Daily Notes without touching the final card-creation path.
- Validation: `pnpm vitest run src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/application/services/__tests__/AIDailyNoteDraftService.test.ts src/application/managers/__tests__/DialogManager.quick-template-filter.test.ts src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts`; `pnpm build`.

### 2026-04-07 - stronger explain and candidate prompts with upgraded explain schema

### 2026-04-07 - AI settings prompt-source visibility

- Task: Make the AI settings page explicitly show whether each prompt card is currently using the built-in recommended template or a saved custom override, so the advanced editor no longer looks like it is mysteriously showing stale defaults.
- Touched slice: AI settings presentation in `src/ui/settings/SettingsPanel.vue`, related settings-tab regression coverage in `src/ui/settings/__tests__/SettingsPanel.test.ts`, plus i18n copy in `src/i18n/{zh_CN,en_US}.json`.
- Debt fixed now: Removed the ambiguous settings UX where preset cards described the new recommended template but the advanced editor silently showed whatever effective prompt text happened to be loaded, making saved overrides look like broken defaults; also deduped local “recommended prompt for setting key” lookup so reset/status/save logic now shares one small helper instead of repeating task-key mapping.
- Debt deferred: The settings page still does not distinguish between “saved custom override” and “unsaved local edits,” and prompt-source visibility still lives only inside the AI settings cards rather than being surfaced anywhere else AI prompts are edited or previewed.
- Why deferred: Tracking saved-vs-dirty prompt state would require a broader editor-state model inside the settings surface, while surfacing prompt provenance outside the settings tab would widen this narrow UX clarification into a larger product pass.
- Next safe step: If users still get confused, add one lightweight dirty-state marker per prompt card so the page can say not only “recommended vs custom” but also whether the current editor differs from the last saved config.
- Validation: `pnpm vitest run src/ui/settings/__tests__/SettingsPanel.test.ts`; `pnpm build`.

- Task: Rework the built-in AI explanation and AI candidate-generation prompts so they act less like weak formatting instructions and more like a compressed understanding coach, while upgrading explain results from the old `recognizeNextTime` shape to a stronger review-first schema.
- Touched slice: AI contracts in `src/types/{ai.ts,settings.ts}`, prompt composition in `src/application/services/AIPromptComposer.ts`, explain normalization and prompt dispatch in `src/application/services/AIWorkbenchService.ts`, explain rendering in `src/ui/ai/AiWorkbenchPane.vue`, related i18n, and focused AI prompt/service/UI/settings regression coverage.
- Debt fixed now: Replaced the old thin explain prompt with a materially stronger material-anchored prompt that explicitly enforces working-definition-first reasoning, causal/boundary thinking, read-mode vs retrieval-mode card handling, and trigger-based recall cues; tightened candidate-generation prompts around Andy-style internal understanding plus quality-first candidate filtering so the model may emit fewer cards instead of padding weak ones; and upgraded explain results onto a clearer six-field schema (`workingDefinition`, `whatItTests`, `whyItsTricky`, `connections`, `triggers`, `cardIdeas`) that better matches the sidecar's compressed-learning-coach role.
- Debt deferred: AI tutor prompts remain on the previous generation because this pass intentionally focused on explain and make-cards only, the current prompt-profile system still exposes just one built-in preset family per task instead of multiple productized explain/card styles, and candidate generation still does not surface a separate lightweight reasoning summary in the UI beyond the candidate cards themselves.
- Why deferred: Pulling tutor into the same rewrite would widen this bounded prompt-quality pass into a broader product redefinition of all AI modes, while multiple built-in presets or visible reasoning summaries would require additional product/UI choices that were explicitly left out of this iteration.
- Next safe step: If this stronger default feels meaningfully smarter in daily use, do one follow-up that evaluates whether explain should get a second “deep lecture” preset and whether make-cards should optionally expose a one-paragraph rationale summary without breaking the candidate-first workflow.
- Validation: `pnpm vitest run src/application/services/__tests__/AIPromptComposer.test.ts src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/types/__tests__/settings-normalization.test.ts`; `pnpm build`.

### 2026-04-07 - AI prompt-profile persistence and shared queue-progress semantics

- Task: Continue the three deferred AI debts by turning flat saved prompt strings into first-class prompt-profile persistence, promoting review queue progress into a shared typed review contract, and making standalone AI dialog consume the same queue-aware context-detail semantics as the review sidecar/companion.
- Touched slice: AI settings/contracts in `src/types/settings.ts`, review/queue progress shaping in `src/types/{ai.ts,unified-data-source.ts}` plus `src/application/adapters/UnifiedReviewAdapter.ts` and `src/ui/review/v2/{types.ts,ReviewView.vue}`, standalone/review AI presentation in `src/ui/ai/AiWorkbenchPane.vue`, AI prompt resolution in `src/application/services/AIWorkbenchService.ts`, settings save/load UI in `src/ui/settings/SettingsPanel.vue`, and focused service/component/settings regression coverage.
- Debt fixed now: Replaced the old “three effective prompt strings only” persistence model with normalized `promptProfiles` that preserve recommended-vs-override intent while still emitting effective prompt strings for runtime compatibility; extracted review queue progress into a typed `ReviewQueueProgressSnapshot` contract produced by the active review adapter instead of letting AI surfaces guess from ad hoc queue counters; and aligned standalone AI dialog context details with the same queue-aware rows used by compact review AI surfaces so queue/session/neural-local semantics no longer diverge by surface.
- Debt deferred: Prompt presets still only ship one built-in preset family (`recommended`) per task, standalone dialog still intentionally keeps its broader workbench shell instead of becoming the same ultra-compact RemNote-like companion layout as review surfaces, and repo-wide hardcoded UI string cleanup remains outside this bounded AI/review/settings pass.
- Why deferred: Adding multiple preset families would widen this persistence cleanup into a larger product decision about prompt personas and migration UX, collapsing standalone into the compact shell would turn this semantic unification into a broader cross-surface design rewrite, and clearing the remaining hardcoded strings is a repo-wide localization sweep rather than local debt in the touched bounded context.
- Next safe step: If these structured prompt profiles feel stable, add one focused follow-up that introduces a second built-in preset family per AI task without changing the stored schema again, then decide separately whether standalone should visually converge further toward the compact companion shell.
- Validation: `pnpm vitest run src/application/services/__tests__/AIPromptComposer.test.ts src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/types/__tests__/settings-normalization.test.ts`; `pnpm build`.

### 2026-04-07 - AI prompt layering presets and queue-aware review AI details

- Task: Refactor AI prompts from flat runtime strings into layered templates with recommended presets plus advanced editing, and replace the review AI sidecar's fake universal batch-progress display with queue-aware review progress plus neural-engine-specific local context.
- Touched slice: AI orchestration in `src/application/services/{AIPromptComposer,AIWorkbenchService}.ts`, review-bound AI context wiring in `src/ui/review/v2/ReviewView.vue`, compact AI presentation in `src/ui/ai/AiWorkbenchPane.vue`, AI settings UI in `src/ui/settings/SettingsPanel.vue`, AI contracts/defaults in `src/types/{ai.ts,settings.ts}`, related i18n, and focused service/component/settings regression coverage.
- Debt fixed now: Stopped the runtime from treating saved AI prompts as one opaque blob by introducing a bounded prompt-composition layer with shared base rules, task-specific guidance, and separate structured-vs-follow-up output protocols; removed the misleading `neuralBatch.viewedCount / roundSize` display from review AI details in favor of session-level queue progress plus orbit/hyperspace-specific local context rows; and upgraded the AI settings tab from raw prompt textareas into recommended preset cards with advanced editor toggles and one-click reset to the current recommended template.
- Debt deferred: Saved prompt strings still remain a single persisted text field per task instead of first-class multi-part config, standalone AI dialog still keeps the broader workbench shell instead of fully sharing the queue-aware review detail presentation, and review queue progress still depends on session meta counters rather than a dedicated queue-progress domain contract shared by every queue implementation.
- Why deferred: Changing the persisted prompt schema or extracting a repo-wide queue-progress contract would widen this bounded AI/review refinement into a broader settings and queue architecture migration, while bringing standalone onto the same semantics would expand a review-focused UX fix into a cross-surface redesign.
- Next safe step: If these presets and queue-aware details feel right in daily use, add one small follow-up that lets users switch between recommended prompt presets without exposing raw prompt text by default, then decide whether queue progress deserves its own typed adapter contract at the review-session boundary.
- Validation: `pnpm vitest run src/application/services/__tests__/AIPromptComposer.test.ts src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/types/__tests__/settings-normalization.test.ts`; `pnpm build`.

### 2026-04-07 - review AI extreme compact mode, card semantics, and Andy candidate prompt

- Task: Tighten the review-bound AI sidecar into a more RemNote-like minimal companion surface, fix the misleading neural batch `1/5` display into real viewed-progress semantics, teach the AI layer the difference between read-mode topic/concept cards and retrieval cards, and swap the default AI card-candidate prompt onto Andy's structured-understanding method while preserving the JSON candidate contract.
- Touched slice: Review AI presentation in `src/ui/ai/AiWorkbenchPane.vue`, AI review-card contracts in `src/types/ai.ts`, AI request/context shaping in `src/application/services/AIWorkbenchService.ts`, default AI prompt settings in `src/types/settings.ts`, related i18n, and focused service/component/settings regression coverage.
- Debt fixed now: Removed the last always-visible compact context chrome so review sidecar/companion surfaces now default to title + response + composer with everything else behind a small details toggle, replaced the old static `roundNodes.length / roundSize` pseudo-progress with real `viewedCount / roundSize` batch progress, stopped treating topic/concept cards like hidden-answer QA cards by adding explicit card-role semantics into both prompt payloads and UI details, and upgraded the default make-cards prompt so the model internally follows Andy's multi-angle understanding workflow before still returning strict JSON candidates.
- Debt deferred: Standalone AI dialog still keeps its broader workbench layout instead of sharing the new ultra-compact review shell, the compact surface still uses textual mounted assertions rather than screenshot-style visual regression for the RemNote-like presentation, and the default Andy candidate prompt currently hardcodes one learner profile (`略懂 / 理解概念 / 标准`) instead of exposing those knobs in the UI.
- Why deferred: Pulling standalone into the same presentation or adding richer visual regression would widen this bounded review-side refinement into a larger cross-surface product/tooling effort, while exposing learner-profile controls would move this pass from prompt-quality alignment into a broader settings and workflow design change.
- Next safe step: If this calmer review companion feels right in daily use, do one follow-up that adds screenshot/manual acceptance coverage for dialog-sidecar and tab-companion states, then decide whether learner profile should stay implicit or become a small advanced option inside AI settings or make-cards UI.
- Validation: `pnpm vitest run src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts src/types/__tests__/settings-normalization.test.ts`; `pnpm build`.

### 2026-04-07 - review AI compact sidecar visual simplification

- Task: Rework the review-bound AI sidecar/companion presentation so the compact review surfaces feel like a lighter RemNote-style study companion instead of a squeezed-down workbench.
- Touched slice: Compact AI surface rendering in `src/ui/ai/AiWorkbenchPane.vue`, review-shell color alignment in `src/ui/review/v2/ReviewView.vue`, and new mounted compact-surface regression coverage in `src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts`.
- Debt fixed now: Removed the old compact-surface leftover workbench chrome by switching review sidecar/companion surfaces to a segmented-header single-column shell with collapsed context tray, converted tutor/explain results into one calmer response-card pattern instead of stacked heavy cards, and anchored the compact composer/actions/context card into a lighter fixed footer so long results no longer push the interaction area around.
- Debt deferred: Standalone AI dialog still keeps the broader workbench layout instead of fully sharing the compact companion presentation, compact stale/error handling is covered only by a narrow mounted component spec rather than screenshot-style visual regression, and the compact candidate-editing view still inherits some denser Xiuyuan-era form chrome.
- Why deferred: A full standalone visual redesign or stronger screenshot regression harness would broaden this bounded review-side presentation pass into a larger cross-surface product and tooling effort, while rethinking candidate editing density further would start changing tool ergonomics rather than just presentation.
- Next safe step: If this calmer sidecar direction feels right in daily use, do one follow-up pass that trims the compact make-cards editor chrome further and adds a focused screenshot/manual acceptance workflow for dialog-sidecar and tab-companion surfaces.
- Validation: `pnpm vitest run src/ui/ai/__tests__/AiWorkbenchPane.compact-surface.spec.ts`; `pnpm build`.

### 2026-04-07 - dialog review AI sidecar fallback routing fix

- Task: Fix dialog-mode review AI so toolbar AI actions actually expand into the in-dialog sidecar instead of silently falling back to the old standalone overlay dialog on ordinary desktop setups.
- Touched slice: Review surface gating in `src/ui/review/v2/ReviewView.vue`, unified review-dialog factory wiring in `src/application/factories/createUnifiedReviewDialog.ts`, filter-backed dialog openings in `src/application/managers/DialogManager.ts`, and focused regression coverage around those dialog props.
- Debt fixed now: Passed `mode: 'dialog'` into review dialogs that previously omitted it, which meant `ReviewView` could not positively identify dialog mode and always took the standalone AI fallback path, and relaxed the desktop sidecar viewport threshold so ordinary desktop app windows do not get incorrectly downgraded to the overlay dialog.
- Debt deferred: Sidecar eligibility still depends on a simple viewport threshold heuristic rather than measuring the real dialog workspace or adapting continuously to available width after resize.
- Why deferred: Replacing the heuristic with a true workspace-layout policy would widen this narrow routing fix into a more involved responsive-shell redesign across dialog sizing, content minimums, and resize behavior.
- Next safe step: If users still hit edge cases on narrow desktop windows, move sidecar eligibility from `window.innerWidth` to one small layout helper that measures the review dialog container and decides between stitched sidecar and compact fallback using actual rendered space.
- Validation: `pnpm vitest run src/application/factories/__tests__/createUnifiedReviewDialog.mode.test.ts src/application/managers/__tests__/DialogManager.review-header-variant.test.ts`; `pnpm build`.

### 2026-04-07 - review AI sidecar and companion-tab layout

- Task: Rework review AI from a standalone overlay into review-bound companion surfaces so dialog review can expand with a stitched right sidecar and tab review can open a synchronized right-side AI companion tab without losing the live review context.
- Touched slice: Review-bound AI state/contracts in `src/types/ai.ts`, session scoping in `src/application/services/{AIWorkbenchService,ReviewAIWorkbenchRegistry}.ts`, app composition in `src/application/ApplicationContext.ts`, review/tab/dialog routing in `src/application/managers/{DialogManager,TabManager}.ts`, review shell integration in `src/ui/review/v2/ReviewView.vue`, shared AI surface UI in `src/ui/ai/{AiWorkbenchPane.vue,AiWorkbenchDialog.vue}`, plus i18n and focused regression coverage.
- Debt fixed now: Replaced the old global review-agnostic AI workbench lifecycle with per-review-session state so structured results and follow-up history stay isolated per review session, moved the AI content into one reusable pane that can render as standalone dialog, in-dialog sidecar, or companion tab without forking product behavior, and introduced stale-context handling so switching cards or roam batches preserves old AI output as read-only history instead of silently letting follow-ups run against mismatched review context.
- Debt deferred: Dialog-mode sidecar open/close state still lives locally inside `ReviewView` instead of a more explicit persisted review-workspace shell state object, the tab companion path still relies on TabManager runtime bookkeeping rather than a first-class review-surface relationship registry, and mounted UI coverage still stops at focused service/manager slices instead of exercising the full rendered dialog/tab layout with real review controls.
- Why deferred: Persisting review-workspace shell state or generalizing cross-surface relationships would widen this bounded layout refactor into a broader review window/session architecture redesign, while full mounted layout coverage would be substantially heavier than the targeted regressions needed to protect the active path right now.
- Next safe step: If this companion-review model holds up in use, extract the dialog sidecar state and the review-to-companion binding into one small review workspace coordinator, then add one mounted spec for dialog expansion plus one for tab companion reuse before layering richer tutor chat behavior on top.
- Validation: `pnpm vitest run src/application/services/__tests__/AIWorkbenchService.review-session.test.ts src/application/managers/__tests__/TabManager.review-ai-companion.spec.ts`; `pnpm build`.

### 2026-04-07 - AI workbench companion-panel UI refinement

- Task: Refine the new AI workbench so it feels closer to a companion study panel during review, inspired by RemNote's split card-plus-tutor layout, without changing the underlying AI task contract.
- Touched slice: AI dialog presentation in `src/ui/ai/AiWorkbenchDialog.vue` plus AI dialog sizing in `src/application/managers/DialogManager.ts`.
- Debt fixed now: Replaced the old single-column tool-page layout with a clearer two-pane structure that keeps study context visible while the AI responds, added a persistent bottom action dock so tutor/explain/make-cards actions stay anchored instead of floating above long results, and made the card snapshot respect review reveal boundaries so the explanation UI does not visually leak hidden answers.
- Debt deferred: The workbench is still a task-oriented panel rather than a full multi-turn tutor chat, many of the new strings are still local UI literals instead of fully normalized i18n keys, and there is still no dedicated mounted UI test for the new responsive split layout.
- Why deferred: Turning the panel into a real conversation surface or fully normalizing every new label would widen this bounded UI refinement into a broader product and localization pass beyond the current active-path improvement.
- Next safe step: If this companion-panel direction feels right in use, the next focused step is to add one lightweight follow-up prompt box for tutor/explain and then normalize the new layout copy into first-class i18n keys with a small mounted component spec.
- Validation: `pnpm build`.

### 2026-04-07 - AI workbench v1 for tutor, explain, and candidate-first card generation

- Task: Add the first bounded AI integration slice for SiyuanMemo so review, browser, and template-selection flows can open one shared AI workbench for neural-roam tutor guidance, post-reveal card explanation, and candidate-first AI flashcard generation.
- Touched slice: AI settings/contracts in `src/types/{settings.ts,ai.ts,unified-data-source.ts}`, application composition in `src/application/{ApplicationContext.ts,interfaces/IDialogManager.ts,managers/DialogManager.ts,services/AIWorkbenchService.ts}`, OpenAI-compatible/provider and Siyuan adapters in `src/infrastructure/{llm/OpenAICompatibleLLMAdapter.ts,siyuan/AISiyuanAdapter.ts}`, neural batch snapshot exposure in `src/core/queue/{domain/NeuralRoamQueue.ts,neural/ConceptNeuralQueue.ts,neural/hyperspace/HyperspaceEngine.ts}`, UI entry points in `src/ui/{ai/AiWorkbenchDialog.vue,review/v2/ReviewView.vue,browser/{BrowserToolbar.vue,SRSBrowser.vue},settings/SettingsPanel.vue,xiuyuan/TemplateSelectDialog.vue}`, related i18n, and targeted regression coverage.
- Debt fixed now: Centralized AI execution behind one workbench service instead of scattering model calls through review/browser/template UIs, exposed a read-only current-batch snapshot for neural roam so tutor prompts read the same round users are reviewing, and kept AI card generation candidate-first so creation still goes through existing Xiuyuan/application use cases only after explicit confirmation.
- Debt deferred: The AI layer still ships with one OpenAI-compatible adapter only, no provider registry/tool-calling/persistent conversation store, browser/review AI entry paths still rely on targeted unit coverage instead of a full mounted cross-surface integration harness, and candidate creation currently materializes edited field text into nearby Siyuan blocks before delegating to existing Xiuyuan creation paths.
- Why deferred: Generalizing providers/tools/history or redesigning candidate persistence would widen this bounded v1 integration into a broader platform project, while full cross-surface mounted coverage would be substantially heavier than the narrow regression tests needed to keep the active path safe.
- Next safe step: If AI usage stabilizes, extract a small provider registry plus persisted workbench-session store first, then decide whether candidate text should keep using transient nearby blocks or move to a more explicit draft artifact model.
- Validation: `pnpm vitest run src/ui/settings/__tests__/SettingsPanel.test.ts src/types/__tests__/settings-normalization.test.ts src/infrastructure/llm/__tests__/OpenAICompatibleLLMAdapter.test.ts src/core/queue/neural/__tests__/ConceptNeuralQueue.test.ts`; `pnpm build`.

### 2026-04-07 - review escape returns focus to grading without relocking

- Task: Restore the long-press `Escape` optimization in dialog review so users can leave the always-editable main Protyle and jump back to the grading/reveal controls after the auto-lock removal.
- Touched slice: Review editor interaction state in `src/ui/review/v2/ReviewContent.vue` plus the focused regression coverage in `src/ui/review/v2/__tests__/ReviewContent.editor-state.spec.ts`.
- Debt fixed now: Decoupled “can edit” from the removed read-only lock flow, made main-Protyle editing state follow real focus instead of assuming the surface is always actively editing, and redirected repeated-`Escape` exit back to the primary review action button instead of silently doing nothing.
- Debt deferred: Dialog-level `Escape` behavior still relies on DOM focus heuristics local to `ReviewContent`/`ReviewView`, and there is still no broader cross-surface keyboard contract shared with tab mode, auxiliary dialogs, or non-Protyle renderers.
- Why deferred: Generalizing review keyboard focus semantics across every review surface would widen this bounded regression fix into a broader interaction-contract redesign beyond the active dialog Protyle path.
- Next safe step: If more review surfaces need the same “leave editor and resume grading” behavior, extract the new Protyle-focus tracking and primary-action targeting into a small shared review keyboard/focus helper used by dialog and tab review shells.
- Validation: `pnpm vitest run src/ui/review/v2/__tests__/ReviewContent.editor-state.spec.ts src/ui/review/v2/__tests__/reviewDialogEscape.test.ts`; `pnpm build`.

### 2026-04-07 - hyperspace progressive excerpt additive routing

- Task: Implement SuperMemo-style `Alt+X` additive routing in hyperspace so newly created excerpt Topic roots merge back into the active hyperspace roam without forcing an immediate focus jump or auto-building a station.
- Touched slice: Review excerpt routing in `src/ui/review/v2/ReviewView.vue`, neural session/public contracts in `src/types/unified-data-source.ts` and `src/core/queue/domain/NeuralRoamQueue.ts`, hyperspace live expansion in `src/core/queue/neural/hyperspace/HyperspaceEngine.ts`, progressive backlink normalization in `src/core/queue/neural/ConceptQueryEngine.ts` plus `src/core/queue/neural/graph/NeuralGraphProvider.ts`, related i18n, and targeted neural/review regression tests.
- Debt fixed now: Added a hyperspace-only live excerpt injection path that registers excerpt roots as hot source candidates without mutating anchors or current focus, normalized excerpt backlinks away from inner `【*】`/`daily-excerpt-ref` blocks onto the excerpt Topic root so future sessions can rediscover the right node, and kept `Alt+X` additive routing separate from manual station/focus semantics.
- Debt deferred: `orbit` and other neural modes still do not get the same additive excerpt routing, the injected branch still reuses existing source/frontier semantics instead of exposing a dedicated user-visible trace/origin type, and backlink caches are not explicitly invalidated when an excerpt is created mid-session.
- Why deferred: Cross-engine parity, a richer neural trace contract, or proactive cache invalidation would widen this bounded hyperspace/review fix into a broader neural session protocol redesign.
- Next safe step: If users want parity across engines or more inspectable live excerpt traces, extract the new injection behavior behind an explicit neural session policy interface and add one typed excerpt-origin trace plus targeted cache invalidation hooks.
- Validation: `pnpm vitest run src/core/queue/neural/hyperspace/__tests__/HyperspaceEngine.test.ts src/core/queue/neural/__tests__/ConceptQueryEngine.backlinks.test.ts src/core/queue/domain/__tests__/NeuralRoamQueue.test.ts src/ui/review/v2/__tests__/ReviewView.progressive-excerpt-hyperspace.spec.ts`; `pnpm build`.

### 2026-04-06 - progressive topic-derived item flow

- Task: Implement the Topic-to-item natural derivation flow so existing Topic cards can keep their Topic identity while later highlights or inline symbols spawn new derived practice child documents plus item cards.
- Touched slice: Progressive reading / auto-card application slice in `src/application/handlers/AutoCardHandler.ts`, `src/application/services/{TopicDerivedItemService,ProgressiveReadingService,CardApplicationService}.ts`, `src/application/ApplicationContext.ts`, `src/application/commands/card/CreateCardCommand.ts`, `src/core/siyuan/block.ts`, `src/application/services/BlockAttrPolicy.ts`, and quick-card/settings surfaces in `src/{types/settings.ts,ui/settings/SettingsPanel.vue,core/card/quick-card/infrastructure/QuickCardConfigProvider.ts}`.
- Debt fixed now: Removed the active-path short-circuit that skipped symbol-listener follow-up extraction on existing Topic contexts, extracted reusable child-doc creation from the progressive reading service instead of duplicating excerpt doc logic, and added explicit derived-item lineage plus fingerprint/storage metadata so repeated scans dedupe instead of mutating or duplicating Topic cards.
- Debt deferred: Inline semantic derivation still normalizes concept-definition and descriptor symbols into one derived item child-doc/card path instead of preserving full Xiuyuan multi-card parity for bidirectional or richer semantic variants, and derived items are snapshot children that do not live-refresh if the source Topic later changes.
- Why deferred: Preserving full Xiuyuan multi-card semantics or live source-sync would widen this bounded listener/progressive-reading fix into a larger creation-executor and sync-contract redesign.
- Next safe step: If users want richer parity with SuperMemo/Xiuyuan semantics, extract a dedicated derived-item executor that keeps the current fingerprint/storage contract but can optionally fan out into multi-card semantic creation without mutating the Topic source.
- Validation: `pnpm vitest run src/application/services/__tests__/TopicDerivedItemService.test.ts src/application/handlers/__tests__/AutoCardHandler.topic-derivation.test.ts src/types/__tests__/settings-normalization.test.ts`; `pnpm build`.

### 2026-04-06 - neural-roam virtual navigation plus associated real-card follow-ups

- Task: Collapse neural roam back to a cleaner model where orbit/hyperspace only navigate virtual blocks, while exact local review cards found under the current virtual node are injected as follow-up review cards instead of being expanded into the main roam graph.
- Touched slice: Neural navigation/query flow in `src/core/queue/neural/ConceptQueryEngine.ts` and `src/core/queue/domain/NeuralRoamQueue.ts`, with regression coverage in the corresponding neural queue/query tests and graph-provider tests.
- Debt fixed now: Removed the old "wide expand real flashcards into main neighbors" behavior from the active roam path, split virtual navigation cards from associated real review cards at the queue boundary instead of inside review UI, and added persisted pending/seen associated-card session state so deduped follow-up reviews survive queue save/load.
- Debt deferred: Associated real-card discovery still scans live block descendants at runtime and rebuilds pending follow-up card metadata from local storage instead of using a persisted graph/index or a richer serialized associated-card payload with full source provenance.
- Why deferred: A persisted relation index or a broader typed neural metadata/session protocol would widen this bounded behavior reset into a larger graph-storage and review-contract redesign beyond the active-path regression.
- Next safe step: If users want stronger control over associated-card cadence or provenance display, extract the new pending-associated-review state into an explicit neural session capability contract shared by queue, strategy, and review UI before adding more knobs.
- Validation: `pnpm vitest run src/core/queue/neural/__tests__/ConceptQueryEngine.backlinks.test.ts src/core/queue/domain/__tests__/NeuralRoamQueue.test.ts src/core/queue/neural/graph/__tests__/NeuralGraphProvider.test.ts src/core/queue/neural/hyperspace/__tests__/HyperspaceEngine.test.ts src/application/__tests__/UnifiedQueueStrategy.neural-roam.test.ts`; `pnpm build`.

### 2026-04-06 - neural-roam wide paragraph-node expansion and exact local node typing

- Task: Fix neural-roam wrapper list items that still rendered as packaging blocks instead of expanding into paragraph flashcards, and make syntax-only paragraph nodes roam as real item nodes without incorrectly writing formal SRS reviews.
- Touched slice: Neural queue/query typing in `src/core/queue/neural/ConceptQueryEngine.ts`, `src/core/queue/domain/NeuralRoamQueue.ts`, `src/core/queue/neural/ConceptNeuralQueue.ts`, and `src/core/queue/neural/graph/NeuralGraphProvider.ts`, plus neural queue wiring in `src/application/services/UnifiedDataSourceManager.ts` and targeted neural regression tests.
- Debt fixed now: Split "renderable roam node" from "formal review flashcard" semantics, removed the old exact-block lookup fallback that could silently grab a parent card when a paragraph block had no exact local match, and reused one injected node-type detector across orbit and hyperspace so wrapper expansion and item/topic typing no longer diverge between engines.
- Debt deferred: Wrapper descendant expansion still walks live SQL descendant trees plus per-node detection instead of using a persisted wrapper-to-card relation index, and the neural metadata contract still exposes only the older `isFlashcard` bit instead of a richer explicit node-capability payload.
- Why deferred: A persisted relation index or a broader neural metadata redesign would widen this bounded bugfix into a larger graph-storage and review-render policy project beyond the active-path regression.
- Next safe step: If neural-roam keeps needing finer distinctions between exact local cards, syntax-only roam nodes, and practice-only topic nodes, add one focused follow-up that promotes those states into a typed neural node-capability contract shared by queue, adapter, and review UI.
- Validation: `pnpm vitest run src/core/queue/neural/__tests__/ConceptQueryEngine.backlinks.test.ts src/core/queue/domain/__tests__/NeuralRoamQueue.test.ts src/core/queue/neural/graph/__tests__/NeuralGraphProvider.test.ts src/core/queue/neural/hyperspace/__tests__/HyperspaceEngine.test.ts`; `pnpm build`.

### 2026-04-06 - filter-group count cache flush and neural-roam paragraph flashcard expansion

- Task: Fix filter-group review-scope confirmation so the browser hierarchy queue counts stop reading stale count cache, and remove the remaining neural-roam top-level list-item constraint so paragraph flashcards under wrapper list items can roam as independent nodes instead of collapsing back to the wrapper.
- Touched slice: Browser queue-sync payload handling in `src/ui/browser/composables/useBrowserAdapterSync.ts` and `src/ui/browser/SRSBrowser.vue`, neural neighbor expansion in `src/core/queue/neural/ConceptQueryEngine.ts`, and hyperspace graph edge classification in `src/core/queue/neural/graph/NeuralGraphProvider.ts`, plus targeted browser/neural graph regression tests.
- Debt fixed now: Extended the browser's internal queue-change sync payload with one narrow `forceRefreshCounts` signal so targeted queue-changed events can invalidate only the affected queue-count cache, replaced the old single-choice list-item descendant resolution with full real-flashcard expansion for wrapper hits, and removed the lingering "current concept source implies concept-link" assumption from hyperspace edge classification.
- Debt deferred: Browser queue sync still relies on loosely coupled booleans instead of one typed queue-refresh plan object, and neural-roam flashcard expansion still derives exact descendants from best-effort SQL scans rather than a persisted relation index or precomputed wrapper-to-card mapping.
- Why deferred: A richer queue-refresh contract or persisted graph/index layer would widen this bounded bugfix across browser and neural infrastructure instead of staying on the active-path defects reported here.
- Next safe step: If more queue surfaces need differentiated refresh semantics or if list-wrapper expansion logic keeps recurring outside neural roam, extract the new count-refresh hint and flashcard-expansion rules into explicit reusable queue/graph contracts instead of keeping them as local helper behavior.
- Validation: `pnpm vitest run src/ui/browser/composables/__tests__/useBrowserAdapterSync.test.ts src/core/queue/neural/__tests__/ConceptQueryEngine.backlinks.test.ts src/core/queue/neural/graph/__tests__/NeuralGraphProvider.test.ts src/core/queue/neural/hyperspace/__tests__/HyperspaceEngine.test.ts src/core/queue/domain/__tests__/NeuralRoamQueue.test.ts`; `pnpm build`.

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
| P1 | Native Riff hard-delete and multi-device concurrency can still create real document conflicts even after plugin-owned attr writes were reduced | review/browser delete entrypoints, card delete flows, Riff sync delete paths | Split local hide/tombstone semantics from destructive native Riff deletion, then add concurrency diagnostics around delete/sync races |
| P1 | Mojibake/encoding debt in long-lived docs and some comments | `ARCHITECTURE.md`, selected large Vue/TS files with historical garbled comments | Run dedicated UTF-8 restoration pass (content-preserving) |
| P1 | Legacy compatibility service surface still exists but no longer used on active browser path | `ApplicationContext` (`tabManager` service exposure) | Evaluate bounded removal/retire plan and adjust integration tests |
| P2 | Repeated local i18n helper patterns (`t(key, fallback)`) | UI components in browser/review | Optional dedupe via shared translator utility (low risk, non-functional) |

## 4. Next convergence batch

1. Execute UTF-8 restoration pass for architecture and core active docs.
2. Shrink `ApplicationContext` compatibility surface where active callers are already migrated.
3. Do low-risk i18n helper dedupe in browser/review slices.
