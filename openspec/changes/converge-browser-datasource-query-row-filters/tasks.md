## 1. Parity Coverage

- [x] 1.1 Add focused Browser datasource/query parity tests for queue snapshot filters, deck/card simple-query secondary fields, and row sorting behavior.
- [x] 1.2 Run the focused parity test in red state before the production refactor, or document why existing behavior already passes pre-refactor.

## 2. Helper Convergence

- [x] 2.1 Export the minimal shared Browser row helper types needed by `DataSourceUtils` without changing filter/sort behavior.
- [x] 2.2 Refactor `DataSourceUtils` to re-export/delegate shared Browser row filtering and sorting helpers, preserving existing public imports.
- [x] 2.3 Remove duplicated local row-like types, sort normalization, missing-block, preset, card-type, and simple-query implementations from `DataSourceUtils`.

## 3. Validation And Ledger

- [x] 3.1 Run focused Browser datasource/query helper Vitest coverage.
- [x] 3.2 Run `openspec validate converge-browser-datasource-query-row-filters --strict`.
- [x] 3.3 Run `pnpm run check:boundaries`, `git diff --check`, and targeted TypeScript/build checks as needed.
- [x] 3.4 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed/deferred type debt.
