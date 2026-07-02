## Why

SiYuanMemo is now positioned as a self-contained memory system and progressive-reading system, with SiYuan as the content host and SiYuan Agent/MCP as the AI reasoning owner. The current Arena slice still exposes plugin-owned AI strategy-pack competition and a user-facing SRS algorithm arena, which keeps the product shaped like an experiment platform rather than the core learning tool.

## What Changes

- Retire plugin-owned AI Arena strategy-pack selection, prompt overrides, AI scenario pools, AI match recording, and AI-facing Arena manager UI.
- Hide SRS algorithm Arena from user-facing navigation and review chrome; any retained SRS comparison must be internal diagnostics/advisory evidence only.
- Keep `AgentToolService` / MCP as the only AI-facing integration seam, limited to bounded Browser/Card/Review/UI capabilities.
- Remove or normalize persisted Arena settings that only serve retired AI Arena surfaces, prompts, skills, tool policies, or manager state.
- Update architecture docs and debt ledger so Arena is no longer described as a main runtime surface.
- **BREAKING**: Users can no longer open or manage Arena AI strategy packs or SRS Arena experiments from plugin UI.

## Capabilities

### New Capabilities
- `arena-retirement`: Defines retired Arena behavior, hidden SRS Arena visibility, and the remaining Agent/MCP assistance seam.

### Modified Capabilities

## Impact

- Affected code: `src/types/arena.ts`, `src/application/services/ArenaKernelService.ts`, `src/application/services/ArenaStoreService.ts`, `src/application/ApplicationContext.ts`, `src/application/managers/DialogManager.ts`, `src/ui/arena/*`, `src/ui/review/v2/reviewArenaCommands.ts`, settings normalization, i18n, and focused Arena/Review/ApplicationContext tests.
- Affected docs: `ARCHITECTURE.md`, `CONTEXT.md`, and `docs/DDD_RESCAN_BACKLOG.md`.
- No new dependencies.
