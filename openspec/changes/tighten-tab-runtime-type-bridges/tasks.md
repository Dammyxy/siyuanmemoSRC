## 1. Focused Coverage

- [x] 1.1 Add focused tests for custom-tab lifecycle callback wiring through the typed runtime bridge.
- [x] 1.2 Add focused tests for the topbar initialization gate without TypeScript suppression.

## 2. Implementation

- [x] 2.1 Add a narrow TabManager custom-tab runtime bridge helper and route Browser, Review, and Review AI lifecycle callbacks through it.
- [x] 2.2 Replace the TopBar `@ts-ignore` initialization check with an explicit typed plugin capability.

## 3. Validation And Debt Ledger

- [x] 3.1 Verify production code no longer contains this slice's repeated custom-tab double casts or topbar suppression.
- [x] 3.2 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred type debt.
- [x] 3.3 Run focused Vitest, OpenSpec strict validation, `pnpm run check:boundaries`, `git diff --check`, and `pnpm build`.
