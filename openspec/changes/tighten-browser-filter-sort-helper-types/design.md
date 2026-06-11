## Context

The active Browser UI path calls `useCardFilter()`, datasource helpers, and `SRSBrowser.vue` through `src/ui/browser/utils/cardFilters.ts`. That file still implements its own `NumberCondition`, `CardTypeFilter`, `checkNumberCondition()`, and `matchesParsedQuery()` even though `src/types/browser.ts` now exports the typed `ParsedBrowserQuery` contract and matching implementation used by `browserService.ts`.

## Goals / Non-Goals

**Goals:**

- Make `src/types/browser.ts` the single source of truth for parsed-query numeric matching.
- Keep `src/ui/browser/utils/cardFilters.ts` as a small UI-facing facade for existing imports.
- Preserve current SQL statement detection, preset filtering, card-type filtering, and Browser UI behavior.
- Remove local duplicate type aliases where they can be imported from the typed Browser contract.

**Non-Goals:**

- Do not redesign Browser datasource filtering, queue projection filtering, or application query kernels.
- Do not change advanced SQL query syntax or Browser search semantics.
- Do not touch `ApplicationContext`, backend RPC, SQL worker ownership, writer relay, or kernel sidecar behavior.
- Do not enable repo-wide `strict` or fix unrelated Browser UI/i18n/test-noise debt.

## Decisions

- Delegate `checkNumberCondition()` and `matchesParsedQuery()` from `cardFilters.ts` to `src/types/browser.ts`.
  - Rationale: callers keep stable imports while the implementation and types live in one place.
  - Alternative considered: move all filtering helpers into `cardFilters.ts`. Rejected because `browserService.ts` and shared Browser row helpers already consume `src/types/browser.ts` as the typed Browser contract.
- Keep `extractSqlStatement()`, preset filters, and card-type filters in `cardFilters.ts` for this slice.
  - Rationale: their semantics differ from the typed parsed-query matcher and are UI-helper behavior, not query parser ownership.
- Use focused facade tests instead of broad mounted Browser tests.
  - Rationale: this is type/helper debt, and the visible behavior is preserved through pure helper outputs.

## Risks / Trade-offs

- The facade still exists as an import compatibility layer for UI code. Mitigation: it no longer owns duplicated parsed-query logic, so future matcher changes stay local to the typed Browser contract.
- Broader Browser datasource filtering still has separate generic row helper logic. Mitigation: leave it for a separate Browser read-model cleanup because it crosses application query rows and queue snapshot rows.
