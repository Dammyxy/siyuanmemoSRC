## 1. Characterize Read-Only Import Contracts

- [x] 1.1 Add public Module tests proving explicit import preview is read-only and classifies importable, already-owned, tombstoned, legacy-excluded, and semantic-conflict candidates.
- [x] 1.2 Add public Module tests proving face completion creates only missing semantic faces and never overwrites existing `local-owned` scheduling or review state.
- [x] 1.3 Add public Module tests proving new cards consume at most one valid Native Riff schedule seed and existing cards never consume it.
- [x] 1.4 Add public Module tests proving adoption preserves card/Xiuyuan identity, scheduling, review history, tags, and priority.
- [x] 1.5 Add public Module tests proving adoption rebuilds symbol/render semantics from live Markdown and fails closed when source evidence is unavailable.

## 2. Build Explicit Import And Adoption Modules

- [x] 2.1 Add a read-only `NativeRiffImportSourcePort` and SiYuan Adapter with no add, remove, or rating capability.
- [x] 2.2 Implement `NativeRiffImportModule` preview classifications, receipt identity matching, tombstone/exclusion checks, and face-level completion planning.
- [x] 2.3 Implement `NativeRiffImportModule` selected apply with new-card schedule seeding and immutable import receipts.
- [x] 2.4 Implement `NativeRiffAdoptionModule` preview and in-place `riff-managed` to `local-owned` planning.
- [x] 2.5 Implement adoption apply through existing live-Markdown semantic/render repair contracts without recreating cards.
- [x] 2.6 Ensure ordinary import reports existing-needs-repair without mutating existing `local-owned` cards.

## 3. Persist Receipts And Legacy Exclusions

- [x] 3.1 Add explicit Native Riff import receipt metadata and update ownership inference so receipt or `riffCardId` alone never implies `riff-managed`.
- [x] 3.2 Add durable `native-riff-import-exclusion` storage/read/remove behavior using the existing tombstone ledger.
- [x] 3.3 Migrate legacy `riffBlacklist` entries into durable import exclusions and clear legacy blacklist only after durable success.
- [x] 3.4 Add restore-and-import behavior that removes only selected tombstone/exclusion evidence.
- [x] 3.5 Add persistence migration and idempotency tests for receipts and legacy exclusions.

## 4. Add Explicit User Entry And Remove Passive Runtime

- [x] 4.1 Add Browser/manager entrypoints for explicit Native Riff import preview/apply and explicit old-card adoption preview/apply.
- [x] 4.2 Replace the current broad repair/sync affordance with separate import, adoption, and semantic-repair outcomes.
- [x] 4.3 Remove startup Xiuyuan Native Riff sync submission, full-sync timers, Browser-open incremental sync, and ReviewSyncManager Native Riff sync calls.
- [ ] 4.4 Remove Native Riff transaction upsert/remove routing from transaction fanout and kernel action pump.
- [ ] 4.5 Remove continuous-sync settings and replace settings/UI state with explicit import/adoption actions.

## 5. Remove Native Riff Writes And Continuous-Sync Implementation

- [ ] 5.1 Remove Native Riff add-card dependencies from AutoCard, Progressive, Topic-derived, and ordinary card creation paths.
- [ ] 5.2 Remove Native Riff remove-card/delete-sync event routing and hard-delete compatibility behavior.
- [ ] 5.3 Remove Native Riff rating/feedback bridge behavior from SiYuanMemo Review paths.
- [ ] 5.4 Remove `XiuyuanSyncService`, sync helper runtimes, blacklist Module, duplicate sync types, and obsolete application tests.
- [ ] 5.5 Remove `xiuyuan.sync.execute` client/RPC catalogs, worker planner/runtime, SQLite checkpoint behavior, and obsolete worker tests.
- [ ] 5.6 Remove retired Riff checkpoint/blacklist settings and persistence fields after migration compatibility reads are no longer needed.

## 6. Documentation And Validation

- [ ] 6.1 Update `ARCHITECTURE.md` and `docs/DDD_RESCAN_BACKLOG.md` for read-only explicit import ownership and retired sync paths.
- [ ] 6.2 Run focused import/adoption/persistence/ApplicationContext/worker tests in RED-GREEN slices.
- [ ] 6.3 Run `node scripts/check-hidden-fallbacks.cjs` and `pnpm run check:boundaries`.
- [ ] 6.4 Run `openspec validate retire-native-riff-continuous-sync --strict`, `git diff --check`, and `pnpm build`.
- [ ] 6.5 Re-read the active call chain and confirm no startup, transaction, timer, add, remove, rating, checkpoint, or blacklist runtime remains.
