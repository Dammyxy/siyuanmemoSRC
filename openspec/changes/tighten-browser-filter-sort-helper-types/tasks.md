## 1. Focused Coverage

- [x] 1.1 Add focused Browser helper tests proving `cardFilters` parsed-query matching and numeric conditions match the typed Browser helpers.
- [x] 1.2 Add focused Browser helper tests proving SQL detection and card-type filters keep current UI behavior.

## 2. Implementation

- [x] 2.1 Re-export or delegate `NumberCondition`, `checkNumberCondition()`, and `matchesParsedQuery()` from `cardFilters.ts` to the typed Browser helper implementation.
- [x] 2.2 Remove duplicated local parsed-query matcher logic and duplicate local `CardTypeFilter` alias from `cardFilters.ts` without changing UI helper imports.

## 3. Validation And Debt Ledger

- [x] 3.1 Verify filtered `tsc --noEmit` no longer reports `cardFilters.ts` or new Browser helper test matches.
- [x] 3.2 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred Browser type/helper debt.
- [x] 3.3 Run focused Vitest, OpenSpec strict validation, `pnpm run check:boundaries`, `git diff --check`, and `pnpm build`.
