## 1. Characterize Current Row Semantics

- [x] 1.1 Inventory Browser row helper imports and confirm no active caller needs UI-owned generic filter/query/sort behavior.
- [x] 1.2 Audit block-id datasource filtering through `src/ui/browser/browserService.ts` and `src/ui/browser/datasource/BlockIdsDataSource.ts`; either move overlapping generic behavior to the shared helper or document why it is out of scope.
- [x] 1.3 Audit deck query kernel preset/card-type branches in `src/application/queries/browser/shared/BrowserDeckQueryKernel.ts`; either route overlapping row semantics through the shared helper or cover them with parity tests.
- [x] 1.4 Audit legacy Browser card filters in `src/ui/browser/utils/cardFilters.ts`; remove dead duplicate branches or prove active imports still need them.
- [x] 1.5 Audit backend Browser Read Model SQL pushdown in `src/infrastructure/persistence/sqlite/SqlUnifiedStorageRepository.ts`; keep SQL implementation local but add parity coverage for overlapping helper semantics.
- [x] 1.6 Extend datasource/query parity tests for document scope, legacy presets, card type filters, secondary query fields, queue snapshot filters, SQL pushdown overlap, and sort tie-breakers.
- [x] 1.7 Confirm deck datasource and queue snapshot query tests cover the same shared helper semantics used by Browser query snapshots.

## 2. Consolidate Helper Ownership

- [x] 2.1 Move any remaining generic Browser row filter/query/sort branches into `src/application/queries/browser/shared/BrowserRowUtils.ts`.
- [x] 2.2 Keep `src/ui/browser/datasource/DataSourceUtils.ts` limited to datasource actions, queue mutations, pagination helpers, and thin shared-helper re-exports.
- [x] 2.3 Remove duplicate datasource-local and legacy UI helper branches after parity tests prove the shared helper behavior.
- [x] 2.4 Keep backend SQL pushdown as a storage adapter implementation and prevent it from becoming a second UI/application helper contract.
- [x] 2.5 Avoid adding new adapters, fallback branches, or compatibility paths for row helper behavior.

## 3. Validate

- [x] 3.1 Run focused Browser helper tests for `DataSourceUtils.row-parity`, `QueueBrowserQueryKernel`, deck datasource query snapshots, and queue snapshot datasource query snapshots.
- [x] 3.2 Run focused tests for block-id datasource filtering, deck query kernel parity, legacy card filter cleanup, and SQL pushdown parity when those areas are touched.
- [x] 3.3 Run the repository boundary/fallback check required for production Browser helper edits.
- [x] 3.4 Update `docs/DDD_RESCAN_BACKLOG.md` only if implementation closes or defers a recorded Browser helper debt item.
