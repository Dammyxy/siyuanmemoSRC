## 1. Baseline And Regression Locks

- [x] 1.1 Capture `git status --short`, the focused diff for every file touched by the two startup sessions, and the current test baseline from the active `kernel-companion-p0` worktree; do not reset, rewrite, or stage unrelated user changes.
- [x] 1.2 Add/retain `BackendCoreRpcAdapter` contract tests proving `db.load` and `db.reload` unwrap the positional `[request]` shape emitted by `BackendRpcCaller.call()` and reject malformed parameter shapes explicitly.
- [x] 1.3 Add/retain `BackendKernel` tests proving `db.load` and `db.reload` resolve Truth Device Identity before storage-refresh preflight while mutating maintenance RPCs retain their required preflight and writer gates.
- [x] 1.4 Add/retain client/Worker integration tests proving every truth mutation receives both verified `deviceId` and `identityEpoch`; lock out device-only, epoch-only, generated, and legacy fallback paths.
- [x] 1.5 Record the current `WorkerSqliteDatabaseService.init()` call order and identify domain sync backfill, Review journal replay, projection reconciliation, kernel snapshot restore, truth promotion/continuation, and storage-growth baseline entry points before moving any phase.

## 2. Typed Identity And Startup Disposition

- [x] 2.1 Extend `truthDeviceIdentity.test.ts` with separate cases for matching authorities, conflicting authorities, invalid records, transient IndexedDB failure, transient localStorage failure, verified first-install creation, and unverifiable first-install creation.
- [x] 2.2 Replace the factory-level identity-ready boolean with a typed startup disposition carrying verified identity evidence or an explicit recovery/authority-unavailable reason; keep `identity-recovery-required` distinct from transient failure and valid absence.
- [x] 2.3 Propagate the typed disposition through `createApplicationBackendRuntimeBundle`, `SrsBackendClient`, backend load/reload request/result contracts, and Worker startup evidence without changing JSON-RPC method names.
- [x] 2.4 Extend `WorkerStartupStorageEvidence` so identity conflict, invalid evidence, and unprovable continuity produce `STORAGE_RECOVERY_REQUIRED` rather than a normal `ready` recovery state with merely missing identity status.
- [x] 2.5 Implement and test retryable read-only `STORAGE_RECOVERY_REQUIRED` with `IDENTITY_AUTHORITY_UNAVAILABLE` for transient authority reads; keep it distinct from durable recovery conflict and prevent all truth mutation.
- [x] 2.6 Gate Review journal replay, Review truth flush/backfill, truth promotion, and all other truth mutation callbacks on the typed writable disposition and verified epoch.
- [x] 2.7 Extend `SqliteDatabaseService`/Review tests to prove unavailable or recovery-required identity leaves journal work pending with a safe reason and performs no truth write, deletion, success marking, or epoch advancement.
- [x] 2.8 Add recovery tests proving a later verified identity resumes still-valid pending Review work exactly once and existing idempotency evidence prevents duplicate Review events/truth facts.
- [x] 2.9 Add `ApplicationContext.storage-fail-closed` coverage proving normal readiness is impossible for identity conflict, invalid authority, transient authority failure, untrusted truth/delta evidence, and unresolved hard pressure.
- [x] 2.10 Add a `db.reload` integration case proving reload applies the same identity ordering, readiness classification, recovery state, and mutation gates as `db.load`.
- [x] 2.11 Implement and test the read-only recovery capability matrix: permit only evidence/status/diagnostics/identity recheck, reject all normal mutation and maintenance submission, and require dedicated recovery authority checks before transition.

## 3. Pure Load Contract And Single Ready Boundary

- [x] 3.1 Add failing `SrsBackendClient` tests proving repeated `loadDatabase()`/`reloadDatabase()` calls perform only their RPC and submit no background job, Review flush, detached promise, or timer.
- [x] 3.2 Remove `submitStartupStorageMaintenanceJob()` and every other maintenance scheduling side effect from `SrsBackendClient.loadDatabase()`/`reloadDatabase()` while preserving their public result/error behavior.
- [x] 3.3 Remove direct startup Review truth flush/maintenance scheduling from `createApplicationBackendRuntimeBundle` in both writer and follower paths.
- [x] 3.4 Make `src/index.ts`'s outer `plugin.onload` the terminal transition owner; move `isInitialized = true` and `contextReady.resolve()` after required handler registration and keep both unpublished on handler failure.
- [x] 3.5 Make `db.load`/`db.reload` return readiness plus explicit deferred-work descriptors/status references without starting those descriptors inside the client, factory, backend adapter, or Worker init call.
- [x] 3.6 Add a narrow post-ready startup maintenance coordinator and invoke it exactly once after the composition-root ready transition.
- [x] 3.7 Prove with `ApplicationContext.backend-worker-runtime` tests that the backend factory load plus later unified load/reload still produce one post-ready maintenance handoff.
- [x] 3.8 Prove startup failure before the ready transition submits no deferred work and read-only recovery submits only explicitly recovery-safe job kinds.
- [x] 3.9 Prove writer and follower startup use the existing relay/election seam and cannot create a second Worker SQLite/truth writer or duplicate mutation job.
- [x] 3.10 Route deferred descriptors returned by every post-ready reload through the same composition-owned coordinator while keeping `reloadDatabase()` a pure RPC and relying on registry/frontier dedupe.

## 4. Background Maintenance Identity And Lifecycle

- [x] 4.1 Define a deferred startup descriptor and job-lifecycle dedupe key from accurate work kind, ephemeral runtime instance, stable plugin installation scope, verified identity epoch when relevant, and maintenance frontier/phase input; exclude ephemeral runtime id from persisted receipts.
- [x] 4.2 Extend `KernelCompanionBackgroundWorkRegistry` so equivalent accepted/running submissions coalesce to one lifecycle identity and unchanged completed work returns its terminal/skipped evidence without re-execution.
- [x] 4.3 Add explicit retry semantics for terminal failure and prove retry increments attempt evidence without concurrent duplicate execution.
- [x] 4.4 Rename the current generic startup job to its actual Review truth maintenance kind, or implement a real parent job with named owned phases and counters; remove status claims for work it does not own.
- [x] 4.5 If a parent delegates to another registry job, expose the child reference/waiting state and prevent parent success from being reported at child submission time.
- [x] 4.6 Bring any Review flush batching timer under registry ownership so it is observable/cancelable and cannot spawn work after its parent is terminal.
- [x] 4.7 Make registry shutdown/unload atomically reject follow-up submission and settle queued/running startup work as canceled, deferred, or shutdown-terminal.
- [x] 4.8 Add unload-race tests for queued work, running work, timer-delayed work, child submission, and retry so none can execute after shutdown begins.
- [x] 4.9 Extend `KernelCompanionBackgroundWorkStatusReadModel` tests for dedupe/coalescing evidence, accurate kind/phase/counters, child references, terminal failure, and shutdown state while retaining content redaction.
- [x] 4.10 Search the active startup path for unregistered `setTimeout`, fire-and-forget promise, factory submit, and client submit paths; remove or explicitly register every deferred maintenance path found.

## 5. Worker-Owned Receipt Frontier And Cheap Status

- [x] 5.1 Add failing `StartupWorkerStorageMaintenance` tests proving a matching receipt performs no full card enumeration, schedule normalization scan, orphan scan, projection rebuild, external storage merge, or maintenance mutation.
- [x] 5.2 Define a narrow Worker/application maintenance-frontier read model and durable receipt scope using `pluginInstallationId`, identity epoch, kind/version, authoritative generation/checkpoint, and maintenance input version without content-bearing or ephemeral runtime data.
- [x] 5.3 Remove `StartupMaintenanceStoreIdentity` and `getStartupMaintenanceStoreIdentity()` from `UnifiedStorageManager`; update callers to use the narrow application/backend port and add a boundary regression check.
- [x] 5.4 Implement `storage.maintenance.status` as a Worker-native receipt/frontier metadata read and exempt only that proven-safe read from external storage merge/main projection preflight.
- [x] 5.5 Keep `storage.maintenance.applyBatch` and every mutation path behind existing writer, identity, transaction, and required storage-safety checks.
- [x] 5.6 Version maintenance receipts by kind/scope/input contract and require terminal success plus an exact current-to-post-success frontier match before skipping.
- [x] 5.7 Read the post-commit frontier after all owned maintenance mutations succeed and persist that frontier in the completed receipt; reject pre-scan-only frontier receipts.
- [x] 5.8 Add tests where maintenance changes the frontier, proving the new receipt matches post-state and a subsequent unchanged startup skips without scanning.
- [x] 5.9 Add missing, malformed, ambiguous, wrong-version, wrong-epoch, wrong-installation, changed-frontier, phase-failure, and receipt-write-failure tests; every case must avoid false completion and use the bounded full path or explicit failure.
- [x] 5.10 Add Worker/backend tests proving receipt status never calls storage-refresh preflight while applyBatch does not inherit that exemption.
- [x] 5.11 Reuse one coherent receipt/frontier status snapshot across schedule and orphan decisions and add a request-count regression test preventing duplicate status/preflight calls.
- [x] 5.12 Classify schedule normalization and orphan-card repair independently from focused initial-read/write correctness tests; record each phase as a bounded gate, affected-surface pending state, or deferred-safe descriptor.
- [x] 5.13 Move only the phases proven deferred-safe behind the post-ready registry and keep ambiguous/unproven full paths synchronous without blocking unrelated capabilities unnecessarily.
- [x] 5.14 Add a cheap Worker-owned external-input dirty generation/pending-merge marker and update it atomically when external storage change is observed or queued, before receipt status can match.
- [x] 5.15 Add concurrency tests proving pending external merge invalidates the fast path, merge commit advances the authoritative frontier, and a new ephemeral runtime can reuse a receipt only when durable installation/epoch/frontier evidence is unchanged.

## 6. Operation-Specific Timeout Policy

- [x] 6.1 Add transport tests that identify separate timeout policies for maintenance status, `db.load`/`db.reload`, maintenance apply batches, and projection rebuild instead of a shared 300,000 ms override.
- [ ] 6.2 Measure representative normal and large-store status/load/batch durations and document evidence-based budgets plus maximum mutation batch assumptions.
- [x] 6.3 Replace the blanket five-minute request and host-effect timeouts with a short status budget, a safety/readiness load budget, and a bounded mutation-batch budget.
- [x] 6.4 Align request and host-effect timeout layers so timeout errors preserve operation, phase, elapsed time, and safe classification rather than masking the slower phase.
- [x] 6.5 Add timeout tests proving status fails promptly, load identifies its blocking synchronous phase, and a timed-out apply batch cannot create a terminal-success receipt or duplicate committed mutations on retry.

## 7. Worker Startup Phase Classification

- [x] 7.1 Turn the init inventory into an architecture phase matrix with owner, reads/writes, required identity, synchronous invariant, failure mode, latency bound, and final sync/deferred classification for every phase.
- [x] 7.2 Keep truth/delta/identity validation, recovery disposition, required projection open/reconstruction, and bounded hard-pressure gating synchronous and add focused fail-closed tests for each.
- [x] 7.3 Decide Review journal replay/projection reconciliation classification from queue-read correctness tests; keep it synchronous unless affected counts/sessions expose an explicit pending/unavailable state.
- [x] 7.4 Decide kernel snapshot restore and domain sync backfill independently from tests; do not group-defer either phase without proving initial consumers tolerate its pending state.
- [x] 7.5 Keep normal-pressure Review truth promotion/backfill continuation Worker-owned but return it as a deferred registry descriptor when it is not required for readable projection correctness.
- [x] 7.6 Split storage-growth handling into bounded synchronous pressure inventory and pressure-dependent remediation; preserve hard-pressure fail-closed behavior and prevent an unconditional 10,000-item startup loop under normal pressure.
- [x] 7.7 Add Worker tests proving `db.load` returns after all required safety/readability gates with correct deferred descriptors, while unproven phases remain synchronous.
- [x] 7.8 Add queue/read-model tests proving pending deferred work never surfaces stale projection counts or session entries as normal-ready data.
- [x] 7.9 Add error propagation tests proving deferred phase failure appears in background status and never activates a legacy snapshot, renderer DB, or compatibility fallback.
- [x] 7.10 Add representative backlog tests for pending promotions, Review journal entries, domain backfill, snapshot restore, and storage baseline to prevent startup latency from scaling with work classified deferred-safe.

## 8. Complete Bounded Startup Profiling

- [x] 8.1 Add failing diagnostics tests proving a slow startup records non-empty spans when full runtime diagnostics are disabled, while a fast successful startup emits nothing.
- [x] 8.2 Implement a startup-attempt-only bounded span buffer with allow-listed operation names/scalar metadata, deterministic truncation evidence, and per-attempt reset/disposal.
- [x] 8.3 Consolidate duplicate `application-context.create` instrumentation to one child span owner and keep full runtime diagnostics behavior independent.
- [x] 8.4 Move final slow-start reporting from `ApplicationContext.create()` to the outer `plugin.onload` owner after its success/failure span closes.
- [x] 8.5 Add tests proving the final profile includes the complete closed `plugin.onload` interval and a failure after ApplicationContext creation is reported as a failed startup attempt.
- [x] 8.6 Add boundedness, reset, and redaction tests for card/block text, SQL payloads, host-effect bodies, nested error objects, and unknown metadata.

## 9. Scoped CJS Inline Worker Bootstrap

- [x] 9.1 Add source-level transport tests proving module import does not change `globalThis.window`, `self`, `Worker`, `Blob`, or `URL` descriptors.
- [x] 9.2 Remove import-time `installCjsBrowserGlobals()` execution and make compatibility acquisition lazy at `BrowserSrsBackendWorkerTransport` Worker construction.
- [x] 9.3 Prefer a narrow factory with explicit `Worker`/`Blob`/`URL` constructors if the generated inline wrapper supports it; define only the minimum aliases proven necessary by built output.
- [x] 9.4 If temporary globals are required, snapshot descriptors, install only missing safe values, and restore all changes in `finally` on both construction success and failure.
- [x] 9.5 Add tests proving existing valid globals/descriptors are untouched and non-writable/non-configurable missing requirements fail explicitly without partial mutation.
- [x] 9.6 Add sequential/two-transport tests proving no temporary alias leaks across instances in a shared host.
- [x] 9.7 Build the production CJS bundle and add a smoke harness that evaluates `dist/index.js` plus inline Worker construction in SiYuan-like lexical/global combinations.
- [x] 9.8 Prove the built-bundle failure path reports explicit backend Worker incompatibility and never falls back to renderer-side database ownership.

## 10. Architecture And Debt Documentation

- [x] 10.1 Update `ARCHITECTURE.md` with the typed startup disposition, exact ready boundary, single maintenance coordinator, Worker-owned frontier, and background registry versus Worker mutation ownership.
- [x] 10.2 Document the final per-phase synchronous/deferred matrix accurately; remove statements that imply all Review reconciliation, snapshot restore, domain backfill, baseline, or truth work is deferred when code does not prove it.
- [x] 10.3 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed debt and any intentionally deferred phase, timeout budget, live-smoke, or CJS wrapper limitation; do not silently drop unresolved findings.
- [x] 10.4 Update domain terminology only if needed so `CONTEXT.md` remains consistent with Truth Device Identity, Storage Recovery State, Canonical Truth, Disposable SQLite Projection, Durability Receipt, and Kernel Companion Background Work.
- [x] 10.5 Add or extend architecture checks forbidding startup-specific core storage APIs, import-time CJS global installers, direct renderer/kernel DB ownership, hidden storage fallbacks, and unregistered startup maintenance timers/submissions.

## 11. Focused And Broad Verification

- [x] 11.1 Run focused tests for `truthDeviceIdentity`, `ApplicationContext.storage-fail-closed`, `ApplicationContext.backend-worker-runtime`, `SrsBackendClient`, `BackendCoreRpcAdapter`, `BackendKernel`, and `WorkerStartupStorageEvidence`.
- [x] 11.2 Run focused tests for `StartupWorkerStorageMaintenance`, `WorkerStorageMaintenanceOperationRuntime`, `WorkerSqliteDatabaseService`, `ReviewJournalProjectionReconciler`, and SQLite metadata/journal behavior.
- [x] 11.3 Run focused tests for `KernelCompanionBackgroundWorkRegistry`, `KernelCompanionBackgroundWorkStatusReadModel`, runtime performance diagnostics, and `BrowserSrsBackendWorkerTransport`.
- [x] 11.4 Run the complete non-watch test suite with `pnpm test:run` and classify any failure as introduced, pre-existing, or environment-only with evidence.
- [x] 11.5 Run `pnpm run check:boundaries` and verify no direct DB owner, fallback/compatibility path, runtime MessagePack drift, or public Review queue boundary regression.
- [x] 11.6 Run `pnpm build`, the production CJS/inline Worker smoke harness, and `pnpm run check:srs-dist-hygiene`; inspect the built bundle for persistent browser-global mutation.
- [x] 11.7 Run `openspec validate harden-startup-readiness-and-background-maintenance --strict` and `git diff --check`.
- [x] 11.8 Audit the final diff against every requirement/scenario in all nine capability specs; keep any unmet item unchecked and record it in the debt ledger rather than claiming completion.

## 12. Live SiYuan Acceptance And Handoff

- [ ] 12.1 Perform a clean SiYuan plugin restart and verify CJS inline Worker construction, `db.load` readiness, settings/handler registration, and post-ready maintenance status complete without the original startup exception.
- [ ] 12.2 Perform repeated warm restarts with unchanged storage and prove the receipt fast path avoids full card scans/storage merge, no duplicate startup jobs appear, and no browser-global descriptors remain polluted.
- [ ] 12.3 Perform a representative large-store restart and record total `plugin.onload`, Worker load, receipt status, synchronous phase, and deferred job timings against the documented budgets.
- [ ] 12.4 Verify a normal Review write after startup persists through Worker-owned SQLite/truth paths with the verified identity epoch, then restart and confirm no duplicate/missing Review fact or stale ready count.
- [ ] 12.5 Exercise or fixture the recovery-required identity path and verify read-only/fail-closed presentation, zero truth mutation, pending journal preservation, and successful exactly-once recovery after authority is repaired.
- [x] 12.6 Re-run `git status --short` and focused diff inspection; confirm only intended active-worktree files changed, the baseline mirror was untouched, and unrelated pre-existing dirty changes were preserved.
- [x] 12.7 Produce a handoff listing implemented requirements, exact validation output, measured budgets, live-smoke evidence, remaining unchecked tasks/debt, and any rollback-relevant receipt version change.
