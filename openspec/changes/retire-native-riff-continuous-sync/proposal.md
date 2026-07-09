## Why

Native Riff is no longer SiYuanMemo scheduling truth, but the runtime still carries continuous sync, reconciliation, checkpoint, blacklist, transaction-listener, delete, and feedback-write behavior. Retiring that lifecycle removes a second card authority and lets imported cards use live SiYuan block semantics without depending on fragile Riff ownership metadata.

## What Changes

- **BREAKING** Retire startup, Browser-open, transaction-driven, scheduled full, and manual incremental/full Native Riff synchronization.
- **BREAKING** Remove all SiYuanMemo writes to Native Riff, including add-card, remove-card, and rating/feedback bridges.
- Add explicit preview/apply Native Riff import as the only Riff read path.
- Add explicit preview/apply adoption for existing `riff-managed` cards, preserving local identity, scheduling, review history, tags, and priority while converting ownership to `local-owned`.
- Rebuild adopted card semantics, faces, templates, symbol evidence, and SRS Card Render Contract from live SiYuan block Markdown.
- Seed newly imported cards once from a valid Native Riff current-schedule snapshot without importing full Native Riff review history.
- Preserve immutable import receipts for idempotency and diagnostics without treating receipt identity as sync ownership.
- Respect Native Riff import tombstones and migrate legacy blacklist entries into restorable import exclusions.
- Apply face-level completion for missing semantic faces while leaving existing `local-owned` faces unchanged.
- Remove retired Riff sync settings, checkpoint/background-work wiring, blacklist runtime, sync RPC/runtime, and compatibility write adapters.

## Capabilities

### New Capabilities

- `native-riff-read-only-import`: Defines explicit Native Riff import, existing-card adoption, schedule seeding, import receipts, tombstone/exclusion behavior, face completion, and zero outbound Riff writes.

### Modified Capabilities

- `xiuyuan-startup-sync-lifecycle`: Retires startup Xiuyuan Native Riff synchronization and its background-work lifecycle.
- `worker-sqlite-runtime-families`: Retires the `xiuyuan.sync.execute` worker family and its checkpoint/reconciliation apply behavior.

## Impact

- Application composition: `ApplicationContext`, settings, Browser actions, DialogManager, transaction fanout, and background-work registration.
- Xiuyuan/Riff application code: `XiuyuanSyncService*`, blacklist/delete runtimes, Native Riff handlers, compatibility policies, ports, and adapters.
- Worker/backend contracts: `xiuyuan.sync.execute`, worker planner/runtime, SQLite Riff checkpoint/blacklist persistence, RPC catalog, and tests.
- Review/rendering: adoption invokes the existing SRS Card Render Contract and live Markdown semantic repair path without changing Review scheduling authority.
- Persistence migration: existing `riff-managed` records are adopted in place; legacy blacklist data becomes explicit import exclusion evidence.
- User settings/UI: continuous sync controls are removed and replaced by explicit import/adoption preview/apply actions.
