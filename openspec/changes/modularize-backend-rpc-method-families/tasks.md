## 1. Preflight And Registry Foundation

- [x] 1.1 Ensure current production-code debt cleanup diff is committed, stashed, or intentionally isolated before applying this change.
- [x] 1.2 Read ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, `CONTEXT.md`, `ARCHITECTURE.md` backend sections, and the latest `docs/DDD_RESCAN_BACKLOG.md` entries before editing runtime code.
- [x] 1.3 Add backend RPC family names and registry contracts for method, family, params/result typing, handler adapter, and client exposure metadata.
- [x] 1.4 Add a registry completeness test proving every exported `BackendRpcMethod` has exactly one registered handler entry.
- [x] 1.5 Add a duplicate-method registry test proving two family modules cannot register the same method.
- [x] 1.6 Add a client-catalog verification test proving every client-exposed method maps to a registered backend RPC method.

## 2. Contract Family Modules

- [x] 2.1 Create `packages/contracts/src/backend-rpc/` with a root family index and keep `packages/contracts/src/backend-rpc.ts` as a compatibility re-export facade.
- [x] 2.2 Move core/system/db/diagnostics/private health method contracts into a core family contract file without changing method strings.
- [x] 2.3 Move Browser deck/source-existence/aggregate method contracts into a Browser family contract file without changing request/result shapes.
- [x] 2.4 Move Queue Projection and storage projection rebuild contracts into a Queue Projection family contract file.
- [x] 2.5 Move Review feedback, Review truth flush/backfill, Review riff feedback/source refresh, sync/domain-sync contracts into Review/Sync family contract files.
- [x] 2.6 Move NeuralRoam contracts into a NeuralRoam family contract file.
- [x] 2.7 Move AI session/prompt/tool/stream/job/hotspot contracts into AI/Job family contract files.
- [x] 2.8 Move Semantic, Private API, P6 ownership, Graph, Xiuyuan, Progressive, and Topic-derived contracts into their own family contract files.
- [x] 2.9 Run contract import tests and update imports only when a family file can be moved without breaking compatibility facade imports.

## 3. Worker Dispatcher And Family Adapters

- [x] 3.1 Add a `BackendRpcDispatcher` Module that keeps request validation, method lookup, common diagnostics timing, success/error envelope creation, and `METHOD_NOT_FOUND` behavior outside family adapters.
- [x] 3.2 Add `BackendRpcHandlerContext` carrying shared dependencies, pre-request merge hooks, logger/timing helpers, and error mapping without exposing unrelated family internals.
- [x] 3.3 Migrate core/system/db/diagnostics/private health handlers from `BackendKernel.handle()` switch into a core family adapter and prove behavior parity.
- [x] 3.4 Migrate Browser deck/source-existence/aggregate handlers into a Browser family adapter and prove backend-only Browser read behavior remains unchanged.
- [x] 3.5 Migrate Queue Projection and storage projection handlers into a Queue Projection family adapter and prove readiness/refresh-required behavior remains unchanged.
- [x] 3.6 Migrate NeuralRoam handlers into a NeuralRoam family adapter and prove backend-authoritative advance/command/view-state behavior remains unchanged.
- [x] 3.7 Migrate kernel transaction ingest/dequeue/requeue handlers into a Kernel Transaction family adapter and prove inbox/action queue behavior remains unchanged.
- [x] 3.8 Migrate AI/job/hotspot handlers into AI/Job family adapters and prove job lifecycle and streaming unavailable behavior remain unchanged.
- [x] 3.9 Migrate Semantic, Private API, P6 ownership, Graph, Xiuyuan, Progressive, and Topic-derived handlers into family adapters with focused parity tests.
- [ ] 3.10 Migrate Review feedback/truth/domain-sync handlers only after active durability/storage changes are committed or rebased, and prove fail-closed durability and sync diagnostics remain unchanged.
- [ ] 3.11 Shrink `BackendKernel.handle()` to dispatcher setup plus shared lifecycle hooks, leaving no family-specific `case` switch in the kernel.

## 4. Client Facets And Facade Compatibility

- [ ] 4.1 Extract shared RPC call/envelope logic from `SrsBackendClient` so family facets do not duplicate request ID, error propagation, or response validation logic.
- [ ] 4.2 Add core, Browser, Queue Projection, Review, NeuralRoam, AI/Job, Semantic, Private API, and integration-family client facets.
- [ ] 4.3 Make `SrsBackendClient` delegate existing methods to facets while preserving all current public method names and scheduling side effects such as Review truth flush timers.
- [ ] 4.4 Migrate bounded-context callers to narrower client Interfaces where the call site already consumes one method family only.
- [ ] 4.5 Keep broad `SrsBackendClient` injection where a composition root or orchestrator truly needs multiple families, and document why.
- [ ] 4.6 Add client facet tests for method string, params shape, result propagation, and explicit backend unavailable errors.

## 5. Test Split And Parity Coverage

- [x] 5.1 Add `BackendRpcDispatcher.test.ts` for invalid request, unknown method, handler success, handler error, duplicate registry, and diagnostics timing behavior.
- [ ] 5.2 Split core/db/diagnostics tests out of `worker/__tests__/BackendKernel.test.ts`.
- [ ] 5.3 Split Browser and source-existence backend tests out of `BackendKernel.test.ts`.
- [ ] 5.4 Split Queue Projection backend tests out of `BackendKernel.test.ts`.
- [ ] 5.5 Split NeuralRoam backend tests out of `BackendKernel.test.ts`.
- [ ] 5.6 Split kernel transaction ingest/action queue tests out of `BackendKernel.test.ts`.
- [ ] 5.7 Split AI/job/hotspot tests out of `BackendKernel.test.ts`.
- [ ] 5.8 Split Semantic/Private/P6/Graph/Xiuyuan/Progressive/Topic-derived tests out of `BackendKernel.test.ts`.
- [ ] 5.9 Split Review feedback/truth/domain-sync tests out of `BackendKernel.test.ts` only after the Review/storage family adapter migration is complete.
- [ ] 5.10 Leave `BackendKernel.test.ts` with only integration smoke that proves the kernel wires the dispatcher and shared dependencies correctly.

## 6. Boundary Checks And Documentation

- [x] 6.1 Add or update a boundary/check script so hidden fallback and no-UI-SQL gates still scan new family contract/adapter paths.
- [x] 6.2 Update `ARCHITECTURE.md` runtime file responsibility map for backend RPC family modules, dispatcher, client facets, and test ownership.
- [x] 6.3 Update `docs/DDD_RESCAN_BACKLOG.md` with debt retired and intentionally deferred family migrations.
- [x] 6.4 Run `openspec validate modularize-backend-rpc-method-families --strict`.
- [x] 6.5 Run focused registry, dispatcher, family adapter, and client facet Vitest suites.
- [x] 6.6 Run affected existing backend suites for migrated families.
- [x] 6.7 Run `pnpm run check:boundaries`.
- [x] 6.8 Run `git diff --check`.
- [x] 6.9 Run `pnpm build`.
