## 1. Contract Inventory

- [x] 1.1 Inventory exports in `src/types/unified-data-source.ts` and group them by queue core, projection/readiness, manager facade, NeuralRoam session, Browser filter/session transfer, data router, UI config, errors, and helpers.
- [x] 1.2 Identify low-risk Browser/Review/Queue import sites to migrate as proof points.
- [x] 1.3 Add a migration note documenting which exports remain barrel-only after this slice.

## 2. Characterization And Parity

- [x] 2.1 Add type-level or focused tests proving selected public exports remain available through `@/types/unified-data-source`.
- [x] 2.2 Add focused tests for selected Browser/Review/Queue import sites before moving their imports.
- [x] 2.3 Run characterization tests or document existing coverage before the split.

## 3. Contract Split

- [x] 3.1 Create queue core/review contract module and re-export it from the compatibility barrel.
- [x] 3.2 Create queue projection/readiness contract module and re-export it from the compatibility barrel.
- [x] 3.3 Create Browser filter/session transfer contract module and re-export it from the compatibility barrel.
- [x] 3.4 Create NeuralRoam session queue contract module and re-export it from the compatibility barrel.
- [x] 3.5 Move shared errors/helpers only when their target family is clear; otherwise leave them in the compatibility barrel and document why.

## 4. Import Migration

- [x] 4.1 Migrate selected Browser import sites to Browser/projection contract modules.
- [x] 4.2 Migrate selected Review or Queue import sites to queue core/review contract modules.
- [x] 4.3 Avoid repo-wide import churn; leave unrelated callers on the compatibility barrel.
- [x] 4.4 Remove any duplicate type aliases made unnecessary by the split.

## 5. Verification And Documentation

- [x] 5.1 Run focused Browser/Review/Queue tests for migrated import sites.
- [x] 5.2 Run `openspec validate split-unified-data-source-contracts --strict`.
- [x] 5.3 Run `pnpm run check:boundaries`, `node scripts/check-hidden-fallbacks.cjs`, `git diff --check`, and `pnpm build`.
- [x] 5.4 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred contract-split debt.
