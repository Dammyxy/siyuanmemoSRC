## Context

Current backend RPC ownership matches ADR-001/002 at runtime, but its code seam is shallow. Adding or changing one family touches:

- `packages/contracts/src/backend-rpc.ts` for method names and DTOs.
- `worker/bootstrap/BackendKernel.ts` for switch routing and family-specific handlers.
- `src/application/clients/SrsBackendClient.ts` for facade methods.
- `worker/__tests__/BackendKernel.test.ts` for both dispatcher and family behavior.

Measured exploration:

- `packages/contracts/src/backend-rpc.ts`: about 3.5k lines, about 272 backend exports.
- `worker/bootstrap/BackendKernel.ts`: about 75 `case` routes.
- `src/application/clients/SrsBackendClient.ts`: about 76 public async methods.
- `worker/__tests__/BackendKernel.test.ts`: broad coverage from sync merge to Browser, Queue Projection, NeuralRoam, kernel transactions, Review truth, and private API.

This fails the deletion test for the current global contract Module: deleting it does not concentrate complexity behind a deeper Interface; it forces every domain family to recreate method string, DTO, handler, client, and tests in unrelated files.

The accepted runtime decisions still stand:

- `SrsBackendWorker` owns SQL projection/index writes.
- `kernel.js` coordinates only and never writes `siyuanmemo.db`.
- UI/application must not hide worker unavailability with fallback SQL or stale local data.
- Existing JSON-RPC method names are public runtime contracts and must remain stable.

## Goals / Non-Goals

**Goals:**

- Create a deep backend RPC method-family Module Interface where each family owns method names, request/result contracts, worker adapter, client facet, and focused tests.
- Keep the existing JSON-RPC wire protocol and method string literals stable.
- Preserve one centralized dispatcher for validation, pre-request merge, timing, success/error envelope construction, and hidden-fallback policy.
- Keep `SrsBackendClient` source-compatible while allowing application services to migrate to narrower family client Interfaces.
- Add registry completeness checks so missing handler/client wiring fails in tests or boundary checks.
- Split tests so family behavior is tested near the family Module and dispatcher behavior is tested once.

**Non-Goals:**

- No rename of existing backend RPC method strings.
- No change to SQL worker authority, storage truth ownership, writer relay, kernel sidecar ownership, or hidden-fallback policy.
- No migration of MessagePack truth/temp projection storage behavior; that remains in `cutover-msgpack-truth-temp-projection-store`.
- No Review durability behavior change; that remains in `stabilize-review-durability-segments`.
- No broad production refactor while another Browser cleanup diff is uncommitted; implementation should start after current production diff is committed or isolated.

## Decisions

### Decision 1: Registry-composed method catalog

Create family modules such as:

```text
packages/contracts/src/backend-rpc/
  core.ts
  browser.ts
  queue-projection.ts
  review.ts
  neural-roam.ts
  ai.ts
  semantic.ts
  private-api.ts
  xiuyuan.ts
  progressive.ts
  topic-derived.ts
  graph.ts
  ownership.ts
  index.ts
```

Each family exports method constants, request/result types, and a typed family catalog. `packages/contracts/src/backend-rpc.ts` remains a compatibility facade that re-exports the family modules and exports the composed `BackendRpcMethod` union.

Alternative considered: keep one file and add comment sections. Rejected because locality stays poor; unrelated families still edit the same Module.

### Decision 2: Dispatcher registry, not many inline switches

Replace `BackendKernel.handle()` method routing with a registry:

```ts
type BackendRpcHandler<TParams, TResult> = {
  method: BackendRpcMethod;
  family: BackendRpcFamily;
  handle(params: TParams | undefined, context: BackendRpcHandlerContext): Promise<TResult> | TResult;
};
```

`BackendKernel` keeps request validation, pre-request merge, diagnostic timing, error mapping, `buildSuccess`, and `buildError`. Family adapters own only family behavior and dependencies.

Alternative considered: split `BackendKernel` into several subclass kernels. Rejected because common lifecycle behavior would duplicate and create inconsistent fail-closed handling.

### Decision 3: Family adapters compose existing services first

First implementation should move routing/handler glue, not rewrite domain services. For example:

- Browser family adapter delegates to existing deck/source-existence/aggregate database/service methods.
- Queue Projection adapter delegates to `WorkerQueueProjectionRuntime`.
- Review adapter delegates to `WorkerReviewFeedbackRuntime`, truth flush, and backfill modules.
- NeuralRoam adapter delegates to `WorkerNeuralRoamAdvanceService` and command/view-state policies.

Alternative considered: move all worker domain logic into adapters immediately. Rejected because it would mix seam deepening with behavior rewrites.

### Decision 4: Client facets with compatibility facade

Introduce smaller client Interfaces/facets such as `BackendBrowserClient`, `BackendQueueProjectionClient`, `BackendReviewClient`, and `BackendAiClient`. Existing `SrsBackendClient` remains the facade that composes facets and keeps current method names.

Application services may migrate to narrower Interfaces where the call site already has a bounded context. This increases leverage without breaking existing imports.

Alternative considered: generate a client entirely from the registry in one pass. Deferred because current facade has extra scheduling behavior such as Review truth flush timing that should be preserved first.

### Decision 5: Tests follow the Interface

Add:

- `BackendRpcRegistry.test.ts`: every method has exactly one handler; registry method set equals `BackendRpcMethod`; request errors stay centralized.
- Family tests: browser, queue-projection, review, neural-roam, kernel-transaction, private-api, ai, semantic, xiuyuan/progressive/topic-derived as implementation slices.
- Client facet tests: method string and params/result routing for each facet.

Migrate tests out of `BackendKernel.test.ts` incrementally, keeping old tests until the family coverage proves parity.

## Risks / Trade-offs

- [Risk] Type circularity between family catalogs and compatibility `backend-rpc.ts` facade -> Mitigation: family files define leaf types; root file imports and re-exports only.
- [Risk] Registry indirection hides request lifecycle behavior -> Mitigation: dispatcher test covers validation, pre-request merge, timing, and error mapping once.
- [Risk] Client facets duplicate `SrsBackendClient` behavior during migration -> Mitigation: facade delegates to facets; no parallel hand-written call logic after each family migrates.
- [Risk] Family adapters become pass-through shallow Modules -> Mitigation: require each adapter to own params normalization, unavailable behavior, dependency checks, and focused tests for that family.
- [Risk] Large change conflicts with active storage/review changes -> Mitigation: start with contract/registry scaffolding and one low-risk family, then migrate high-risk Review/storage families only after current OpenSpec tasks settle.

## Migration Plan

1. Add family contract files and root re-export without moving runtime behavior.
2. Add registry types and completeness tests against existing method list.
3. Move a low-risk family first, preferably `system/db/diagnostics` or Browser read methods that already have strong backend-only tests.
4. Move queue-projection and Browser aggregate/source-existence families.
5. Move NeuralRoam and kernel transaction families.
6. Move Review/truth/domain-sync families after durability/storage active changes are committed or rebased.
7. Split client facets and migrate application callers to narrower Interfaces where natural.
8. Shrink `BackendKernel.test.ts` to dispatcher coverage and leave family behavior in family tests.
9. Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` when runtime responsibility map changes.

Rollback strategy: because method strings and facade imports remain stable, a family migration can be reverted family-by-family by re-registering the old handler path or moving that family route back into the legacy switch during the same implementation slice.

## Open Questions

- Should the first migrated family be `system/db/diagnostics` for lowest risk, or Browser read methods for immediate Browser debt payoff?
- Should completeness checks run under `check:boundaries` or remain focused Vitest until the registry is fully migrated?
- Should root `backend-rpc.ts` remain a permanent compatibility facade or become a deprecated re-export after all imports move to family files?
