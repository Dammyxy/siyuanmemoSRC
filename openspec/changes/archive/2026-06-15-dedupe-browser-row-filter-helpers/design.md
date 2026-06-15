## Context

Browser filtering, query matching, and sorting are exercised from two active paths:

- Application Browser query snapshots, anchored in `src/application/queries/browser/shared/BrowserRowUtils.ts`.
- UI Browser datasource helpers, anchored in `src/ui/browser/datasource/DataSourceUtils.ts`.
- Block-id datasource queries, deck query kernels, legacy Browser card filter utilities, and backend SQL read-model pushdown also contain row/query decisions that can drift from the shared helper contract.

`DataSourceUtils` already delegates many row helpers to `BrowserRowUtils`, but the interface remains split: callers can still learn row/query behavior from a UI datasource file that also owns mutation actions, queue operations, and pagination helpers. That keeps the Module shallow at the UI seam and makes future Browser Read Model changes harder to verify.

The change is a behavior-preserving deepening of the application-owned Browser row helper Module. It must not change Browser-visible filtering, query parsing, sort ordering, queue membership, delete/suspend actions, or backend projection ownership.

## Goals / Non-Goals

**Goals:**

- Make `BrowserRowUtils` the single application-owned Module for generic Browser row filtering, query matching, and sorting.
- Keep `DataSourceUtils` focused on datasource actions and thin compatibility exports while active callers migrate.
- Preserve behavior parity for deck datasource rows, queue snapshot rows, and Browser query snapshots.
- Concentrate future test coverage at the shared helper interface, with UI datasource tests proving delegation rather than duplicating semantics.

**Non-Goals:**

- No Browser UI behavior change.
- No public Browser Read Model, backend projection, Queue, Review, Scheduler, Xiuyuan, or MCP behavior change.
- No new adapter or broad seam unless a real second implementation appears.
- No fallback or compatibility branch that hides row/query mismatches.
- No rewrite of backend SQL pushdown into JavaScript row helpers; SQL remains an adapter implementation with parity coverage.

## Decisions

### Decision: Put row semantics behind the application Browser helper Module

`BrowserRowUtils` remains the interface for generic row helpers: doc filtering, legacy preset filtering, card type filtering, simple query matching, queue filter composition, and row sorting.

Rationale: query snapshots and datasource paths need the same row semantics. Keeping them behind one application-owned Module gives callers leverage and keeps bug fixes local.

Alternatives considered:

- Keep behavior in UI datasource helpers. Rejected because UI datasource helpers also own actions and queue mutations; mixing those concerns makes the Module shallow.
- Create a new adapter seam for row helpers. Rejected because there is only one implementation. A new seam would be hypothetical and would increase interface surface.

### Decision: Keep `DataSourceUtils` as a thin facade during migration

`DataSourceUtils` may continue to re-export shared row helpers for existing callers, but it must not own independent generic row/query/sort implementation.

Rationale: this keeps the change bounded and preserves imports while making ownership explicit. The facade can be deleted later if callers no longer need it.

Alternatives considered:

- Rewrite all callers in one step. Rejected because import churn increases review risk without changing behavior.
- Leave duplicate helper branches in place. Rejected because drift is the debt this change exists to remove.

### Decision: Characterize before deleting duplicate branches

Before moving or deleting helper logic, tests must prove parity for Browser cards and queue snapshot rows across datasource and query paths.

Rationale: row filtering has subtle semantics: missing blocks, secondary query fields, queue due filters, CDF diagnostics, null sort placement, and stable tie-breakers. Characterization makes the refactor mechanical.

Alternatives considered:

- Refactor first, then update tests. Rejected because a behavior-preserving change needs a clear before/after contract.

### Decision: Treat backend SQL pushdown as an adapter implementation

Backend Browser Read Model SQL filtering and sorting may keep SQL-specific implementation details, but the behavior must be covered by parity tests against the shared row helper contract for overlapping semantics.

Rationale: SQL pushdown exists for performance and storage locality. Forcing SQL callers through JavaScript row helpers would increase coupling and reduce backend leverage. The useful seam is the behavior contract, not a single implementation language.

Alternatives considered:

- Move all SQL pushdown semantics into `BrowserRowUtils`. Rejected because SQL filtering/sorting is a storage adapter implementation and would lose performance locality.
- Ignore SQL pushdown. Rejected because unchecked drift would preserve the same class of Browser query debt.

## Risks / Trade-offs

- Hidden caller depends on `DataSourceUtils` row helper exports -> keep re-exports during this change and inventory imports before deleting any facade export.
- Sort/filter behavior changes accidentally -> extend parity tests before moving logic; include queue snapshot and BrowserCard row shapes.
- Shared helper becomes a dumping ground -> limit the Module to row filter/query/sort semantics; keep datasource mutations and queue actions in `DataSourceUtils`.
- Facade remains forever -> record a follow-up only after all active callers import the application helper directly.
- SQL pushdown drifts from helper semantics -> add parity coverage for overlapping SQL filter/sort/query behavior and keep SQL-only implementation details documented as adapter behavior.
