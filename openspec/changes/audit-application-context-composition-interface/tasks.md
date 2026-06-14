## 1. Composition Audit

- [x] 1.1 Inventory `ApplicationContext` public getters and internal factory consumers by Browser, Review, storage, sync, backend runtime, UI manager, and integration slices.
- [x] 1.2 Create or update an architecture audit section documenting high-traffic broad dependencies and next safe migration slices.
- [x] 1.3 Identify at least one low-risk factory seam to narrow in this change without changing service lifetime or startup order.

## 2. Characterization Tests

- [x] 2.1 Add focused tests or assertions that capture current Review/Browser service bundle dependencies and startup wiring behavior.
- [x] 2.2 Add focused tests or assertions for backend runtime bundle dependency shape where the seam is touched.
- [x] 2.3 Run the focused characterization tests in red state or document which current behavior already passes before refactor.

## 3. Interface Narrowing

- [x] 3.1 Add narrow internal composition Interfaces for the selected Review/Browser and/or backend runtime factory seams.
- [x] 3.2 Refactor selected factories to consume the narrow Interfaces while keeping `ApplicationContext` as the external composition root.
- [x] 3.3 Keep public `ApplicationContext` getters compatible and document any remaining broad getter debt.
- [x] 3.4 Remove any pass-through factory types that fail the deletion test after the new seam is introduced.

## 4. Verification And Documentation

- [x] 4.1 Run focused composition root, factory, and startup wiring tests.
- [x] 4.2 Run `openspec validate audit-application-context-composition-interface --strict`.
- [x] 4.3 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, `git diff --check`, and `pnpm build`.
- [x] 4.4 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred ApplicationContext interface debt.
