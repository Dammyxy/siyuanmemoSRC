## 1. Evidence And Acceptance Gate

- [x] 1.1 Capture current reachability evidence for MCP keep-surface symbols: `AGENT_MCP_TOOL_NAMES`, `AgentToolContracts`, `AgentToolService`, `agent.tool.execute`, frontend `memo_ui` action registration, and writer relay tests.
- [x] 1.2 Capture current reachability evidence for retired AI surface symbols: `openAiWorkbenchDialog`, `AiWorkbenchPane`, `ReviewAIWorkbenchRegistry`, `AIWorkbenchService`, `createAIServiceBundle`, `AIBackendSessionService`, `AIChat*`, `AIPrompt*`, `AIFlashcard*`, `LLMPort`, `OpenAICompatibleLLMAdapter`, and `AgentCardDraftService`.
- [x] 1.3 Rebuild the implementation acceptance checklist from `proposal.md`, `design.md`, and `specs/agent-mcp-only-ai-retirement/spec.md`, marking preserve/delete/defer decisions before editing production code.

## 2. MCP And Agent Contract Cut

- [x] 2.1 Update `AgentToolContracts` and kernel MCP descriptions/schemas so MCP tool names remain `memo_query`, `memo_card`, `memo_review`, and `memo_ui`, while retired AI behavior is not advertised as plugin-generated AI.
- [x] 2.2 Change `memo_card draft` handling so it no longer calls `AgentCardDraftService`, `LLMPort`, AI settings, plugin prompt runtime, or local heuristic generation; return typed unsupported/unavailable unless it only validates explicit host-provided candidates.
- [x] 2.3 Keep `memo_card create/save/suspend/resume` routed through `CardApplicationService` and writer relay, with tests proving explicit candidate/card payloads still persist through controlled card writes.
- [x] 2.4 Keep `memo_review` read-only assistance and blocked feedback/grade/commit behavior, with tests covering blocked actions and unavailable context.
- [x] 2.5 Remove `memo_ui` `ai` and `ai-companion` targets from available target reporting and make requests for retired AI targets return typed unsupported/unavailable without opening plugin AI UI.

## 3. Visible AI Workbench Entry Retirement

- [x] 3.1 Remove Browser toolbar/menu/action wiring that opens plugin AI Workbench, and update Browser tests so no AI Workbench button or event remains expected.
- [x] 3.2 Remove Review AI sidecar, more-menu commands, imported `AiWorkbenchPane`, and review AI command/runtime helpers from the active Review UI path.
- [x] 3.3 Remove Review AI companion custom tab support from `TabManager` and associated tests, or reduce it to explicit unsupported behavior if an external caller still reaches it during the transition.
- [x] 3.4 Remove standalone AI Workbench dialog support from `DialogManager`, lazy surface loaders, and dialog tests.
- [x] 3.5 Remove Settings UI sections and dialogs that only configure plugin-owned AI Workbench provider, prompt, user skill, tool permission, and chat defaults.

## 4. Runtime And Service Deletion

- [x] 4.1 Remove `createAIServiceBundle` and `ApplicationContext` AI Workbench/Review AI/Agent draft wiring from active runtime composition.
- [x] 4.2 Delete or quarantine now-unreachable `AIWorkbench*`, `AIChat*`, `AIPrompt*`, `AIFlashcard*`, `AISelfTest*`, `AIBackendSessionService`, plugin LLM adapter/port, and AI session persistence files after import evidence proves they have no non-retired active caller.
- [x] 4.3 Remove retired AI settings types, defaults, normalization, load/save payload paths, and i18n keys only where they are workbench-only and no longer read by active runtime.
- [x] 4.4 Remove or rewrite tests that only assert retired plugin AI Workbench behavior; keep/adjust tests that protect MCP, card CRUD, Review read-only context, and settings compatibility still in scope.
- [x] 4.5 Run a stale import scan for `AIWorkbench`, `AIChat`, `AIPrompt`, `AIFlashcard`, `AgentCardDraftService`, `LLMPort`, `openAiWorkbenchDialog`, `AiWorkbenchPane`, `ai-companion`, and `memo_ui` AI targets, then delete remaining dead files.

## 5. Documentation And Debt Ledger

- [x] 5.1 Update `ARCHITECTURE.md` so SiYuanMemo's active AI ownership is Agent/MCP-only and retired AI Workbench paths are not described as active runtime.
- [x] 5.2 Append a `docs/DDD_RESCAN_BACKLOG.md` task delta describing retired AI Workbench debt fixed, residual deferred debt, next safe step, and validation.
- [x] 5.3 Update the overdesign audit notes, if present, so future recommendations no longer deepen plugin-owned AI Workbench internals.

## 6. Validation

- [x] 6.1 Run focused Agent/MCP tests: `src/application/agent/__tests__/AgentToolContracts.test.ts`, `src/application/services/__tests__/AgentToolService.test.ts`, `src/application/__tests__/ApplicationContext.writer-relay.test.ts`, `src/__tests__/kernelWriterLeasePolicy.test.ts`, and `packages/contracts/src/__tests__/kernel-rpc.test.ts`.
- [x] 6.2 Run focused UI/manager/settings tests affected by deleted entrypoints, including Browser toolbar, Review menu/side-area, `DialogManager`, `TabManager`, and Settings tests that remain after the cut.
- [x] 6.3 Run boundary/fallback checks: `pnpm run check:boundaries` and `node scripts/check-hidden-fallbacks.cjs`.
- [x] 6.4 Run `pnpm build`.
- [x] 6.5 Run `openspec validate retire-plugin-owned-ai-workbench --strict`.
- [x] 6.6 Re-run the acceptance checklist from task 1.3 and confirm every preserve/delete/defer item is implemented, covered, documented, or explicitly deferred.
