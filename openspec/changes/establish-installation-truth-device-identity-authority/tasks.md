## 1. Contracts and characterization

- [x] 1.1 Add shared contracts for the versioned installation authority envelope, revision, typed resolution dispositions, cache diagnostics, evidence-probe result, and initialization fence without changing downstream `deviceId + identityEpoch` mutation envelopes.
- [x] 1.2 Add characterization tests for current matching-copy migration, browser-cache conflict, temp-only migration, host-fingerprint observation, startup identity admission, and Worker identity propagation before replacing production composition.
- [x] 1.3 Define role-specific authority, cache, evidence-probe, and initialization-fence ports; prevent the authority adapter type from being satisfied accidentally by the existing IndexedDB store.

## 2. Installation-local authority adapter

- [x] 2.1 Add strict FileService read/write support for `/conf/siyuan-plugin-siyuanmemo/truth-device-identity.v1.json` with path allowlisting and no `data/` or `temp/` fallback.
- [x] 2.2 Implement the installation authority adapter with schema/revision validation, exact read-after-write verification, and retained previous verified recovery evidence.
- [x] 2.3 Add adapter tests for missing, valid, invalid JSON, unsupported version, invalid identity/revision, write failure, read-back mismatch, and path traversal rejection.
- [x] 2.4 Add an evidence-probe adapter that distinguishes a genuinely empty installation from prior identity, truth, delta, Frontier, or recovery evidence without parsing synchronized truth into a replacement authority.
- [x] 2.5 Add evidence-probe tests covering empty install, canonical truth only, delta only, Frontier only, prior authority recovery evidence, temp-only device ID, and probe unavailability.

## 3. Deep Truth Device Identity module

- [x] 3.1 Add test-first migration-matrix cases for existing authority, matching legacy browser pair, conflicting pair, single surviving record, missing caches in a non-empty installation, temp-only device ID, and truly empty first install.
- [x] 3.2 Implement authority-first resolution, strict first-install generation, typed recovery classification, and one-time matching-pair migration in the deep module.
- [x] 3.3 Add cache-role tests proving missing, invalid, conflicting, or inaccessible IndexedDB/localStorage never override a valid authority and cache repair failure remains diagnostic only.
- [x] 3.4 Implement best-effort IndexedDB/localStorage/temp cache rehydration or invalidation behind cache ports and remove routine authority writes for `lastSeenAt`/host observations.
- [x] 3.5 Add epoch-lifecycle tests proving origin/profile/cache/`System.ID` changes do not rotate identity and foreign-epoch mutation envelopes are never rebound, skipped, renumbered, or covered synthetically.

## 4. Cross-origin initialization fencing

- [x] 4.1 Add a Kernel Sidecar RPC/lease contract that serializes only authority creation, migration, and explicit revision while keeping the Sidecar outside database and identity ownership.
- [x] 4.2 Implement the initialization fence client/server path with timeout, disconnect cleanup, retryable unavailable disposition, and mandatory evidence/authority re-read after acquisition.
- [x] 4.3 Add concurrent-origin tests proving two initializers publish one authority and fence unavailability never falls back to an unfenced write.

## 5. Runtime cutover

- [x] 5.1 Resolve installation identity before Worker `db.load`, inject the deep module into backend runtime composition, and preserve downstream verified identity contracts and fail-closed startup behavior.
- [x] 5.2 Replace `IndexedDbTruthDeviceIdentityStore` authority construction with the `conf/` adapter; wire IndexedDB/localStorage/temp only as cache or migration adapters in the same change.
- [x] 5.3 Replace browser-authority source-name admission with typed module dispositions across startup readiness, `SrsBackendClient`, Worker bootstrap, Verified Mutation Frontier, Truth Promotion, and recovery diagnostics.
- [x] 5.4 Add integration tests for warm restart, changed origin/port, cleared browser data, cache access denial, matching legacy migration, non-empty missing authority, concurrent frontend startup, and unchanged Worker mutation identity.
- [x] 5.5 Remove obsolete browser-copy authority branches/source labels and update affected tests without adding compatibility fallback or automatic epoch generation.

## 6. Regression guards and documentation

- [x] 6.1 Add a boundary guard and guard tests that reject production construction/imports assigning IndexedDB, localStorage, or temp-local stores to the Truth Device Identity authority port.
- [x] 6.2 Update `ARCHITECTURE.md`, startup/readiness OpenSpec text, diagnostics, and the DDD debt ledger to name the installation authority and browser caches consistently with Runtime ADR-006 and `CONTEXT.md`.
- [x] 6.3 Preserve the completed browser-authority change artifacts as historical records while adding explicit supersession pointers where they can be mistaken for the current contract.

## 7. Verification and rollout

- [x] 7.1 Run focused identity, FileService, backend runtime, SrsBackendClient, Worker startup, Frontier, Truth Promotion, and kernel fence tests.
- [x] 7.2 Run typecheck, production build, `git diff --check`, OpenSpec validation, and all architecture/storage authority guards.
- [ ] 7.3 Perform a local acceptance probe across two frontend origins: verify one unchanged authority, clear browser caches, restart, and confirm identity/epoch remain stable without authority rewrites.
- [x] 7.4 Record rollout/rollback evidence and explicitly hand off the existing journal-404 foreign-epoch recovery to a separate multi-epoch recovery change before enabling Review writes for that damaged installation.
