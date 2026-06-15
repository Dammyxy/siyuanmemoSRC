## Context

SiYuan core now owns the Agent chat, reasoning loop, model selection, and tool orchestration. SiYuanMemo already exposes bounded Agent/MCP surfaces through `src/kernel.ts`, `src/application/agent/AgentToolContracts.ts`, and `src/application/services/AgentToolService.ts`, but it still carries a parallel plugin-owned AI Workbench stack:

- visible Browser, Review, companion-tab, dialog, and Settings entrypoints
- `AIWorkbenchService` plus many runtime helpers for chat, prompt, tool-loop, CDF, self-test cards, and session tree state
- provider/session infrastructure such as `LLMPort`, `OpenAICompatibleLLMAdapter`, `AIBackendSessionService`, prompt contracts, AI settings, and workbench session persistence
- `AgentCardDraftService`, where `memo_card draft` currently calls plugin LLM infrastructure
- `memo_ui` targets that can open `ai` and `ai-companion`

This duplicates the new host Agent direction and keeps future maintenance focused on a product area the plugin no longer wants to own. The desired steady state is smaller: SiYuanMemo provides typed MCP/Agent tools for learning data, card mutation, Review context, and UI navigation. The host Agent performs natural-language reasoning and can call those tools.

## Goals / Non-Goals

**Goals:**

- Preserve MCP tool registration for `memo_query`, `memo_card`, `memo_review`, and `memo_ui`.
- Preserve `agent.tool.execute` writer relay routing and typed `success` / `unavailable` / `validation-error` / `unsupported-operation` envelopes.
- Remove visible plugin-owned AI Workbench entrypoints from Browser, Review, tabs, dialogs, and Settings.
- Remove plugin-owned LLM/provider/prompt/session/tool-loop runtime from the active application path.
- Ensure `memo_card draft` does not call plugin-owned `LLMPort`, AI settings, prompt runtime, or heuristic fallback.
- Make `memo_ui` AI targets explicitly unsupported or unavailable after the workbench is retired.
- Sync `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` when production code changes land.

**Non-Goals:**

- Recreate the retired AI Workbench inside the plugin under a different name.
- Implement a new host-Agent UI inside SiYuanMemo.
- Migrate old plugin AI chat sessions into SiYuan core Agent history.
- Add fallback, compatibility, or dual AI paths to keep old workbench behavior alive.
- Change scheduler, queue, Xiuyuan, Review feedback, or card CRUD domain rules except where Agent/MCP facades directly call them.

## Decisions

### Decision 1: MCP remains the only AI-facing plugin contract

SiYuanMemo will keep the four MCP tools and frontend Agent action surface, but the tools will expose bounded plugin capabilities only. The kernel will keep validation and writer relay behavior, while the application facade owns read/write decisions through existing Browser/Card/Review/Dialog/Tab services.

Alternatives considered:

- Keep AI Workbench and MCP together: rejected because it preserves duplicate AI ownership and keeps deepening a retired slice.
- Remove all Agent/MCP code with the workbench: rejected because the user still wants MCP as the integration surface.

### Decision 2: Host Agent owns card generation; plugin owns explicit card writes

`memo_card create/save/suspend/resume` will remain controlled card actions through `CardApplicationService` and writer relay. Plugin-generated draft candidates will be retired. If `memo_card draft` remains in the schema during migration, it must return a typed unsupported or unavailable result, or be narrowed to validating host-provided candidates without calling plugin LLM infrastructure.

Alternatives considered:

- Keep `AgentCardDraftService` and only hide UI: rejected because it still leaves plugin-owned AI generation active.
- Add a local heuristic draft generator: rejected because it would be a hidden fallback and another plugin-owned generation path.
- Immediately remove the `draft` action from kernel schemas: possible, but higher compatibility risk for existing Agent prompts; the first safe cut is explicit typed unsupported/unavailable behavior.

### Decision 3: Retire visible AI surfaces before deleting deep runtime

Implementation should first remove user and Agent reachability, then delete or quarantine runtime internals. This avoids leaving active UI calls broken halfway through a large delete.

Expected cut order:

1. Evidence pass: record current call sites for `openAiWorkbenchDialog`, `AiWorkbenchPane`, `ReviewAIWorkbenchRegistry`, `AIWorkbenchService`, `LLMPort`, `AgentCardDraftService`, and `memo_ui` AI targets.
2. Remove Browser/Review/menu/tab/settings entrypoints and make `memo_ui` AI targets unsupported.
3. Remove Review AI sidecar/companion registry wiring and custom tab support.
4. Remove plugin LLM/chat/session/provider runtime from `ApplicationContext` and factory bundles.
5. Delete unreachable AI UI/runtime files and tests, then sync architecture/backlog.

Alternatives considered:

- Delete all AI files first: rejected because too many call sites span Browser, Review, Settings, managers, composition root, and tests.
- Leave UI visible but return unavailable: rejected for user-facing product direction; unavailable is acceptable for MCP compatibility, not visible primary UI.

### Decision 4: Explicit unavailable beats compatibility shims

Any retired AI target must fail closed with `unsupported-operation` or `unavailable`, using the existing typed Agent result envelope. No hidden local model calls, stale session reads, browser-only direct writes, or compatibility workbench loaders should remain on the active path.

Alternatives considered:

- Keep a shim that opens SiYuan core Agent from old plugin buttons: rejected because no stable ownership contract is defined here and it would make SiYuanMemo a host-Agent UI broker.
- Keep old session files readable for nostalgia/history: rejected for active runtime scope; old files can remain inert data until a separate maintenance/migration change exists.

## Risks / Trade-offs

- Breaking existing users who rely on plugin AI Workbench -> Mitigation: mark as breaking, remove visible entrypoints deliberately, and provide typed MCP errors for old Agent targets.
- Removing `memo_card draft` generation reduces convenience -> Mitigation: host Agent can generate candidate content and call `memo_card create` or `save` with explicit payloads.
- Large delete may break tests across Review, Browser, Settings, and managers -> Mitigation: staged reachability cuts with focused tests before deleting deep runtime.
- AI settings may be entangled with unrelated settings load/save normalization -> Mitigation: delete only AI-workbench-only settings fields in the first pass and keep generic settings serialization stable unless tests prove it is safe to simplify further.
- Architecture docs currently describe AI Workbench as active -> Mitigation: update `ARCHITECTURE.md` in the same production-code change that removes runtime ownership.

## Migration Plan

1. Confirm active-path evidence with grep and focused file reads.
2. Remove visible AI Workbench entrypoints and update UI tests.
3. Change MCP application behavior so `memo_ui` no longer reports or opens `ai` / `ai-companion`, and `memo_card draft` no longer invokes plugin LLM code.
4. Remove Review AI registry/companion tab wiring from managers and Review UI.
5. Remove `ApplicationContext` AI service bundle wiring, plugin LLM/provider/session services, and now-unreachable UI/runtime files.
6. Update `ARCHITECTURE.md` and append `docs/DDD_RESCAN_BACKLOG.md` task delta because production `src/` changes are expected.
7. Run focused Agent/MCP, manager, Review/Browser/Settings, boundary/fallback, build, and OpenSpec validation checks.

Rollback strategy: restore the last commit if the breaking product direction is rejected. Do not add compatibility shims during rollback; either keep the old feature or complete the retirement.

## Open Questions

- Should the kernel schema remove `memo_card draft` immediately after the first cut, or keep it as a typed unsupported action for one release?
- Should old AI settings/session data be cleaned by a later explicit maintenance command, or left inert with no runtime owner?
- Are AI Arena surfaces also retired in this product decision, or only AI Workbench/chat/card-generation surfaces in this change?
