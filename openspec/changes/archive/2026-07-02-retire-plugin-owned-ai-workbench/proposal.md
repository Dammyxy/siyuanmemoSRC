## Why

SiYuan core now provides the Agent experience, so SiYuanMemo no longer needs to own a parallel AI chat/workbench UI, LLM provider loop, or plugin-side AI session store. Keeping both paths creates duplicate AI ownership and makes the plugin harder to maintain.

SiYuanMemo should instead expose bounded MCP/front-end Agent tools for learning data, card creation, Review assistance, and UI navigation while leaving reasoning, chat, model selection, and tool-loop orchestration to the host Agent.

## What Changes

- Retire plugin-owned AI Workbench visible entrypoints from Browser, Review, tabs, dialogs, and settings after reachability evidence confirms the MCP tools cover required Agent workflows.
- Preserve kernel MCP tools `memo_query`, `memo_card`, `memo_review`, and `memo_ui`, including action validation, writer relay routing, and typed unavailable results.
- Preserve controlled card/query/review/UI application facades used by Agent tools.
- Remove or quarantine plugin-owned AI chat/workbench runtime, LLM provider orchestration, prompt/session/tool-loop services, AI session persistence, and AI-specific UI assets in staged cuts.
- Replace any `memo_ui` AI target with explicit unsupported/unavailable behavior rather than reopening the retired plugin AI workbench.
- Update architecture/audit/backlog docs so future overdesign work does not keep deepening AI Workbench internals that are no longer product direction.
- **BREAKING**: Plugin-owned AI Workbench UI and plugin-side AI chat sessions will stop being a supported plugin feature.

## Capabilities

### New Capabilities

- `agent-mcp-only-ai-retirement`: Defines the post-retirement contract where SiYuanMemo exposes MCP/Agent tools and no longer owns plugin-side AI Workbench UI or LLM chat runtime.

### Modified Capabilities

- None.

## Impact

- Active product root: `H:/project-F/flashcard/.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`
- MCP / Agent surfaces to preserve:
  - `src/kernel.ts`
  - `src/application/agent/AgentToolContracts.ts`
  - `src/application/services/AgentToolService.ts`
  - `src/application/services/AgentCardDraftService.ts`
  - writer relay method `agent.tool.execute`
- Plugin-owned AI surfaces to audit and likely retire:
  - `src/ui/ai/*`
  - `src/application/services/AIWorkbench*.ts`
  - `src/application/services/AIChat*.ts`
  - `src/application/services/AIFlashcard*.ts`
  - `src/application/services/AIPrompt*.ts`
  - `src/application/services/AIBackendSessionService.ts`
  - `src/application/services/ReviewAIWorkbenchRegistry.ts`
  - `src/application/factories/createAIServiceBundle.ts`
  - `src/application/managers/DialogManager.ts`
  - `src/application/managers/TabManager.ts`
  - Review/Browser AI entrypoints
  - AI settings tied only to plugin-owned chat/workbench
- Validation: reachability evidence, MCP/Agent contract tests, frontend entrypoint deletion tests, boundary/fallback checks, build, and strict OpenSpec validation.
