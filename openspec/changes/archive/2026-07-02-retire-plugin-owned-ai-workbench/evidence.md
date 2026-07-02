## Evidence Gate

Captured on 2026-06-15 before production edits.

## MCP keep surface

- `src/kernel.ts`
  - `AGENT_MCP_TOOL_NAMES = ['memo_query', 'memo_card', 'memo_review', 'memo_ui']`
  - `AGENT_MCP_TOOL_ACTIONS` currently advertises `memo_card draft` and `memo_ui open/get/status/focus`
  - `handleAgentMcpToolCall()` validates action, submits `method: 'agent.tool.execute'`, and returns typed envelopes
  - `buildAgentMcpToolConfig()` currently describes `memo_card` as "preview AI draft candidates"
- `src/application/agent/AgentToolContracts.ts`
  - `AGENT_TOOL_NAMES` matches the four MCP tool names
  - `validateAgentToolAction()` blocks `memo_review` answer/grade/feedback/submit/commit
  - `buildMemoCardInputSchema()` currently allows `draft`
  - `buildMemoUiInputSchema()` currently allows open/get/status/focus
- `src/application/services/AgentToolService.ts`
  - `execute()` routes `memo_query`, `memo_card`, `memo_review`, and `memo_ui`
  - `executeMemoCard('draft')` currently delegates to `cardDraftService.draft()`
  - `executeMemoUi()` currently reports `['browser', 'review', 'ai', 'ai-companion', 'mobile-review']`
  - `executeMemoUi()` currently opens `target === 'ai'` with `dialogManager.openAiWorkbenchDialog({})`
  - `openOrFocusReviewAiCompanion()` currently opens/focuses Review AI companion tabs
- Writer relay and frontend Agent registration:
  - `src/application/ApplicationContext.ts` dispatches `agent.tool.execute` to `getAgentToolService().execute()`
  - `src/application/commands/writerRelayCommandDispatcher.ts` accepts `agent.tool.execute`
  - `packages/contracts/src/kernel-rpc.ts` includes `agent.tool.execute`
  - `src/index.ts` registers frontend `memo_ui` with `addAgentAction`
- Existing protection tests:
  - `src/application/agent/__tests__/AgentToolContracts.test.ts`
  - `src/application/services/__tests__/AgentToolService.test.ts`
  - `src/application/__tests__/ApplicationContext.writer-relay.test.ts`
  - `src/__tests__/kernelWriterLeasePolicy.test.ts`
  - `packages/contracts/src/__tests__/kernel-rpc.test.ts`
  - `src/index.test.ts`

## Retired AI workbench reachability

- Browser visible entry:
  - `src/ui/browser/BrowserToolbar.vue` emits `openAiWorkbench`
  - `src/ui/browser/SRSBrowser.vue` handles `@openAiWorkbench` and calls `dialogManager.openAiWorkbenchDialog(...)`
  - `src/ui/browser/__tests__/BrowserToolbar.selection.test.ts` expects "AI Workbench"
- Review visible entry:
  - `src/ui/review/v2/ReviewView.vue` imports `AiWorkbenchPane`, tracks `reviewAIService`, `reviewAISidebarOpen`, and calls `getReviewAIWorkbenchRegistry()`
  - `src/ui/review/v2/reviewAICommands.ts` opens sidecar, standalone dialog, or companion tab
  - `src/ui/review/v2/reviewAISideAreaRuntime.ts` syncs Review AI side area context
  - Review tests stub `AiWorkbenchPane` and AI registry in several specs
- Dialog and tab managers:
  - `src/application/managers/DialogManager.ts` exposes `openAiWorkbenchDialog()`
  - `src/application/managers/TabManager.ts` imports `loadAiWorkbenchPaneComponent`, mounts `AiWorkbenchPane`, and tracks `reviewAICompanionRuntimes`
  - `src/application/managers/lazySurfaceComponents.ts` loads `@/ui/ai/AiWorkbenchPane.vue`
  - TabManager tests mock AI pane and Review AI companion runtime
- Composition root and runtime:
  - `src/application/ApplicationContext.ts` imports `createAIServiceBundle`, `AgentCardDraftService`, `AIWorkbenchService`, and exposes `getReviewAIWorkbenchRegistry()` / `getAIWorkbenchService()`
  - `src/application/factories/createAIServiceBundle.ts` wires `AIBackendSessionService`, `ReviewAIWorkbenchRegistry`, and standalone `AIWorkbenchService`
  - `src/application/services/ReviewAIWorkbenchRegistry.ts` creates standalone and per-review-session `AIWorkbenchService`
  - `src/application/services/AgentCardDraftService.ts` currently uses `LLMPort`, AI settings, and `AISiyuanPort`
- Plugin-owned AI files:
  - `src/ui/ai/*`
  - `src/application/services/AIWorkbench*.ts`
  - `src/application/services/AIChat*.ts`
  - `src/application/services/AIFlashcard*.ts`
  - `src/application/services/AIPrompt*.ts`
  - `src/application/services/AISelfTest*.ts`
  - `src/application/services/AIBackendSessionService.ts`
  - `src/application/ports/LLMPort.ts`
  - `src/infrastructure/llm/OpenAICompatibleLLMAdapter.ts`
  - `src/infrastructure/ai/KernelAINetworkProxyAdapter.ts`
  - `src/infrastructure/siyuan/AISiyuanAdapter.ts`
- Settings:
  - `src/ui/settings/SettingsPanel.vue` exposes AI Workbench settings
  - `src/ui/settings/settingsPanelViewModel.ts` adds an `ai` tab labelled "AI 工作台"
  - `src/ui/settings/settingsAIDialogs.ts` and `settingsAIViewModel.ts` reference prompt/tool/user-skill settings
  - `src/types/settings.ts` contains AI settings normalization/defaults/prompt contracts

## Acceptance Checklist

Preserve:

- Four MCP tool names and writer relay method `agent.tool.execute`.
- Typed Agent result envelopes.
- `memo_query` bounded read overview.
- `memo_card create/save/suspend/resume` via `CardApplicationService`.
- `memo_review` read-only assistance and blocked feedback/grade/commit.
- Frontend Agent `memo_ui` for supported non-AI navigation.

Delete or retire:

- Browser AI Workbench button/event/handler.
- Review AI sidecar, standalone workbench commands, companion tab, and registry use.
- DialogManager standalone AI Workbench dialog.
- TabManager Review AI companion tab runtime.
- Settings UI for plugin-owned AI provider/prompt/tool/user-skill/chat defaults.
- ApplicationContext AI Workbench service bundle and Agent draft LLM wiring.
- Plugin-owned LLM/provider/prompt/chat/session/workbench runtime with no remaining active callers.

Explicit unsupported/unavailable:

- `memo_card draft` generation without host-provided explicit candidate content.
- `memo_ui` targets `ai`, `ai-companion`, or any retired AI Workbench target.

Docs and ledger:

- `ARCHITECTURE.md` must describe Agent/MCP-only AI ownership after runtime changes.
- `docs/DDD_RESCAN_BACKLOG.md` must record production-code debt fixed/deferred.
- `docs/architecture-audits/overdesign-audit-2026-06-14.md` should stop recommending deeper plugin AI Workbench work.

Deferred decisions:

- Whether to remove `memo_card draft` from kernel schema immediately or keep typed unsupported for one release.
- Whether old AI settings/session files need a later explicit maintenance cleanup.
- Whether AI Arena is also retired; current change targets AI Workbench/chat/card-generation surfaces.

## Validation Runs

- 2026-06-15: Focused UI/manager/settings validation passed after batching around one slow `DialogManager` browser-dialog test:
  - `pnpm exec vitest run src/application/managers/DialogManager.test.ts` -> 1 file, 19 tests passed.
  - `pnpm exec vitest run src/ui/browser/__tests__/BrowserToolbar.selection.test.ts src/ui/review/v2/__tests__/ReviewView.empty-state.spec.ts src/ui/review/v2/__tests__/ReviewView.more-menu.spec.ts src/ui/review/v2/__tests__/ReviewView.neural-entry-menu.spec.ts src/ui/review/v2/__tests__/ReviewView.queue-switch.spec.ts src/ui/review/v2/__tests__/ReviewView.source-block-refresh.spec.ts src/application/managers/__tests__/DialogManager.browser-tab-convert.spec.ts src/application/managers/__tests__/DialogManager.review-header-variant.test.ts src/application/managers/TabManager.test.ts src/application/managers/__tests__/TabManager.neural-review-tab-sync.spec.ts src/application/managers/__tests__/TabManager.openReviewInNewWindow.spec.ts src/application/managers/__tests__/TabManager.review-close.spec.ts src/application/managers/__tests__/TabManager.review-snapshot-dto.spec.ts src/application/managers/__tests__/TabManager.review-transfer.spec.ts src/application/managers/__tests__/TabManager.runtime-bridge.spec.ts src/ui/settings/__tests__/SettingsPanel.test.ts src/ui/settings/__tests__/settingsFormCommands.test.ts src/ui/settings/__tests__/settingsLoadSaveCommands.test.ts src/ui/settings/__tests__/settingsLoadState.test.ts src/ui/settings/__tests__/settingsPanelViewModel.test.ts src/ui/settings/__tests__/settingsSavePayload.test.ts src/ui/settings/__tests__/settingsStateDefaults.test.ts` -> 22 files, 150 tests passed.
- 2026-06-15: Boundary/fallback validation passed:
  - `pnpm run check:boundaries` -> boundary, public review queue API, no-UI-SQL, kernel DB owner, backend migration cutover, backend runtime path, no-runtime-msgpack, hidden fallback, and SRS runtime hygiene checks passed.
  - `node scripts/check-hidden-fallbacks.cjs` -> hidden fallback gate passed.
- 2026-06-15: Frontend Agent action stale-description guard added and passed:
  - `pnpm exec vitest run src/index.test.ts` -> 1 file, 6 tests passed.
- 2026-06-15: `pnpm build` passed after removing the stale frontend `memo_ui` AI Workbench description and orphan `aiGoogleCseId` i18n key. `check-i18n.cjs` reported 0 blocking fallback/asymmetry issues, webpack compiled `kernel.js`, Vite built app bundle, and dist SRS runtime hygiene passed.
- 2026-06-15: `openspec validate retire-plugin-owned-ai-workbench --strict` passed.

## Acceptance Recheck

Rechecked on 2026-06-15 after final validation:

- Preserve confirmed: `src/kernel.ts` and `src/application/agent/AgentToolContracts.ts` keep exactly `memo_query`, `memo_card`, `memo_review`, and `memo_ui`; `packages/contracts/src/kernel-rpc.ts` still includes `agent.tool.execute`; `AgentToolService` still routes all four tools through typed envelopes.
- Delete/retire confirmed: representative retired files are absent from the working tree, including `src/ui/ai/AiWorkbenchPane.vue`, `src/ui/ai/AiWorkbenchDialog.vue`, `src/application/factories/createAIServiceBundle.ts`, `src/application/services/AIWorkbenchService.ts`, `src/application/services/ReviewAIWorkbenchRegistry.ts`, `src/application/services/AgentCardDraftService.ts`, `src/application/ports/LLMPort.ts`, `src/infrastructure/llm/OpenAICompatibleLLMAdapter.ts`, `src/infrastructure/ai/KernelAINetworkProxyAdapter.ts`, `src/infrastructure/siyuan/AISiyuanAdapter.ts`, `src/types/ai.ts`, Review AI runtime helpers, and Settings AI view-model/dialog helpers.
- Production stale scan confirmed: `git grep -n -E "AIWorkbench|AIChat|AIPrompt|AIFlashcard|AgentCardDraftService|LLMPort|OpenAICompatibleLLMAdapter|openAiWorkbenchDialog|AiWorkbenchPane|ReviewAIWorkbenchRegistry" -- src packages worker ":(exclude)*__tests__*" ":(exclude)*.test.ts" ":(exclude)*.spec.ts"` returned no production-path hits.
- Explicit unsupported confirmed: `memo_ui` retired targets `ai` and `ai-companion` remain in `AgentToolService` only as explicit unsupported handling and negative tests; `memo_card draft` remains typed unsupported/unavailable rather than plugin LLM generation.
- Docs/ledger confirmed: `ARCHITECTURE.md` describes Agent/MCP-only AI ownership and no longer lists deleted AI factory/type files as active source-map entries; `docs/DDD_RESCAN_BACKLOG.md` records fixed/deferred debt and validation; `docs/architecture-audits/overdesign-audit-2026-06-14.md` no longer recommends deepening plugin-owned AI Workbench internals.
- Deferred confirmed: AI Arena remains a separate default-off advisory experiment; old persisted AI session/settings data cleanup is left to a later explicit maintenance/migration command; historical reports/backlog entries keep past context only.
