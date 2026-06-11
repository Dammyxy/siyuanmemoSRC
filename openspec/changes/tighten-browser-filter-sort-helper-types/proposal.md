## Why

Browser query filtering still has two implementations of parsed-query numeric matching: `src/types/browser.ts` owns the typed source of truth, while `src/ui/browser/utils/cardFilters.ts` repeats the same matcher and type aliases. This keeps local type debt alive and makes future Browser query changes easy to drift.

## What Changes

- Make Browser UI query helper exports delegate parsed-query matching and numeric condition checks to the typed Browser helper implementation.
- Add focused coverage proving the UI helper facade and typed Browser source produce identical parsed-query matching behavior.
- Keep Browser query syntax, preset semantics, card-type filter semantics, datasource filtering, and SQL read ownership unchanged.
- Keep application/core Browser query helpers and backend/SQL paths out of scope.

## Capabilities

### New Capabilities
- `browser-filter-sort-helper-types`: Browser UI filter/sort helper typing and facade ownership.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/types/browser.ts`, `src/ui/browser/utils/cardFilters.ts`, focused Browser helper tests, and `docs/DDD_RESCAN_BACKLOG.md`.
- APIs: no public API, storage, SQL, queue, Review, backend RPC, writer relay, or kernel sidecar changes.
- Dependencies: no new runtime dependency.
