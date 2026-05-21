## Context

`deepen-sql-first-card-runtime` moved the active runtime to SQL-first reads and the first SQL-first Review mutation slice. The remaining work is not another blind migration: it needs real-database measurements for the active runtime paths before adding indexes, changing read Interfaces, or broadening mutation ownership.

Current state:

- `src/diagnostics/browserSqlProfile.ts` profiles Browser SQL reads from a supplied SQLite file.
- Browser, Queue Projection, Review feedback, and Xiuyuan SQL paths now have worker/runtime Modules.
- `phone-siyuanmemo-after-cloud-sync.db` is available as a small real DB fixture in the active worktree.
- Xiuyuan `findAll()` remains a full-enumeration management/sync path until caller evidence says otherwise.

## Goals / Non-Goals

**Goals:**

- Create a deeper Runtime SQL profile Module with one public diagnostic Interface.
- Measure Browser deck page/matched IDs/rows/stats, Queue Projection snapshot/rowsByIds/counters, Review feedback transaction, and Xiuyuan `findById`/`findByBlockId`.
- Include row counts, latency budgets, pass/fail status, and query plans for SQL shapes where plans are useful.
- Keep profile runs deterministic enough for CI/local validation while still accepting a real DB path.
- Use results to decide whether the next optimization is indexes, read Interface shape, or no-op.

**Non-Goals:**

- No UI change.
- No live SiYuan window smoke in this change.
- No kernel companion DB writes.
- No SQL ownership change for production runtime.
- No broad migration of all mutation families in this slice.

## Decisions

1. **Deepen the diagnostics Module instead of adding separate scripts.**

   `browserSqlProfile.ts` already proves the CLI and test seam. Expanding it into a Runtime SQL profile keeps leverage high: one Interface accepts bytes/db path and returns all profile families. Separate scripts would duplicate SQL loading, timing, budgets, and output formatting.

2. **Profile from SQLite bytes, not production runtime objects.**

   The profile is a diagnostic Adapter over a copied DB file. This avoids coupling tests to worker startup and keeps the profile read-only for real DB input. Rollback-only mutation simulations run inside in-memory SQL.js copies.

3. **Add evidence before indexes.**

   Query plans and timings are part of the profile output. New indexes or read APIs only follow if the profile shows a bottleneck or unstable plan. This keeps SQL-first benefits measurable instead of speculative.

4. **Treat Xiuyuan `findAll()` as a decision record, not a hidden optimization.**

   Active caller tracing shows `findAll()` is used by query handler, warmup index, and sync. The profile should measure indexed lookups now and record full enumeration as deferred unless a hot caller needs pagination.

## Risks / Trade-offs

- **Small fixture may hide scale problems** -> The profile supports in-memory row expansion and reports both real and expanded scenarios.
- **Rollback-only review simulation may diverge from worker runtime** -> Keep SQL shape close to active `review.feedback` persistence and cover only transaction cost, not scheduler correctness.
- **Query plan output can be noisy across SQLite/sql.js versions** -> Treat plans as diagnostic evidence, while pass/fail uses latency budgets and required shape checks.
- **Diagnostics code can become a parallel implementation** -> Keep it read-only/simulation-only and validate active runtime separately with existing worker tests and boundary checks.
