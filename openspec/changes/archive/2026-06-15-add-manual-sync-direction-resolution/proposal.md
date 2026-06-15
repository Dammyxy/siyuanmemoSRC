## Why

SiYuan file sync can place newer `siyuanmemo.db` copies under conflict paths while the active plugin database remains older. SiYuanMemo already supports automatic and manual smart merge, but users still need an Anki-style explicit direction choice when they trust either the current local database or a conflict copy more than the merge result.

## What Changes

- Add a manual sync conflict resolution flow that previews available conflict database copies before applying changes.
- Let the user choose one of these directions:
  - Smart merge conflict copies into the current database.
  - Keep the current local database and ignore selected conflict copies for this run.
  - Replace the current local database with one selected conflict copy after creating a local backup.
  - Cancel without changing data.
- Show enough source metadata for a safe choice: conflict source id/path, file timestamp when available, review event count, card count, and whether it appears newer than the current database.
- Require an explicit confirmation before replacing the current database.
- Reload or reinitialize backend SQLite state after any full database replacement so the worker cannot persist stale in-memory data over the selected copy.
- Do not delete SiYuan conflict files as part of this change.

## Capabilities

### New Capabilities

- `manual-sync-direction-resolution`: User-directed recovery for SiYuanMemo sync conflict database copies, including preview, direction selection, backup, replacement, and smart merge.

### Modified Capabilities

- None.

## Impact

- UI/application entry: topbar context menu and command-palette manual sync conflict action.
- Application services: conflict source preview, direction resolution orchestration, backup policy.
- Infrastructure services: reading conflict DB metadata, backing up current plugin DB, replacing current plugin DB atomically through plugin data APIs where possible.
- Backend worker/RPC: smart merge reuse, full database replacement/reload support, source metadata inspection.
- Tests: service-level direction tests, backend replacement/reload regression tests, FileService backup/replacement tests, and targeted integration tests around existing conflict DB merge behavior.
