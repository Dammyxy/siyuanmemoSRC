## Why

The current uncommitted startup fixes repair the `db.load` RPC parameter mismatch and preserve Worker-owned SQLite/truth authority, but review found several remaining paths that can still report normal readiness with untrusted Truth Device Identity, start duplicate maintenance before the real ready boundary, or hide synchronous storage scans behind five-minute timeouts. These gaps must be closed before the startup optimization is treated as architecturally safe or handed off as complete.

## What Changes

- Make Truth Device Identity a typed startup gate: verified identity permits write-capable readiness, identity conflict/invalid evidence enters explicit `STORAGE_RECOVERY_REQUIRED`, and transient authority failure enters retryable read-only `STORAGE_RECOVERY_REQUIRED` with an authority-unavailable subreason rather than being treated as ordinary missing identity.
- Preserve pending Review truth journal work when identity is unavailable: no truth mutation, deletion, success marking, generated identity, or compatibility fallback is allowed.
- **BREAKING (internal composition contract)**: make `SrsBackendClient.loadDatabase()` a pure backend load RPC. It must not submit startup maintenance as a hidden side effect.
- Make `src/index.ts`'s outer `plugin.onload` flow the sole terminal-ready owner: required handlers must register before `isInitialized`/`contextReady` publish readiness, then one coordinator handles initial and later reload descriptors with stable deduplication, accurate job kinds/phases, cancellation/shutdown semantics, and no unregistered follow-up work after unload.
- Replace the broad startup-maintenance receipt path with Worker-owned, post-maintenance frontier evidence scoped durably by plugin installation and identity epoch, never by an ephemeral runtime id. A matched receipt must be a genuinely cheap read that performs neither full card enumeration nor an implicit storage merge, and pending external changes must atomically invalidate the match.
- Classify schedule normalization and orphan repair independently: keep any proven read/write safety gate synchronous or keep its affected capability unavailable, and route only proven deferred-safe full scans through post-ready background work.
- Remove blanket 300-second startup RPC timeouts. Status reads use a short bounded timeout; mutation batches use operation-specific bounds and explicit timeout diagnostics.
- Classify every `WorkerSqliteDatabaseService.init()` phase as a synchronous safety/readability gate or deferred-safe maintenance. Keep truth/delta validation, recovery, readable projection reconstruction, and hard-pressure gating synchronous; defer only phases whose invariants are proven by tests.
- Make slow-start profiling work even when full runtime diagnostics are disabled, cover the complete `plugin.onload` success/failure interval, remain bounded/content-safe, and avoid duplicate span names.
- Remove startup-maintenance-specific concepts from the core storage interface and place receipt/frontier ownership in an application port or Worker-owned read model.
- Replace import-time CJS browser-global mutation with a lazy, minimum-surface worker bootstrap that preserves existing globals, handles non-writable descriptors explicitly, and avoids cross-plugin pollution.
- Add regression coverage for repeated `db.load`/`db.reload`, writer/follower modes, identity authority failures, receipt invalidation, unload races, built CJS worker startup, and live SiYuan restart/large-store smoke verification.
- Preserve the fixes already proven correct: RPC array unwrapping, identity-before-preflight ordering for load/reload, `deviceId + identityEpoch` truth-write requirements, fail-closed receipt fallback, Worker-only SQLite writes, and writer-relay ownership.

## Capabilities

### New Capabilities
- `plugin-startup-readiness-integrity`: End-to-end startup disposition, complete slow-start observability, and rules for when normal write-capable readiness may be reported.
- `startup-background-maintenance-lifecycle`: Single-owner post-ready maintenance submission, stable deduplication, lifecycle cancellation, and phase-accurate status.
- `startup-maintenance-receipt-fast-path`: Worker-owned maintenance frontier receipts, cheap status reads, invalidation rules, and bounded timeout behavior.
- `review-truth-journal-replay`: Identity-bound Review truth journal replay/backfill behavior when startup authority is verified, unavailable, or recovery-required.
- `browser-cjs-worker-bootstrap`: Safe lazy construction of the inline backend Worker in the shipped CJS bundle without import-time global pollution.

### Modified Capabilities
- `application-context-composition-interface`: Application composition gains one explicit ready boundary and one owner for post-ready maintenance and final startup reporting.
- `kernel-companion-background-work-status`: Startup maintenance status must represent deduplicated lifecycle state and owned work completion rather than only submission.
- `review-journal-projection-reconciler`: Identity-unavailable replay/reconciliation must remain pending and cannot produce false success or stale normal readiness.
- `worker-sqlite-runtime-families`: Worker startup must expose typed readiness/deferred descriptors, keep safety gates synchronous, and provide a cheap maintenance-evidence read path.

## Impact

- Startup composition and client seams: `src/index.ts`, `src/application/ApplicationContext.ts`, `src/application/factories/createApplicationBackendRuntimeBundle.ts`, and `src/application/clients/SrsBackendClient.ts`.
- Identity, diagnostics, and storage ports: `src/application/factories/truthDeviceIdentity.ts`, `src/utils/runtimePerformanceDiagnostics.ts`, `src/application/services/StartupWorkerStorageMaintenance.ts`, and `src/core/storage/UnifiedStorageManager.ts`.
- Background work: `src/application/backgroundWork/*` and the normalized Kernel Companion Background Work status surface.
- Worker/backend: `worker/bootstrap/BackendKernel.ts`, `worker/bootstrap/rpc/BackendCoreRpcAdapter.ts`, `worker/db/SqliteDatabaseService.ts`, startup evidence/readiness modules, and Worker transport timeout policy.
- CJS bootstrap: `src/utils/cjsBrowserGlobals.ts`, `src/application/clients/BrowserSrsBackendWorkerTransport.ts`, `vite.config.ts`, and built `dist/index.js` smoke coverage.
- Contracts intentionally unchanged: JSON-RPC method names, SQLite projection ownership/schema, MessagePack truth/delta formats, storage paths, and writer-relay authority.
- This change corrects and hardens the uncommitted `optimize-plugin-startup-critical-path` work; implementation must preserve unrelated dirty-worktree changes and must not edit the baseline mirror outside the active worktree.
