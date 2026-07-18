## Context

The current resolver reads a version-2 identity record from IndexedDB and localStorage, requires the two browser copies to agree, and uses a temp-local record as migration evidence. That works only while the frontend origin/profile remains stable. Production evidence showed a real rating at device journal sequence 404 under epoch `f771...`, followed by origin loss and startup-generated epoch `4afa...`; the Verified Mutation Frontier correctly rejected the uncovered foreign epoch.

SiYuan's file API resolves paths inside the active workspace. Its synchronized repository is rooted at `data/`, while `conf/` is local workspace configuration and is not temp-cleaned. A record below `conf/` is therefore accessible from Electron/browser/mobile surfaces against the same kernel, independent of frontend origin, and stays local to the workspace installation that owns this device's truth copy.

The repository is already fail-closed: startup supplies a verified `deviceId + identityEpoch` to Worker storage, Frontier, and Truth Promotion, or Review writes are disabled. This change replaces how that verified identity is established; it does not weaken those gates.

## Goals / Non-Goals

**Goals:**

- Make one origin-independent, non-synchronized, non-temp record the complete Truth Device Identity authority.
- Hide physical authority/cache adapters behind a deep module with one resolution result and explicit recovery classifications.
- Migrate safe existing installations without creating an epoch from partial evidence.
- Make browser storage loss and origin changes cache-repair events rather than identity lifecycle events.
- Fence first-install/migration writes and verify persisted authority before enabling formal Worker writes.
- Prevent future direct browser-authority composition with tests and a static boundary guard.

**Non-Goals:**

- Recovering or rewriting the existing journal sequence 404 foreign-epoch mutation.
- Changing Worker SQL/truth ownership, journal sequencing, Truth Promotion ordering, or Frontier continuity rules.
- Inferring an active identity from synchronized truth manifests when local authority is missing.
- Turning `System.ID`, the temp mirror, or synchronized plugin data into fallback authority.
- Designing a general distributed lock service beyond rare identity-authority initialization/rotation.

## Decisions

### 1. Add a deep identity module with role-specific ports

Replace storage-first branching in `truthDeviceIdentity.ts` with an application-owned module whose public operation is conceptually `resolveInstallationIdentity()` and whose dependencies have distinct roles:

- `TruthDeviceIdentityAuthorityPort`: read and publish the full installation-local authority envelope.
- `TruthDeviceIdentityCachePort`: optional IndexedDB/localStorage read, overwrite, and invalidation operations.
- `TruthDeviceIdentityEvidenceProbePort`: reports whether any prior identity, truth, delta, Frontier, or recovery evidence makes the installation non-empty.
- `TruthDeviceIdentityInitializationFencePort`: serializes the rare authority creation/migration operation across frontend origins.

Consumers receive only a typed resolution (`verified`, retryable `authority-unavailable`, or non-retryable `identity-recovery-required`) plus diagnostics. They do not choose among adapters.

This is deeper than adding a third copy to the current resolver: the module centralizes lifecycle policy, while adapters remain replaceable mechanisms.

### 2. Store authority below workspace `conf/`

The authority adapter uses `/conf/siyuan-plugin-siyuanmemo/truth-device-identity.v1.json`. The file contains a versioned authority envelope with a monotonic revision and the existing versioned identity payload (`deviceId`, `identityEpoch`, `createdAt`, and diagnostic host fields). A previous verified envelope may be retained as recovery evidence, but it is never an automatic competing authority.

The adapter validates schema and identity syntax, publishes under the initialization fence, reads the record back, and compares the exact authoritative identity/revision before returning success. Routine startup does not rewrite the file; `lastSeenAt` and host-observation churn stay in caches/diagnostics.

`Plugin.saveData()`, `/data/storage/petal`, and workspace `temp/` are rejected because they are synchronized or disposable. An OS-home file is rejected because SiYuan's supported cross-surface file seam is workspace-scoped and the identity must remain adjacent to the local truth installation.

### 3. Fence only authority mutation, not every read

Existing authority reads require no coordination. Creation, one-time migration, and future explicit epoch rotation acquire a dedicated Kernel Sidecar initialization fence before re-reading evidence and publishing. The Sidecar only serializes the host effect; it does not become the identity authority or a database writer.

If the Sidecar/fence is unavailable while an authority mutation is required, startup returns retryable `authority-unavailable`. It does not race an unfenced write. This avoids making ordinary warm startup dependent on lease acquisition while preventing two origins from creating different first identities.

### 4. Use a strict migration matrix

When the `conf/` authority is absent:

1. Two matching, valid versioned IndexedDB/localStorage records may migrate once under the initialization fence, after a second read confirms they still match.
2. Conflicting/invalid versioned records in a non-empty installation require identity recovery.
3. A single browser record, legacy device ID, or temp-only device ID cannot fabricate the missing epoch for a non-empty installation; recovery is required.
4. When the evidence probe proves the installation empty, create a fresh full identity regardless of stale browser cache and then overwrite caches from the new authority.
5. When browser records are absent but any truth/delta/Frontier/prior identity evidence exists, do not infer identity from synchronized manifests and do not generate; require recovery.

This accepts a stricter one-time migration for ambiguous installations in exchange for never silently forking an existing journal.

### 5. Authority always wins over caches after migration

Once the `conf/` record exists and validates, browser cache reads are diagnostic only. Missing, invalid, conflicting, or inaccessible caches do not block a verified authority. The module best-effort overwrites or invalidates them and reports cache repair status. Cache repair failure is observable but does not disable formal writes.

An authority conflict with local immutable evidence is different from a cache conflict and remains fail-closed.

### 6. Epoch changes are explicit and evidence-preserving

Origin/profile changes, cache clearing, `System.ID` changes, and host fingerprint changes never rotate `identityEpoch`. A future explicit recovery operation may publish a higher authority revision and new epoch only after recording predecessor/recovery evidence required by Frontier. It cannot mutate existing journal envelopes, rebind sequence 404, skip sequences, or manufacture coverage.

The current foreign-epoch incident therefore remains blocked until a separate multi-epoch recovery change proves how to preserve the original `f771...` mutation.

### 7. Cut over atomically at composition boundaries

The implementation removes `IndexedDbTruthDeviceIdentityStore` from the authority slot in production composition in the same slice that introduces the `conf/` adapter. Startup readiness source allowlists change from browser-copy source names to module dispositions. Worker contracts continue receiving the same verified `deviceId + identityEpoch`; downstream storage code does not learn the physical authority path.

A guard rejects production imports/construction that label IndexedDB, localStorage, or temp-local stores as Truth Device Identity authority.

## Risks / Trade-offs

- **`conf/` is workspace-installation scoped, not global to the OS app** → This is intentional: each local workspace copy owns a distinct device truth namespace, while synchronized `data/` may travel to other devices.
- **Authority file corruption can block Review** → Keep the last verified envelope as recovery evidence, validate/read back every authority write, avoid routine writes, and fail closed with exportable diagnostics rather than guessing.
- **Kernel Sidecar unavailable during a first install or migration** → Return retryable authority-unavailable; existing verified authorities still use the read-only fast path.
- **Strict migration rejects a valid installation with only one surviving browser record** → Prefer explicit recovery over generating or trusting an uncorroborated epoch in a non-empty corpus.
- **Evidence probing can add startup I/O** → Probe only when authority is missing/invalid; the normal verified-authority path is one small local file read plus optional cache repair.
- **Old completed OpenSpec/ADR text still describes the historical browser-authority implementation** → Runtime ADR-006 and the ADR registry mark supersession; active specs and implementation tests become the current contract.

## Migration Plan

1. Add authority envelope/cache/evidence/fence contracts and focused unit tests.
2. Add FileService `conf/` authority adapter with strict path validation, read-back verification, and no temp/sync fallback.
3. Add the identity module and characterize the migration matrix test-first.
4. Add the Sidecar initialization fence for authority mutation and test concurrent origins.
5. Integrate the module before Worker `db.load`; keep downstream verified identity contracts unchanged.
6. Switch IndexedDB/localStorage/temp adapters to cache/migration roles and remove browser-copy source names from writable admission.
7. Add cross-origin/restart/browser-cache-loss/non-empty-missing-authority integration tests and the boundary guard.
8. Update active startup specs/docs that still call the browser copies authorities; preserve completed change artifacts as historical records.
9. Rollback only by disabling the new rollout before any new authority is published. After publication, rollback may read the `conf/` record to hydrate legacy caches but must never regenerate or downgrade its epoch.

## Open Questions

None for implementation start. Recovery semantics for the existing foreign-epoch journal are intentionally delegated to a separate change.
