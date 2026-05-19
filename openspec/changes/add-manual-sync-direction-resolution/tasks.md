## 1. Backend and File Capabilities

- [x] 1.1 Add focused tests for read-only conflict DB summary extraction, including valid DB, unreadable DB, and parse failure results.
- [x] 1.2 Implement backend-owned conflict DB summary support that returns review event count, card count, latest review timestamp, latest card timestamp, and parse status without mutating current state.
- [x] 1.3 Add FileService tests for backing up the current `siyuanmemo.db` and replacing it with selected bytes.
- [x] 1.4 Implement FileService backup and replacement operations for the plugin SQLite DB, using timestamped backup names and preserving conflict source files.
- [x] 1.5 Add backend tests proving full DB replacement reloads or recreates worker SQLite state before subsequent DB-backed requests.
- [x] 1.6 Implement backend/application replacement support that writes selected DB bytes, reloads backend SQLite state, and refuses to continue on reload failure.

## 2. Application Direction Resolver

- [x] 2.1 Add tests for manual direction preview with no sources, readable sources, and unreadable sources.
- [x] 2.2 Implement a `SyncConflictDirectionResolutionService` that builds current/local summary plus conflict source summaries.
- [x] 2.3 Add tests for `smartMerge`, `keepCurrentLocal`, `replaceWithConflictCopy`, and `cancel` outcomes.
- [x] 2.4 Implement direction application logic that reuses `sync.conflict.merge` for smart merge and uses backup/replacement for full replacement.
- [x] 2.5 Expose preview and apply methods from `ApplicationContext` without letting UI parse or write SQLite directly.

## 3. UI Flow

- [x] 3.1 Inspect existing SiYuan native modal/menu patterns and current settings/maintenance UI density before adding the dialog.
- [x] 3.2 Add i18n strings for manual sync direction preview, actions, confirmation, success, and failure states.
- [x] 3.3 Replace the current direct manual merge command action with a dialog launcher from command palette and topbar context menu.
- [x] 3.4 Build a compact manual conflict resolution dialog that shows source summaries and actions: smart merge, keep current local, use selected conflict copy, cancel.
- [x] 3.5 Add explicit second confirmation for `use selected conflict copy`, including selected source id and backup warning.
- [x] 3.6 Report result summaries after each direction, including backup path for replacements and merge counts for smart merge.

## 4. Validation and Delivery

- [x] 4.1 Run focused vitest coverage for conflict preview, direction resolver, FileService backup/replacement, backend merge, and backend replacement reload.
- [x] 4.2 Run `pnpm run check:boundaries` and fix any DDD or hidden fallback violations.
- [x] 4.3 Run `pnpm build` and note any existing non-blocking build warnings separately from new failures.
- [x] 4.4 Update `docs/DDD_RESCAN_BACKLOG.md` with fixed and deferred debt for the manual direction flow.
- [x] 4.5 Deploy rebuilt `dist/` to `H:\闪卡同步测试\data\plugins\siyuan-plugin-siyuanmemo` for smoke testing.
- [ ] 4.6 Smoke test with existing conflict DB copies: preview sources, smart merge, keep current local no-op, and replacement into a disposable test workspace backup.
