## Why

Backend RPC has become a shallow global seam: one 3.5k-line contract file, one 75-case `BackendKernel` switch, one 76-method `SrsBackendClient`, and one large `BackendKernel` test file all need editing for unrelated Browser, Queue Projection, Review, NeuralRoam, AI, Semantic, Private API, Xiuyuan, Progressive, and Topic-derived method families. This makes ADR-001/002 worker ownership harder to preserve because every new method family must understand the whole backend surface instead of a small, owned Module.

This change deepens the backend RPC seam without changing JSON-RPC method names or runtime ownership: method families get their own contracts, worker adapters, client facets, and focused tests behind a shared registry.

## What Changes

- Introduce backend RPC method-family Modules that group method names, params/results, handler adapters, client facets, diagnostics, and focused tests by domain family.
- Replace the monolithic `BackendRpcMethod` union authoring path with a registry-composed method catalog while preserving the current public method string literals.
- Replace the `BackendKernel.handle()` mega-switch with a registry dispatcher that delegates to family adapters and keeps common request validation, pre-request merge, timing, error mapping, and `buildSuccess/buildError` behavior centralized.
- Split `SrsBackendClient` into family facets or generated/delegated method groups so application callers can depend on smaller Interfaces where possible while the existing `SrsBackendClient` facade remains source-compatible during migration.
- Split backend RPC contract files into family files re-exported from `packages/contracts/src/backend-rpc.ts`, keeping current import paths working until callers are migrated.
- Split broad `BackendKernel.test.ts` coverage into family-focused test files plus a small dispatcher contract test.
- Add boundary/coverage checks proving every `BackendRpcMethod` has exactly one registered handler and, where applicable, one client facade method.
- Keep existing JSON-RPC wire protocol, method names, result shapes, explicit unavailable behavior, hidden-fallback rules, and worker SQL authority unchanged.

## Capabilities

### New Capabilities

- `backend-rpc-method-family-modules`: Defines the method-family registry, family contract files, worker handler adapters, client facets, dispatcher invariants, and migration requirements for backend RPC.

### Modified Capabilities

- `sql-first-card-runtime`: Clarifies that SQL/worker ownership remains unchanged while backend RPC dispatch and contracts are reorganized into method-family Modules.

## Impact

- Contracts: `packages/contracts/src/backend-rpc.ts` and new family contract files under `packages/contracts/src/backend-rpc/`.
- Worker: `worker/bootstrap/BackendKernel.ts`, new family handler adapters under `worker/bootstrap/rpc/` or `worker/<family>/rpc/`, and affected services such as Browser aggregate, Queue Projection, Review feedback/truth, NeuralRoam, AI jobs, Semantic read model, Xiuyuan sync, Progressive, Topic-derived, Private API, and P6 ownership.
- Application client: `src/application/clients/SrsBackendClient.ts`, potential family client facets under `src/application/clients/backend/`, and callers that can consume narrower Interfaces.
- Tests: split `worker/__tests__/BackendKernel.test.ts`, add dispatcher/registry coverage, update client tests, and keep boundary checks green.
- Docs: `ARCHITECTURE.md`, `docs/DDD_RESCAN_BACKLOG.md`, and ADR references for runtime split / SQL worker authority / no UI SQL.
