## 1. Acceptance And Path Audit

- [x] 1.1 Rebuild the acceptance checklist from handoff evidence, Anki Browser reference shape, proposal, design, and specs.
- [x] 1.2 Trace active Browser open call chain from `SRSBrowser.vue` through `browserLoadDataRuntime.ts`, hierarchy snapshots, datasources, `BrowserApplicationService`, and backend/projection read owners.
- [x] 1.3 Trace all `allRows`, `rowsForFocus`, `ensureAllRowsSnapshot`, `startAllRowsSnapshot`, and `scheduleAllRowsSnapshot` consumers and classify which workflows need full Browser rows versus count-only reads or action targets.
- [x] 1.4 Record current projection-backed queue readiness/materialization call chain from `BrowserQueueViewModule` through `ensureQueueReadModelReady`, `UnifiedDataSourceManager`, `QueueProjectionRuntime`, and backend projection storage.

## 2. Count-Only Hierarchy Read Model

- [x] 2.1 Add failing tests proving global Browser hierarchy document counts do not call `getRowsByIds()` or all-row hydration.
- [x] 2.2 Add Browser hierarchy count request/result types carrying scope, read owner metadata, diagnostics, and `{ rootId, count }` rows.
- [x] 2.3 Add `BrowserApplicationService` hierarchy count seam for SQL card-universe deck/global/query views with unsupported/unavailable diagnostics.
- [x] 2.4 Add projection-backed queue hierarchy count support that uses projection identity plus SQL card-universe root IDs under the same read owner.
- [x] 2.5 Add title lookup input/result handling so hierarchy can resolve doc titles without full Browser row hydration.
- [x] 2.6 Cover global, preset, search, card type, active doc, scope-doc, and projection-backed queue count scopes with focused tests.

## 3. Browser Hierarchy UI Wiring

- [x] 3.1 Refactor `BrowserHierarchy.vue` props/state to consume count-only document items instead of deriving counts from `BrowserCard[]`.
- [x] 3.2 Add a Browser hierarchy runtime/composable in `SRSBrowser.vue` that refreshes counts independently from grid rows and preserves grid state on hierarchy failures.
- [x] 3.3 Ensure first grid rows can render while hierarchy counts are loading, refreshing, unavailable, or unsupported.
- [x] 3.4 Preserve focused document list behavior by requesting count-only focused scope instead of populating `rowsForFocus` via full-row snapshots.

## 4. Queue Projection Warmup

- [x] 4.1 Add failing tests for bounded Browser-open projection warmup: active queue first, visible projection-backed queues only, no datasource attach during warmup.
- [x] 4.2 Implement a Browser Queue Projection Warmup runtime that debounces, cancels on Browser close/load abort, and records readiness diagnostics.
- [x] 4.3 Route warmup through existing `ensureQueueReadModelReady`/writer/backend readiness contracts and return explicit unavailable causes for follower/writer/backend failures.
- [x] 4.4 Reuse or recheck warm readiness identity on queue selection without trusting stale identity after invalidation.
- [x] 4.5 Connect projection live identity/invalidation events to schedule rewarm for affected visible queues without reloading hidden Browser modes unnecessarily.

## 5. Full-Row Snapshot Restriction

- [x] 5.1 Add failing tests proving default global Browser open does not schedule `scheduleAllRowsSnapshot()` merely for document hierarchy counts.
- [x] 5.2 Remove default all-rows hierarchy snapshot scheduling from `browserLoadDataRuntime.ts` and `SRSBrowser.vue`.
- [x] 5.3 Keep explicit all-row snapshot helpers only for traced workflows that truly need full `BrowserCard[]`, and add diagnostics identifying the triggering workflow.
- [x] 5.4 Replace any remaining hierarchy/stat consumers of `rowsForFocus`/`allRows` with count-only reads or action-target lookup.

## 6. Diagnostics And Profile Evidence

- [x] 6.1 Extend Browser runtime performance diagnostics with hierarchy count timing, title lookup timing, rows-hydrated-for-hierarchy count, projection warmup timing/status, retry count, and queue selection readiness wait.
- [x] 6.2 Extend `browserSqlProfile` coverage for hierarchy count SQL/projection count shape and projection readiness/warmup evidence.
- [x] 6.3 Confirm profile output distinguishes count-only hierarchy reads from full-row hydration and does not suggest speculative indexes without measured bottleneck.

## 7. Documentation And Debt Ledger

- [x] 7.1 Update `ARCHITECTURE.md` for the Browser open call chain: grid read model, hierarchy count read model, projection warmup, and explicit all-row snapshot workflows.
- [x] 7.2 Update `CONTEXT.md` only if new domain terms are needed beyond Browser Read Model, Queue Projection Readiness, and Browser Queue View Lifecycle.
- [x] 7.3 Update `docs/DDD_RESCAN_BACKLOG.md` with debt fixed and deferred after production `src/` changes.

## 8. Validation

- [x] 8.1 Run targeted Browser hierarchy/readiness tests for count-only reads, first-row independence, queue warmup, projection-refreshing selection, and all-row snapshot restriction.
- [x] 8.2 Run targeted application/backend tests for hierarchy count SQL/projection paths, queue readiness/warmup behavior, and unsupported/unavailable diagnostics.
- [x] 8.3 Run `pnpm run check:boundaries`.
- [x] 8.4 Run `node scripts/check-hidden-fallbacks.cjs`.
- [x] 8.5 Run `pnpm build`.
