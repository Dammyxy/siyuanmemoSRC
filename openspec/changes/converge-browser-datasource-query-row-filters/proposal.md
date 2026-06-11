## Why

Browser datasource helpers and Browser query row helpers still own parallel row filtering, sorting, and simple-query behavior after the `cardFilters` facade cleanup. This keeps type debt alive in the Browser slice and forces future filter fixes to preserve two implementations by hand.

## What Changes

- Converge Browser UI datasource row sorting/filtering on the shared application Browser row helper contract.
- Preserve current Browser deck rows, queue snapshot rows, missing-block filtering, card-type filtering, and secondary-field simple-query behavior.
- Add focused parity coverage before deleting duplicated datasource helper code.
- Remove local duplicated Browser datasource row-like types and casts only inside the Browser datasource/query helper slice.

## Capabilities

### New Capabilities
- `browser-row-query-filters`: Browser row filtering/sorting helpers preserve deck/query row parity through one typed helper contract.

### Modified Capabilities

## Impact

- Affected code: `src/application/queries/browser/shared/BrowserRowUtils.ts`, `src/ui/browser/datasource/DataSourceUtils.ts`, focused Browser datasource/query helper tests, OpenSpec task ledger, and `docs/DDD_RESCAN_BACKLOG.md`.
- No JSON-RPC method strings, SQL worker authority, writer relay, kernel sidecar ownership, Review storage, or ApplicationContext wiring changes.
