## Context

SiYuanMemo has already retired the plugin-owned AI Workbench and shifted AI-facing behavior to `AgentToolService`, where host SiYuan Agent/MCP owns reasoning and calls bounded plugin tools. Arena is the remaining mismatch: it still models AI strategy packs, AI prompt/tool overrides, AI scenario pools, AI match events, and a visible Arena manager. SRS Arena is less directly conflicting, but as a visible product surface it still suggests the plugin is an algorithm playground.

Current product direction:

- Core product: memory system + progressive reading.
- SiYuan role: content host.
- Review and Browser: equally important learning surfaces.
- AI role: host Agent integration through explicit plugin tools, not plugin-owned chat/prompt/session/runtime.
- Compatibility debt: one-time migration, then delete.

## Goals / Non-Goals

**Goals:**

- Remove the user-facing Arena surface from active product navigation.
- Retire AI Arena modules whose interface exists to select prompts, tools, skills, or AI strategy packs.
- Keep host Agent/MCP as the only AI-facing seam.
- Keep only the smallest SRS comparison evidence needed by existing tests or diagnostics, and keep it hidden from normal UI.
- Fail closed or return explicit unsupported for retired Arena UI/actions; do not add fallback paths.
- Update docs/backlog to state that Arena is retired or internal-only.

**Non-Goals:**

- Redesign Review, Browser, Progressive, or Agent tool contracts.
- Add a new algorithm plugin system.
- Migrate historical Arena analytics into a new product feature.
- Delete unrelated AI-retirement history docs or old comparison-only documentation.
- Change formal scheduler ownership or Review feedback commit semantics.

## Decisions

1. Retire AI Arena instead of keeping it default-off.

   Default-off still leaves a broad interface: strategy packs, prompt overrides, tool policy overrides, scenario pools, and manager state. Deletion gives more locality: AI-facing behavior remains in `AgentToolService`, while learning behavior remains in Browser/Card/Review/Progressive owners.

   Alternative considered: keep AI Arena as hidden experimental settings. Rejected because it preserves the same shallow module surface without a current product need.

2. Hide SRS Arena rather than fully deleting SRS evidence in the first cut.

   SRS recommendation code is tied into review diagnostics and some tests. The lazy safe cut is to remove visibility and product promises first, then delete internal SRS comparison only if the next trace proves it has no active diagnostic value.

   Alternative considered: delete all Arena modules immediately. Rejected for this change because it risks mixing UI/product retirement with scheduler diagnostic cleanup.

3. Keep Agent/MCP as the assistance seam.

   `AgentToolService` already has a narrow interface: bounded query, card create/save/suspend/resume, review read context, and non-AI UI opening. It gives leverage without plugin-owned LLM/provider/prompt/session code.

   Alternative considered: route Agent calls through Arena challenge/strategy logic. Rejected because host Agent owns reasoning.

4. Normalize retired persisted settings at load/save time.

   Stored `arena.ai`, AI scenario packs, prompt overrides, retired manager selections, and visible Arena preferences should not re-enable UI or runtime paths after upgrade. Existing records may remain as inert historical data only if deleting them requires risky storage migration.

   Alternative considered: one-off destructive data deletion. Rejected for first cut; normalization is safer and proves behavior without mutating user history unnecessarily.

## Risks / Trade-offs

- Existing tests may depend on Arena manager view models -> update tests to assert retired/hidden behavior or move SRS-only diagnostics behind narrower helpers.
- Historical settings may still contain Arena data -> normalization must make that data inert.
- Review code may still import Arena for SRS advisory -> keep internal-only adapter until a follow-up deletion trace proves safe.
- Users who enabled Arena lose visible UI -> acceptable breaking change because Arena is not part of the confirmed product core.

## Migration Plan

1. Remove UI entrypoints and visible labels for Arena manager / AI strategy Arena.
2. Change settings normalization so retired AI Arena config is ignored and Arena stays disabled/hidden.
3. Remove AI Arena selection/event paths from `ArenaKernelService`, or replace them with explicit unsupported if external callers remain.
4. Keep SRS comparison only behind internal diagnostics, with no menu/dialog/settings entry.
5. Update architecture docs and backlog.
6. Validate with focused Arena, Review, settings, ApplicationContext, hidden fallback, boundaries, and build checks.

Rollback: restore the prior change from git if Arena visibility must return. No destructive data migration is planned in this slice.

## Open Questions

- After this cut, should hidden SRS comparison diagnostics be deleted too if no non-test active caller remains?
- Should historical Arena SQL tables be left for audit or removed in a later storage slimming change?
