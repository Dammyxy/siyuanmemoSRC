## Why

Browser row filtering and query matching now work, but the helper ownership is still split between application query helpers and UI datasource helpers. This keeps duplicate parser/matcher decisions alive and makes future Browser Read Model changes harder to verify.

## What Changes

- Consolidate generic Browser row filter, sort, and query helper behavior behind one shared application-owned Module.
- Keep UI `DataSourceUtils` as a thin Browser datasource action helper, not a second source of row/query truth.
- Add parity tests for deck/query/queue datasource filtering and Browser query snapshots before moving helper logic.
- Audit block-id datasource filtering, deck query kernel branches, legacy UI card filters, and backend SQL pushdown so each is either consolidated into the shared helper or explicitly covered by parity tests.
- Remove duplicate local helper branches only after characterization proves behavior parity.
- Do not change Browser-visible filter semantics, card action behavior, queue membership, or backend Browser Read Model ownership.

## Capabilities

### New Capabilities

- `browser-row-filter-helpers`: Shared Browser row filter/query/sort helper contract used by Browser query and datasource paths.

### Modified Capabilities

- None.

## Impact

- Affected code: `src/application/queries/browser/shared/BrowserRowUtils.ts`, `src/ui/browser/datasource/DataSourceUtils.ts`, Browser datasource helpers, Browser query kernels, legacy Browser card filter utilities, and focused Browser datasource/query parity tests.
- No public API change.
- No runtime storage, Review, Queue, Scheduler, Xiuyuan, or Agent/MCP behavior change.
- No backend Browser Read Model ownership change; SQL pushdown remains an adapter implementation when parity is covered.
