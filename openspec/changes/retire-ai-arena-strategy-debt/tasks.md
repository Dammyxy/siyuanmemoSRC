## 1. Scope And Contracts

- [x] 1.1 Trace active Arena entrypoints from `ApplicationContext`, `DialogManager`, Settings, Review chrome, and Agent/MCP seams.
- [x] 1.2 Decide which SRS Arena internals are still active diagnostics and mark all user-facing SRS Arena paths retired/hidden.
- [x] 1.3 Add or update focused tests for retired Arena UI/action behavior before production edits.

## 2. Arena Runtime Retirement

- [x] 2.1 Remove AI Arena strategy-pack selection, prompt/tool override, scenario pool, and event recording from active runtime paths.
- [x] 2.2 Hide or remove Arena manager dialog registration, topbar/menu/settings entries, Review Arena commands, banners, and conflict/advisory UI.
- [x] 2.3 Keep any remaining SRS comparison code internal-only, with no user-visible controls and no scheduler write ownership.
- [x] 2.4 Normalize retired Arena settings so persisted `arena.ai` and manager state cannot re-enable hidden behavior.

## 3. Agent/MCP Ownership

- [x] 3.1 Ensure `AgentToolService` remains the only AI-facing application seam and does not route through Arena.
- [x] 3.2 Add explicit unsupported handling for Arena or retired AI UI targets that can still arrive through public seams.

## 4. Documentation And Validation

- [x] 4.1 Update `ARCHITECTURE.md`, `CONTEXT.md`, and `docs/DDD_RESCAN_BACKLOG.md` to reflect Arena retirement / internal-only SRS diagnostics.
- [x] 4.2 Run focused Arena, Settings, Review, AgentToolService, and ApplicationContext tests.
- [x] 4.3 Run `node scripts/check-hidden-fallbacks.cjs`, `pnpm run check:boundaries`, `pnpm build`, `openspec validate retire-ai-arena-strategy-debt --strict`, and `git diff --check`.
