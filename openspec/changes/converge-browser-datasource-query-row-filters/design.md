## Context

`BrowserRowUtils` already owns Browser application query row filtering and sorting for deck/query kernels. `DataSourceUtils` still repeats the same generic row types, sort normalization, missing-block detection, preset filtering, card-type filtering, and secondary-field simple-query fallback for Browser UI datasources.

The previous Browser type-debt slice moved `cardFilters.ts` behind the typed Browser helper contract but intentionally deferred datasource/query row convergence because it spans queue snapshot rows and deck/query rows.

## Goals / Non-Goals

**Goals:**
- Make `DataSourceUtils` reuse the shared Browser row helper contract for row filtering and sorting.
- Keep existing public `DataSourceUtils` exports stable for Browser datasource callers.
- Prove parity for queue snapshot rows, deck/card rows, missing-block rows, card-type filters, simple free-text fallback, and sort behavior.
- Reduce production `unknown as` casts and duplicated row-like types in the UI datasource helper.

**Non-Goals:**
- No Browser UX or query semantic changes.
- No ApplicationContext, backend worker, SQL worker, writer relay, kernel sidecar, Review adapter, or storage changes.
- No repo-wide TypeScript strictness changes.

## Decisions

1. Use `BrowserRowUtils` as the single row filtering/sorting implementation.
   - Rationale: application query kernels already use it, and UI may depend on application helpers under the existing `ui -> application` direction.
   - Alternative rejected: keep both helper implementations and only tighten local types. That preserves duplicate behavior and keeps the next filter fix risky.

2. Keep `DataSourceUtils` as a facade for Browser datasource callers.
   - Rationale: datasource classes and tests already import from this module. Re-exporting shared helpers avoids broad import churn.
   - Alternative rejected: move every caller directly to `BrowserRowUtils`; that increases blast radius without improving the type seam.

3. Add parity tests before implementation.
   - Rationale: this is behavior-preserving type debt cleanup. Tests must lock current queue snapshot/deck row behavior before deleting duplicate code.
   - Alternative rejected: rely on existing datasource tests only. They do not prove both helper surfaces remain aligned.

## Risks / Trade-offs

- Risk: subtle simple-query fallback drift between headline and full-content rows. Mitigation: focused tests cover both secondary fields.
- Risk: sort null/invalid ordering changes. Mitigation: parity test covers queue snapshot sorting and Browser row sorting through the datasource facade.
- Risk: facade import cycle. Mitigation: `DataSourceUtils` imports only the application shared helper, while shared helper does not import UI datasource modules.
