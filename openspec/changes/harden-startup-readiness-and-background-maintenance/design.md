## Context

Two local sessions changed the same startup path. The first repaired the backend `db.load` failure by unwrapping the caller's positional parameter array, exempting load/reload from pre-request storage merge, resolving Truth Device Identity before truth mutation, and leaving Review journal work pending when identity is absent. The second added startup receipts, deferred Review truth work, longer backend timeouts, slow-start reporting, and a browser-global bridge for the CJS inline Worker bundle.

Those changes preserve the central architecture: MessagePack truth plus SQLite delta remain Canonical Truth, `siyuanmemo.db` remains a Disposable SQLite Projection, the Worker remains the only SQLite/truth writer, and renderer/kernel code uses narrow RPC and writer-relay seams. The remaining defects are orchestration defects around that architecture:

- `identity-recovery-required` is collapsed into a boolean “identity not ready,” so normal projection readiness can still be reported while identity authority is conflicted or invalid.
- startup maintenance is submitted from `SrsBackendClient.loadDatabase()`, the backend bundle factory, and later ApplicationContext loading; the current guard covers only one wrapper job and not the underlying Review backfill kind.
- the receipt status RPC still passes through storage-refresh preflight, and ApplicationContext still waits synchronously for maintenance. Five-minute timeouts conceal rather than remove that critical-path work.
- `WorkerSqliteDatabaseService.init()` still contains several unclassified synchronous phases, while documentation implies a broader readiness split than the code currently implements.
- slow profiles depend on the full diagnostics flag and are reported before the outer `plugin.onload` span closes.
- a startup-maintenance-specific identity was added to the core storage interface, and the CJS bridge mutates browser globals at import time.

The implementation occurs in a dirty worktree containing the reviewed fixes and other user-owned work. The implementer must reconstruct the current diff before each slice, preserve unrelated edits, and work only under `.worktrees/siyuan-plugin-siyuanmemo/kernel-companion-p0/`.

## Goals / Non-Goals

**Goals:**

- Make write-capable startup readiness a typed, fail-closed decision over Truth Device Identity, authoritative storage evidence, projection readability, and hard-pressure state.
- Define one actual plugin-ready boundary and one owner for deferred startup maintenance submission.
- Make background maintenance idempotent at the registry level, observable through accurate kinds/phases, and safe across repeated load/reload and unload races.
- Make the receipt fast path demonstrably cheap and based on Worker-owned post-success frontier evidence.
- Replace timeout inflation with operation-specific latency contracts and explicit timeout diagnostics.
- Classify every Worker init phase by invariant before moving it off the critical path.
- Produce a bounded, content-safe startup profile covering the complete `plugin.onload` interval even when full runtime diagnostics are disabled.
- Restore DDD locality by moving startup-specific receipt concepts out of core storage and limiting the CJS bootstrap to the Worker transport boundary.
- Preserve the already-correct RPC, storage ownership, identity epoch, writer relay, and fail-closed fallback fixes.

**Non-Goals:**

- Do not change JSON-RPC method strings, SQLite schemas, truth/delta formats, storage paths, or writer election semantics.
- Do not introduce renderer/kernel SQLite writes, a second truth writer, a generated/fallback identity, legacy snapshot fallback, or a hidden degraded mode.
- Do not mark Review journal/truth work successful merely to unblock startup.
- Do not defer a phase until its read/write invariant and failure behavior are covered by focused tests.
- Do not redesign all background-work kinds or all runtime diagnostics outside the startup slice.
- Do not archive or rewrite `optimize-plugin-startup-critical-path`; this change is the explicit hardening follow-up.

## Decisions

### 1. Use a typed startup disposition instead of an identity-ready boolean

The startup composition seam will carry a typed disposition with at least:

- `writable-ready`: both Truth Device Identity authorities agree on `pluginInstallationId` and `identityEpoch`, authoritative storage evidence is trusted, the projection is readable, and no hard-pressure gate remains.
- `read-only-recovery-required`: identity authorities conflict, an identity record is invalid, authoritative continuity cannot be proven, or storage evidence already requires recovery. The externally visible reason remains `STORAGE_RECOVERY_REQUIRED` with a safe identity/storage subreason.
- `read-only-authority-unavailable`: identity authority cannot currently be read. The external recovery code is `STORAGE_RECOVERY_REQUIRED`, with a retryable `IDENTITY_AUTHORITY_UNAVAILABLE` subreason that remains distinguishable from durable identity conflict and valid first-install absence.

The disposition is computed before any truth write, Review journal replay mutation, or normal write-capable readiness. `db.load`/`db.reload` must accept or derive the verified identity evidence without reintroducing storage preflight before identity resolution. A valid first-install identity may only be created through the existing authoritative identity creation protocol; a conflict or invalid record never triggers replacement generation.

Pending Review journal entries and truth backfill work remain pending with a recorded safe reason when the disposition is not writable. They cannot be deleted, advanced to success, or replayed under an unverified epoch.

Read-only recovery has an explicit capability matrix. It permits identity/storage recovery evidence reads, retryable identity verification, background status, and safe diagnostics. It disables Review feedback writes, truth replay/promotion/backfill/flush, schedule/orphan mutation, sync mutation, maintenance apply, and projection rebuild through the normal runtime. A dedicated recovery operation may mutate only after its own authority checks prove the transition required by the existing recovery contract; ordinary background maintenance is never treated as recovery-safe by default.

Alternative considered: retain `truthMutationIdentityReady: boolean` and infer recovery from logs. Rejected because a boolean erases the distinction that controls write authority and normal readiness.

### 2. Make backend loading pure and submit maintenance once after the true ready boundary

`SrsBackendClient.loadDatabase()` and `reloadDatabase()` will be pure RPC calls. They may return readiness/deferred-work descriptors, but they cannot submit jobs, schedule timers, or mutate lifecycle state.

`src/index.ts`'s outer `plugin.onload` flow is the sole terminal transition owner. It must not set `isInitialized = true` or resolve `contextReady` until:

1. typed storage/identity disposition permits the selected mode;
2. the Disposable SQLite Projection is readable for that mode;
3. settings and required runtime access modules are bound; and
4. startup handlers needed for a usable plugin runtime are registered.

The owner registers required handlers first, then atomically publishes `isInitialized`/`contextReady`, and then hands initial deferred descriptors to one maintenance coordinator. If handler registration fails, readiness remains unpublished, partial composition is disposed through the existing failure path, and no maintenance is submitted. The coordinator is a reusable ingress, not a one-shot function: a post-ready reload caller passes newly returned descriptors to the same coordinator, which relies on registry/frontier deduplication. The backend factory, `loadDatabase()`, `reloadDatabase()`, and individual feature modules never submit work themselves. The final startup profile is reported after the outer `plugin.onload` span closes, not from the middle of `ApplicationContext.create()`.

Alternative considered: keep the current client-side submission guard. Rejected because repeated load paths and explicit factory scheduling bypass it, and client methods should not own composition lifecycle.

### 3. Give deferred maintenance stable identity and truthful lifecycle state

The background-work registry will accept a job-lifecycle dedupe key composed from:

- accurate work kind;
- the current ephemeral runtime instance scope plus stable plugin installation scope;
- relevant identity epoch;
- maintenance frontier or bounded phase identity.

Submitting an equivalent accepted/running job coalesces with the existing job and returns its identity/status. A terminal job can be resubmitted only when its frontier changed or the retry policy explicitly permits another attempt. Writer and follower modes use the same identity rules; follower mode cannot create a second writer path.

The ephemeral runtime instance component belongs only to registry job lifecycle and shutdown isolation. It is never persisted in a Durability Receipt and never participates in warm-start receipt matching.

The generic `startup-storage-maintenance` name must either be replaced with accurate kinds such as `startup-review-truth-maintenance`, or become a real parent job whose named phases and counters cover all owned work. Status cannot report completion when it only scheduled a timer or another untracked job. If Review truth flush uses a timer for batching, the timer and child work remain registry-owned/cancelable, and parent completion waits for accepted terminal ownership or reports an explicit deferred child reference.

Unload/shutdown atomically prevents new follow-up submission and cancels, defers, or terminates queued/running work according to existing registry semantics. No detached promise or timer may outlive registry shutdown.

Alternative considered: module-local job ID fields and timer guards. Rejected because they do not deduplicate across submitters or represent lifecycle across reload/unload.

### 4. Define receipt evidence around a Worker-owned post-maintenance frontier

The receipt Module will consume a narrow application/Worker port that exposes a stable maintenance input frontier. The frontier may include truth generation, delta/checkpoint generation, identity epoch, and a maintenance input version, but it cannot depend on card-content enumeration or a renderer-only core storage API.

A completed receipt contains:

- maintenance kind/version;
- durable `pluginInstallationId + identityEpoch` scope;
- pre-work frontier used to decide the scan;
- post-success frontier observed after all owned mutations commit;
- completion time and safe counters;
- terminal success marker.

The fast path skips only when the current Worker-owned frontier exactly matches the completed post-success frontier. Missing, malformed, ambiguous, old-version, write-failed, or mismatched receipt evidence falls back to the bounded full path. If maintenance itself changes canonical inputs, the receipt is written from the post-commit frontier; using the pre-scan frontier is invalid.

The Worker frontier also carries a cheap external-input dirty generation or equivalent pending-merge marker. Accepting/observing an external storage change updates that marker atomically before status can return a receipt match. While an external merge is queued, in progress, or cannot be proven represented by the authoritative generation/checkpoint, status returns ambiguous/mismatched evidence. Completing the merge advances the authoritative frontier in the same ownership path; status never performs the merge merely to answer.

`storage.maintenance.status` is a cheap Worker-native read that is exempt from external storage merge and main projection preflight only if it touches receipt/frontier metadata alone. Tests must prove it does not enumerate cards or invoke a storage merge. Mutating apply calls retain normal writer checks and only the preflight needed by their invariant.

The cheap receipt/frontier decision may run before the ready transition. If evidence does not permit skipping, schedule normalization and orphan repair are classified independently: a phase proven required for initial read/write correctness remains a bounded synchronous gate or keeps only the affected capability unavailable; a phase proven safe to defer becomes a descriptor submitted by the post-ready coordinator. Receipt ambiguity does not by itself justify either silently skipping or indiscriminately blocking all plugin readiness.

Alternative considered: keep `StartupMaintenanceStoreIdentity` on `UnifiedStorageManager`. Rejected because it leaks an application startup optimization into the core storage abstraction and can still require renderer-side state gathering.

### 5. Replace blanket long timeouts with operation-specific contracts

The transport will use:

- a short bounded timeout for receipt/status reads;
- a measured bound for `db.load`/`db.reload` safety/readability work;
- a separate mutation-batch bound based on maximum batch size and cancellation behavior;
- explicit operation name, phase, elapsed time, and safe state in timeout errors.

No operation gets a generic 300,000 ms timeout merely because it previously hung. If a synchronous phase cannot meet the load budget, it must be reclassified, bounded, or shown to be a real safety gate. Host-effect and request timeouts remain aligned so the shorter layer does not mask the real phase.

Alternative considered: retain five-minute timeouts as resilience. Rejected because they convert a startup architecture defect into an unresponsive plugin and erase useful failure locality.

### 6. Maintain a reviewed startup phase matrix

Before moving code, the implementer will inventory every current `WorkerSqliteDatabaseService.init()` phase and record:

| Phase family | Default classification | Required proof |
| --- | --- | --- |
| Truth/delta/identity validation and recovery disposition | Synchronous gate | Cannot report normal readiness without authority continuity |
| Disposable projection open/rebuild needed for readable queries | Synchronous gate | Required queries cannot safely use stale/missing projection |
| Hard storage pressure inventory and bounded gate | Synchronous gate | Writes must remain blocked until the hard condition is resolved or recovery is explicit |
| Review journal replay/reconciliation | Unclassified until tested | Must not expose stale queue readiness or advance work without durable identity/event evidence |
| Kernel snapshot restore | Unclassified until tested | Must prove initial readable state does not depend on it before deferral |
| Domain sync backfill | Unclassified until tested | Must prove callers tolerate explicit pending status |
| Truth promotion/backfill continuation | Deferred-safe when normal pressure | Worker writer authority, dedupe, pending/error status, and epoch checks remain intact |
| Storage-growth baseline | Inventory synchronously; bounded remediation by pressure | Normal pressure may defer; hard pressure remains a write gate; no unconditional 10,000-item startup loop |
| Schedule normalization | Unclassified until tested | Must prove whether malformed schedule can affect initial Review reads/writes; otherwise expose the affected surface pending or keep a bounded gate |
| Orphan-card repair | Unclassified until tested | Must prove orphan filtering/read safety before deferral and preserve Worker mutation ownership |

`db.load` returns the typed readiness disposition plus explicit deferred descriptors/status references. “Projection readable” does not mean all maintenance is complete. Queue/read models that depend on a pending synchronous-class phase must expose unavailable/refresh-required status rather than stale normal counts.

Alternative considered: move all named maintenance to background work based on latency alone. Rejected because Review projection and hard-pressure work can carry correctness invariants.

### 7. Use an always-on bounded startup-only diagnostics buffer

Full runtime performance diagnostics remain opt-in. Separately, each startup attempt gets a bounded in-memory buffer containing only known startup operation names, duration, success/failure, and allow-listed scalar metadata. It has a fixed span count/size, resets per attempt, and is discarded after final reporting.

The outer `plugin.onload` owner closes its span and then asks the reporter to emit only when the threshold is exceeded or a slow failed startup requires evidence. `ApplicationContext.create()` contributes child spans but does not report. Duplicate `application-context.create` instrumentation is consolidated to one span name/owner.

Alternative considered: report only when full diagnostics are enabled. Rejected because the current default disables the evidence exactly when users encounter a slow startup.

### 8. Scope the CJS browser bootstrap to inline Worker construction

Remove import-time `installCjsBrowserGlobals()`. `BrowserSrsBackendWorkerTransport` will lazily acquire the minimum constructor surface immediately before the Vite inline Worker wrapper is constructed.

Preferred order:

1. pass explicit `Worker`, `Blob`, and `URL` constructors through a narrow factory/adapter if the generated wrapper permits it;
2. otherwise use a scoped bridge that snapshots property descriptors, defines only missing properties needed by the wrapper, constructs the Worker, and restores the descriptors in `finally`;
3. never overwrite an existing valid global, never fabricate `window`/`self` aliases unless the built wrapper demonstrably requires them, and fail explicitly on non-writable/non-configurable missing requirements.

Tests must evaluate the shipped CJS bundle shape, not only source modules, because lexical `window`/`self` behavior is bundler-sensitive.

Alternative considered: persistent global aliases installed at module import. Rejected because a SiYuan host is shared by multiple plugins and persistent mutation creates cross-plugin coupling.

### 9. Preserve storage ownership and architectural boundaries

All maintenance mutations continue through Worker-owned repositories/truth runtimes and existing writer checks. The kernel companion registry coordinates lifecycle/status only. Renderer/ApplicationContext code can read readiness/status and submit descriptors but cannot acquire SQLite or truth mutation authority.

The startup-specific receipt/frontier port belongs to the application/backend boundary or a Worker startup Module. Core storage may expose a generally named immutable snapshot/generation identity only if it is already domain-neutral and has non-startup consumers; otherwise no core interface expansion is permitted.

Boundary/forbidden-pattern validation must cover fallback/legacy paths, direct renderer/kernel DB access, import-time CJS global mutation, and unregistered startup timers.

## Risks / Trade-offs

- [Risk] Treating transient identity authority failure as recovery may make startup less available. → Mitigation: expose a typed transient reason and retry path, but never grant write-capable readiness without verified authority.
- [Risk] Deferring Review reconciliation could expose stale queue data. → Mitigation: keep it synchronous unless tests prove a safe explicit pending/unavailable read model; the phase matrix defaults to unclassified, not deferred.
- [Risk] Registry dedupe keys may suppress legitimate later work. → Mitigation: separate ephemeral job scope from durable receipt scope, include identity epoch and maintenance frontier, route reload descriptors through the same coordinator, and permit resubmission only after frontier change or explicit retry policy.
- [Risk] A post-maintenance frontier read could itself be expensive. → Mitigation: derive it from Worker-owned generations/checkpoints, never card enumeration, and enforce no-scan/no-merge tests.
- [Risk] Shorter timeouts may reveal existing slow safety work as failures. → Mitigation: profile and classify the phase; bound or defer only when invariants permit instead of restoring blanket timeouts.
- [Risk] Scoped global restoration may not work with an asynchronously evaluated wrapper. → Mitigation: smoke-test the built bundle; if the wrapper reads globals later, use an isolated adapter/factory rather than persistent shared aliases.
- [Risk] The dirty worktree can cause an implementer to overwrite adjacent changes. → Mitigation: capture `git status`, focused diffs, and file hashes before each slice; patch minimally and never reset or edit the baseline mirror.

## Migration Plan

1. Capture the current dirty baseline and add failing focused tests for typed identity dispositions, repeated load submission, cheap receipt status, disabled-diagnostics profiling, and CJS global scope.
2. Introduce the typed startup disposition and propagate it through identity resolution, backend load evidence, ApplicationContext readiness, and Review journal/truth mutation gates.
3. Make load/reload pure, add the single post-ready coordinator, then add registry-level dedupe and unload-safe lifecycle semantics.
4. Move receipt/frontier ownership out of core storage, implement the Worker-native cheap read, write post-success receipts, and replace blanket timeout policy.
5. Build and enforce the Worker startup phase matrix; move only tested deferred-safe phases and expose descriptors/status for all pending work.
6. Add the bounded startup-only diagnostics buffer and move final reporting to the outer `plugin.onload` owner.
7. Replace import-time CJS global mutation with the minimum lazy construction bridge and built-bundle smoke coverage.
8. Update architecture/debt documentation, run focused and broad verification, then perform live SiYuan restart and representative large-store startup checks before declaring the fix complete.

Rollback is code-only: restore synchronous execution for any phase whose deferral proves unsafe, while retaining the typed fail-closed identity gate and pure load contract. No persistent schema or truth-format migration is introduced. Receipt versions must be invalidated rather than interpreted if rollback changes frontier semantics.

## Open Questions

- Can Review journal projection reconciliation expose an explicit pending/unavailable queue read model, or must it remain synchronous? Tests and current consumers decide; latency alone does not.
- Does the generated Vite CJS inline Worker wrapper require `window`/`self` after constructor return? The built-bundle smoke test decides whether descriptor restoration is sufficient or an isolated long-lived adapter is required.
- What measured budgets apply to status, load/reload, and bounded mutation batches on the supported large-store fixture? Record the chosen values with evidence rather than copying the former 300-second bound.
