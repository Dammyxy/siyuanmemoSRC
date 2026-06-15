## 1. Characterize Existing Delete Paths

- [x] 1.1 Add or update tests proving current Browser/Review/Card local delete events can reach `RiffSyncEventHandler`.
- [x] 1.2 Add or update tests proving current `deleteSync` and `deleteSyncBatch` call `removeRiffCards`.
- [x] 1.3 Add or update tests proving native Riff remove transactions route through `handleNativeRiffRemove` and only plan local removals for managed local Xiuyuans.

## 2. Introduce Delete Intent Contract

- [x] 2.1 Add a delete intent type that distinguishes `local-tombstone` from `native-hard-delete`.
- [x] 2.2 Route Browser, Review, and Card CRUD default deletes through `local-tombstone`.
- [x] 2.3 Update delete events or event handler routing so missing intent resolves to `local-tombstone`, not native Riff removal.
- [x] 2.4 Ensure MCP-facing delete adapters use the same intent contract and default to `local-tombstone`.

## 3. Persist Local Tombstones

- [x] 3.1 Persist tombstones when default local delete hides/removes a native Riff-backed card from SiYuanMemo local state.
- [x] 3.2 Store enough tombstone identity to match block id, card id, xiuyuan id, and native Riff id when available.
- [x] 3.3 Make full sync skip create/update for native Riff cards matching persistent tombstones.
- [x] 3.4 Make incremental sync skip create/update for native Riff cards matching persistent tombstones.

## 4. Keep Inbound Native Riff Remove Reconciliation

- [x] 4.1 Keep native Riff remove transaction handling as inbound source-of-truth reconciliation.
- [x] 4.2 Persist card and xiuyuan tombstones when inbound native Riff remove deletes or hides managed local state.
- [x] 4.3 Skip local mutation for unknown or unmanaged native Riff remove targets.

## 5. Gate Native Hard-Delete

- [x] 5.1 Add an explicit native-hard-delete entrypoint or option that is separate from default local delete.
- [x] 5.2 Require explicit dangerous confirmation or reliable SiYuanMemo ownership proof before calling `removeRiffCards`.
- [x] 5.3 Reject native-hard-delete when ownership proof and dangerous confirmation are both absent.
- [x] 5.4 Record native hard-delete operations distinctly from local tombstones.

## 6. Validate And Document

- [x] 6.1 Run focused delete/sync tests for Riff event handling, Xiuyuan sync semantic routing, native Riff trigger handling, repository sync change sets, and worker tombstone behavior.
- [x] 6.2 Run boundary/fallback checks required for production sync/delete edits.
- [x] 6.3 Update `ARCHITECTURE.md` if delete intent changes runtime ownership or event flow documentation.
- [x] 6.4 Update `docs/DDD_RESCAN_BACKLOG.md` when the Native Riff hard-delete debt is closed or deliberately deferred.
