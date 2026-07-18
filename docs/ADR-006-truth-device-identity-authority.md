# ADR-006 Installation-local Truth Device Identity Authority

- Series: Runtime Architecture
- Status: Accepted
- Date: 2026-07-17
- Supersedes: [Runtime ADR-002](./ADR-002-sql-worker-authority.md) `Device Identity` section only
- Registry: [Architecture Decision Registry](./ADR-INDEX.md)

## Context

`IndexedDB` and `localStorage` are scoped to a browser origin/profile. A SiYuan origin or browser-profile change can remove both copies together even though the local truth corpus still exists. The previous startup path then reused a temp-only `deviceId`, generated a new `identityEpoch`, and made an existing journal mutation appear to belong to an uncovered foreign epoch. Browser storage therefore cannot prove Truth Device Identity continuity.

In this decision, an **installation** is the local SiYuan workspace instance that owns this device's copy of the SiYuanMemo truth corpus. It is not a browser origin, tab, session, synchronized account, or the global OS application installation.

## Decision

Truth Device Identity becomes a deep module with one origin-independent authority and disposable cache adapters:

1. The authoritative full identity record lives in plugin-owned local configuration under the current SiYuan workspace `conf/` tree. The planned adapter path is `/conf/siyuan-plugin-siyuanmemo/truth-device-identity.v1.json`.
2. The host file API is the cross-origin access seam. SiYuan resolves `/api/file/getFile` and `/api/file/putFile` paths inside the workspace, while its sync repository is rooted at `data/`; the `conf/` record is therefore local, non-synchronized, and outside temp cleanup.
3. `IndexedDB`, `localStorage`, and any workspace-temp mirror are caches only. The authority repairs or invalidates them; cache absence or disagreement never creates an identity or rotates an epoch.
4. The module owns record validation, first-install creation, cache repair, conflict classification, explicit epoch lifecycle, and recovery decisions. Frontend and Worker consumers receive a validated identity through this module instead of reading storage adapters directly.
5. A new identity may be generated only when the authority is absent and no existing truth, delta, frontier, or prior identity evidence exists. Missing, corrupt, or conflicting authority in a non-empty installation fails closed as `STORAGE_RECOVERY_REQUIRED`.
6. `System.ID` remains diagnostic host fingerprint evidence. It neither owns the truth namespace nor triggers identity/epoch replacement when it changes.
7. Identity authority changes are rare, fenced writes with schema/revision validation and read-after-write verification. Routine `lastSeenAt` diagnostics belong in caches and must not turn identity startup into a hot write path.
8. Existing epoch namespaces and mutation envelopes are immutable evidence. Identity recovery must not rewrite an envelope's epoch, skip or renumber journal sequence, or forge frontier coverage.

## Consequences

- Opening the same SiYuan workspace through Electron, browser, a changed local port, or another frontend origin resolves the same local authority.
- Clearing browser data causes cache rehydration instead of a new epoch.
- Copying synchronized `data/` to another device does not copy the local identity authority; that device establishes or recovers its own local identity against the available evidence.
- The current journal-404 foreign-epoch incident is not repaired by this ADR. Preserving and recovering that original mutation is a separate multi-epoch recovery change.
- Runtime ADR-002 remains accepted for Worker write authority, canonical truth, durability receipts, fail-closed recovery, and immutable mutation evidence. Only its browser-authority Device Identity section is superseded.

## Rejected alternatives

- **Keep IndexedDB + localStorage as redundant authorities**: rejected because both share browser-origin/profile failure modes.
- **Use workspace `temp/`**: rejected because it is intentionally disposable.
- **Use `data/storage/petal` or `Plugin.saveData()`**: rejected because those records belong to synchronized plugin data.
- **Use `System.ID` as the authority**: rejected because it is runtime/host evidence, not a stable plugin truth-installation identity contract.
- **Store only in an OS home-directory file**: rejected because the host file API deliberately scopes plugin access to the workspace, and the identity must stay locally adjacent to the workspace truth corpus across desktop, browser, and mobile surfaces.

## Host capability evidence

- SiYuan v3.7.1 [`GetAbsPathInWorkspace`](https://github.com/siyuan-note/siyuan/blob/v3.7.1/kernel/util/path.go#L355-L365) resolves file API paths beneath the active workspace.
- SiYuan v3.7.1 [`putFile`](https://github.com/siyuan-note/siyuan/blob/v3.7.1/kernel/api/file.go#L691-L780) persists such workspace-relative paths and creates parent directories.
- SiYuan v3.7.1 [`newRepository`](https://github.com/siyuan-note/siyuan/blob/v3.7.1/kernel/model/repository.go#L2241-L2274) roots snapshot/sync data at `util.DataDir`, not the workspace `conf/` tree.
