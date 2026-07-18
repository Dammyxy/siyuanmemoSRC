## Why

Truth Device Identity currently treats matching IndexedDB and localStorage records as authority, but both records share the same browser-origin/profile failure boundary. A real origin loss kept canonical truth and journal evidence while silently generating a new epoch, producing `FRONTIER_FOREIGN_EPOCH_UNCOVERED` and disabling Review writes; identity authority must move to origin-independent local installation storage before another browser-origin change can repeat the failure.

## What Changes

- **BREAKING** Replace IndexedDB/localStorage identity authority with one installation-local, workspace-scoped, non-synchronized authority record under SiYuan `conf/`.
- Introduce a deep Truth Device Identity module that owns first-install creation, validation, cache repair, conflict classification, explicit epoch lifecycle, and fail-closed recovery decisions.
- Demote IndexedDB, localStorage, and temp-local identity records to caches/migration evidence; cache absence or conflict no longer creates a device or epoch.
- Route frontend and Worker identity consumers through the validated module contract and remove direct storage-adapter authority decisions.
- Permit first-install generation only when no prior identity, truth, delta, or frontier evidence exists; otherwise require explicit storage recovery.
- Preserve `System.ID` as diagnostic host fingerprint evidence only.
- Add migration, cross-origin, restart, corrupt-authority, non-empty-installation, and browser-cache-loss tests plus a boundary guard against browser-authority regressions.
- Keep recovery of the existing foreign-epoch journal sequence 404 outside this change; that evidence-preserving repair requires a separate multi-epoch recovery change.

## Capabilities

### New Capabilities

- `installation-truth-device-identity-authority`: Defines the installation-local identity authority, browser-cache semantics, first-install/migration rules, epoch lifecycle, recovery behavior, and consumer boundary.

### Modified Capabilities

None.

## Impact

- Identity composition: `src/application/factories/truthDeviceIdentity.ts`, identity ports/adapters, `FileService`, application backend runtime composition, and related tests.
- Runtime contracts and consumers: backend RPC identity payloads, startup readiness, Worker bootstrap, Verified Mutation Frontier admission, Truth Promotion, and storage recovery diagnostics.
- Persistence: a plugin-owned record below `/conf/siyuan-plugin-siyuanmemo/`; existing IndexedDB/localStorage/temp data becomes cache or one-time migration evidence.
- Architecture governance: Runtime ADR-006 supersedes only Runtime ADR-002's Device Identity section; current Worker authority and immutable mutation evidence remain unchanged.
