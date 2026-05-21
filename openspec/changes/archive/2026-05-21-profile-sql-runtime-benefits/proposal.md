## Why

SQL-first Browser, Queue Projection, Review mutation, and Xiuyuan read paths are now structurally active, but the project lacks one repeatable real-database profile that proves where SQL is already paying off and where the next index, read Module, or mutation ownership work should land.

This change turns the remaining "eat SQL benefits" work into measured evidence before optimization. It prevents speculative indexes, hidden fallback reintroduction, and full-store enumeration from creeping back into hot paths.

## What Changes

- Add a Runtime SQL profile capability that measures Browser deck reads, Queue Projection reads, Review feedback transaction cost, and Xiuyuan SQL lookups from a real `siyuanmemo.db`.
- Extend or replace the Browser-only SQL profile CLI with a deeper Module that reports budgets, timings, row counts, query plans where useful, and pass/fail status.
- Keep the profile read-only except for explicit rollback-only simulations and temporary in-memory expansion.
- Record whether Xiuyuan `findAll()` remains a management/sync full-enumeration path or needs a paged/indexed SQL read Module.
- Use profile evidence before adding indexes or new read Interfaces.

## Capabilities

### New Capabilities
- `sql-runtime-profile`: Runtime SQL profiling for Browser, Queue Projection, Review feedback, and Xiuyuan SQL paths.

### Modified Capabilities
- `sql-first-card-runtime`: Require SQL-first runtime improvements to be backed by real-database profile evidence before optimization or old-path retirement.

## Impact

- Affected code: `src/diagnostics/*`, `package.json`, worker SQL read/mutation Modules, targeted diagnostics tests.
- Affected docs: `openspec/changes/profile-sql-runtime-benefits/*`, `docs/DDD_RESCAN_BACKLOG.md`, and `ARCHITECTURE.md` only if runtime ownership or call-chain documentation changes.
- No public plugin UI change and no DB ownership change.
