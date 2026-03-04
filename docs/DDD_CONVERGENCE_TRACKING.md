# DDD 收敛跟踪（复扫与未完成项）

> 本文档用于持续跟踪“复扫结果与未完成收敛项”。
>
> 迁移来源：`ARCHITECTURE.md` 第 15 节
> 迁移日期：2026-02-25

---

## 当前快照（2026-02-25 / Round 14）

| 优先级 | 问题 | 典型位置 | 收敛方向 |
|------|------|---------|---------|
| P1 | `ui/browser` 的 `as any` 已清零，但仍有 `any` 类型残留（108 处） | `src/ui/browser/utils/validators.ts`、`SRSBrowser.vue`、`composables/useGridInteractions.ts`、`CardBrowserGrid.vue` | 继续按模块收敛到显式 Port/DTO/事件类型，优先高频文件 |
| P2 | core/infrastructure 仍保留较多 legacy 耦合 | `src/core/*`、`src/infrastructure/siyuan/*`、`src/scripts/*` | 继续按 bounded context 做端口化与依赖下沉 |

---

## 15. 复扫结果与未完成收敛项（2026-02-25）

### 15.1 本轮已完成的增量收敛

- `src/ui/browser/datasource/MenuActions.ts`
  - 动作分发相关的弱类型已收敛为显式类型（`QueueActionType`、`QueueItemPayload`、`RescheduleServiceLike` 等）。
  - 补齐 `resolveRescheduleService/resolveUnifiedStorage/resolveCardId` 等复用入口，减少分支内重复逻辑。
- `src/application/services/CardApplicationService.ts`
  - 提炼 `runBatchUpsertWithoutEvents()`，统一批量创建/更新的遍历与错误处理流程。
  - `batchCreateCardsWithoutEvents`、`batchUpdateCardsWithoutEvents` 入参从 `any[]` 收敛到 `unknown[]`，并统一归一化处理。
  - 持久化触发时机统一为“成功更新数 > 0”。

### 15.2 二次扫描统计（2026-02-25）

- `core/siyuan` 跨层直连：`133` 处 / `36` 文件
  - `src/application`：`114` 处 / `22` 文件（热点：`AutoCardHandler.ts` 63 处、`DialogManager.ts` 10 处）
  - `src/ui`：`18` 处 / `13` 文件（浏览器/复习/SRS 入口仍有直连）
- Browser DataSource 重复实现：
  - `applySort()`：`14` 处 / `7` 文件
  - `applyFilters()/applyPresetFilter()`：`10` 处 / `5` 文件
  - 删除动作（`deleteCard/deleteCards`）重复：`6` 处 / `5` 文件
- 类型与日志技术债：
  - `src/ui/browser/datasource/*` 中 `any`：`70` 处 / `8` 文件
  - `src/ui/browser + src/application` 中 `console.*`：`799` 处 / `56` 文件

### 15.3 仍未 DDD 化/可去重清单（按优先级）

| 优先级 | 问题 | 典型位置 | 收敛方向 |
|------|------|---------|---------|
| P0 | UI 直接调用 `core/siyuan`，违反 `ui -> application` 依赖方向 | `src/ui/browser/SRSBrowser.vue`、`src/ui/browser/browserService.ts`、`src/ui/review/v2/ReviewView.vue`、`src/ui/srs/SrsEditorDialog.vue` | 新增应用层 Facade（如 BrowserActionFacade/ReviewFacade），UI 仅调用用例或应用服务 |
| P0 | 应用层大量直连 `core/siyuan`，端口边界未收敛 | `src/application/handlers/AutoCardHandler.ts`、`src/application/managers/DialogManager.ts`、`src/application/managers/BlockMenuHandler.ts` | 先抽 `SiyuanApiPort/RiffApiPort`，由 `infrastructure` 实现，再逐文件替换 |
| P1 | 浏览器数据源排序逻辑重复（多处 `applySort`） | `DeckDataSource.ts`、`RetrievalDataSource.ts`、`FinalDrillDataSource.ts`、`IncrementalLearningDataSource.ts`、`FilterGroupDataSource.ts`、`BlockIdsDataSource.ts`、`QueryDataSource.ts` | 抽取共享 `sortBrowserCards()`（或 DataSource 基类） |
| P1 | 浏览器数据源过滤逻辑重复（`applyFilters/applyPresetFilter`） | `DeckDataSource.ts`、`RetrievalDataSource.ts`、`FinalDrillDataSource.ts`、`IncrementalLearningDataSource.ts`、`FilterGroupDataSource.ts` | 抽取 `filterBrowserCardsByPreset()`，将差异条件参数化 |
| P1 | 删除卡片动作在各数据源重复实现 | `DeckDataSource.ts`、`RetrievalDataSource.ts`、`FinalDrillDataSource.ts`、`FilterGroupDataSource.ts`、`IncrementalLearningDataSource.ts` | 下沉为统一应用层用例（批量删除 + 统一结果映射） |
| P2 | Browser DataSource `any` 污染较重，边界类型不稳定 | `DeckDataSource.ts`、`FinalDrillDataSource.ts`、`RetrievalDataSource.ts`、`FilterGroupDataSource.ts`、`IncrementalLearningDataSource.ts`、`QueryDataSource.ts`、`BlockIdsDataSource.ts` | 补 `BrowserActionContext`、`QueueLike`、`RawRowDTO` 显式类型，逐步移除 `as any` |
| P2 | `console.*` 过多，日志不可控且难观测 | `src/application/handlers/AutoCardHandler.ts`、`src/ui/browser/SRSBrowser.vue`、`src/ui/browser/datasource/DeckDataSource.ts` 等 | 统一迁移到 `utils/logger`，按模块注入 logger 名称 |
| P3 | `CardApplicationService` 仍保留 legacy 兼容写接口 | `src/application/services/CardApplicationService.ts` 的 `setCard/removeCard/saveCards` | 标注淘汰窗口并由调用点逐步迁移到用例层接口 |

### 15.4 下一批建议（低风险增量）

1. 先做 `src/ui/browser/datasource/*` 的排序/过滤/删除三类重复收敛（同一边界、回归面最小）。
2. 再做 `AutoCardHandler` 的 `SiyuanApiPort/RiffApiPort` 提取（高收益，但需分批替换避免大改）。
3. 最后做 `console.* -> logger` 的批量迁移，先处理高频文件（`AutoCardHandler.ts`、`SRSBrowser.vue`、`DeckDataSource.ts`）。

### 15.5 进度更新（2026-02-25，第二轮）

- 本轮已落地 `src/ui/browser/datasource/DataSourceUtils.ts`，统一承载：
  - `sortBrowserCards()`（排序）
  - `applyLegacyPresetFilter()/applyCardTypeFilter()/applySimpleQueryFilter()/applyDocFilter()`（通用筛选）
  - `deleteBrowserCards()`（删除执行，支持批量/逐个降级）
- 已完成迁移：
  - 排序统一：`Deck/Retrieval/FinalDrill/IncrementalLearning/FilterGroup/BlockIds/Query`
  - 筛选统一：`Deck/Retrieval/FinalDrill/IncrementalLearning/FilterGroup`
  - 删除统一：`Deck/Retrieval/FinalDrill/IncrementalLearning/FilterGroup`
- 二次复扫（本轮后）：
  - `applySort` 本地重复实现：`0` 处（此前 `14` 处 / `7` 文件）
  - DataSource 内部直接 `deleteCard/deleteCards` 调用：`0` 处（收敛为 helper）
  - `src/ui/browser/datasource/*` 中 `any`：`50` 处（此前 `70` 处）
- 当前剩余：
  - `applyFilters` 封装方法仍在 `Retrieval/FinalDrill/FilterGroup/IncrementalLearning` 4 个文件中（内部已改为调用共享 helper，后续可继续下沉为基类/组合器）。

### 15.6 进度更新（2026-02-25，第三轮）

- Browser DataSource 进一步去重：
  - `DataSourceUtils.ts` 新增 `applyQueueFilters()`，将 `doc/preset/query/cardType` 组合筛选收敛为单入口。
  - `Retrieval/FinalDrill/FilterGroup/IncrementalLearning` 的 `applyFilters()` 均降为一行委托调用。
- AutoCardHandler DDD 边界收敛（端口化）：
  - 新增端口：
    - `src/application/ports/AutoCardSiyuanPort.ts`
    - `src/application/ports/AutoCardRiffPort.ts`
  - 新增适配器：
    - `src/infrastructure/siyuan/AutoCardSiyuanAdapter.ts`
    - `src/infrastructure/siyuan/AutoCardRiffAdapter.ts`
  - `src/application/handlers/AutoCardHandler.ts` 构造注入 `siyuanApi/riffApi`（默认使用适配器），并将 SQL、块属性、提示消息、Riff 加卡、块标记等调用统一改为端口调用。
  - `AutoCardHandler` 中 `@/core/siyuan/*` 直连引用已降为 `0`。
- 二次复扫（本轮后）：
  - `src/application` 的 `core/siyuan` 直连：`114 -> 51`（主要下降来自 `AutoCardHandler`）。
  - `applySort` 本地重复实现：保持 `0`。
  - DataSource 删除统一入口：`deleteBrowserCards` 引用 `5` 处（5 个队列数据源）。

### 15.7 Progress Update (2026-02-25, Round 4)
- New DDD boundary for managers:
  - Added port: `src/application/ports/ManagerSiyuanPort.ts`
  - Added adapter: `src/infrastructure/siyuan/ManagerSiyuanAdapter.ts`
  - `src/application/managers/DialogManager.ts` now injects `siyuanApi` (default adapter) and routes message/SQL/block/riff calls through the port.
  - `src/application/managers/BlockMenuHandler.ts` now injects `siyuanApi` (default adapter) and routes `markBlockAsCard/getCardBlockIds/setBlockAttrs/addRiffCards/pushMsg/pushErrMsg/sql` through the port.
- Browser datasource dedup completed in this round:
  - Removed `private applyFilters()` wrappers in `Retrieval/FinalDrill/FilterGroup/IncrementalLearning`; `fetchRows()` now calls `applyQueueFilters()` directly.
- Rescan metrics after this round:
  - `src/application` direct `core/siyuan` refs: `51 -> 37` (`20` files; excluding tests: `34` refs / `18` files).
  - `DialogManager.ts + BlockMenuHandler.ts` direct `@/core/siyuan*` refs: `0`.
  - `src/ui/browser/datasource/*` `private applyFilters()` count: `0`.
  - `src/ui/browser/datasource/*` `any` count: `50`.

### 15.8 Remaining Non-DDD / Dedup Targets (Round 4 Snapshot)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Application layer still has `core/siyuan` direct refs (mostly UseCase/Service) | `src/application/managers/PracticeQueueManager.ts`, `src/application/services/XiuyuanSyncService.ts`, `src/application/usecases/xiuyuan/*`, `src/application/usecases/card/Delete*UseCase.ts`, `src/application/queries/browser/GetBrowserCardsQueryHandler.ts` | Continue boundary-first extraction by bounded context (QueuePort / XiuyuanSiyuanPort / CardDeletionRiffPort) with adapters in `infrastructure/siyuan` |
| P1 | Remaining manager-level non-portized points | `src/application/managers/PracticeQueueManager.ts`, `src/application/managers/TabManager.ts` | Reuse `ManagerSiyuanPort` or split lightweight `PracticeQueuePort/TabNotifyPort` to clear manager-level direct refs |
| P1 | Browser datasource typing still unstable (`any`) | `DeckDataSource.ts`, `QueryDataSource.ts`, `BlockIdsDataSource.ts` | Extract `BrowserActionContext` / `QueueLike` / `RowDTO` and replace `any` / `as any` incrementally |
| P2 | High `console.*` technical debt | `AutoCardHandler.ts`, `SRSBrowser.vue`, `DeckDataSource.ts` | Migrate to `utils/logger` with module-scoped logger names and minimal context fields |
| P2 | `ApplicationContext` still has dynamic `@/core/siyuan` imports | `src/application/ApplicationContext.ts` | Replace container-level dynamic imports with port/factory wiring to avoid infra leakage |

### 15.9 Progress Update (2026-02-25, Round 5)
- Manager boundary completion in this slice:
  - `src/application/managers/PracticeQueueManager.ts` now injects `ManagerSiyuanPort` and no longer imports `@/core/siyuan/*` directly.
  - `src/application/managers/TabManager.ts` now injects `ManagerSiyuanPort` and routes error notifications through port.
- Card deletion usecases boundary extraction:
  - Added port: `src/application/ports/CardDeletionSiyuanPort.ts`
  - Added adapter: `src/infrastructure/siyuan/CardDeletionSiyuanAdapter.ts`
  - `DeleteCardUseCase/DeleteCardsUseCase/DeleteFSRSCardUseCase` now call Siyuan attr/riff APIs via port.
- Extra card usecase boundary cleanup:
  - Added port: `src/application/ports/CardCreationSiyuanPort.ts`
  - Added adapter: `src/infrastructure/siyuan/CardCreationSiyuanAdapter.ts`
  - `CreateCardUseCase` now routes block text read via port.
- Dedup in card deletion slice:
  - Added shared cleaner: `src/application/usecases/card/shared/CardBlockAttrCleaner.ts`
  - Removed repeated attribute cleanup arrays in 3 delete usecases.
  - Removed unused method `deleteOrphanCard()` in `DeleteCardsUseCase`.
- Verification:
  - `pnpm build` passed.
- Rescan metrics after this round:
  - `src/application` direct `core/siyuan` refs: `37 -> 24` (`14` files; excluding tests: `21` refs / `12` files).
  - `src/application/managers + src/application/usecases/card` direct refs: `0` refs / `0` files (excluding tests).
  - `src/ui/browser/datasource/*` `any` count: `50`.
  - `src/application + src/ui` `console.*` count: `820` refs / `69` files.

### 15.10 Remaining Non-DDD / Dedup Targets (Latest, After Round 5)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Application layer still has direct `core/siyuan` refs concentrated in query/sync/xiuyuan usecases | `src/application/services/XiuyuanSyncService.ts`, `src/application/queries/browser/GetBrowserCardsQueryHandler.ts`, `src/application/queries/CardContentQueryService.ts`, `src/application/usecases/xiuyuan/*`, `src/application/ApplicationContext.ts` | Split by bounded context and extract dedicated ports (`XiuyuanSiyuanPort`, `BrowserQuerySiyuanPort`, `ContextInfraPort`) with infra adapters |
| P1 | Xiuyuan usecase slice still has direct Siyuan dependencies | `src/application/usecases/xiuyuan/*` and `src/application/usecases/xiuyuan/shared/*` | Extract `XiuyuanSiyuanPort` (SQL/block attrs/kramdown/riff deck) and migrate by usecase cluster |
| P1 | Browser datasource typing debt (`any`) remains high | `src/ui/browser/datasource/DeckDataSource.ts`, `QueryDataSource.ts`, `BlockIdsDataSource.ts` | Continue replacing `any` with `BrowserActionContext/QueueLike/DTO` explicit types |
| P2 | `console.*` technical debt remains high | `src/application/handlers/AutoCardHandler.ts`, `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/datasource/*` | Continue migrating to `utils/logger` by hot files first |
| P2 | Container-level dynamic infra import still exists | `src/application/ApplicationContext.ts` (`import('@/core/siyuan')`) | Move to wired port/factory injection to keep container infra-agnostic |

### 15.11 Progress Update (2026-02-25, Round 6)
- Xiuyuan usecase cluster boundary extraction:
  - Added port: `src/application/ports/XiuyuanSiyuanPort.ts`
  - Added adapter: `src/infrastructure/siyuan/XiuyuanSiyuanAdapter.ts`
  - Migrated `CreateConceptDescriptorAutoUseCase/CreateConceptDescriptorCardsUseCase/CreateListTemplateCardsUseCase/CreateXiuyuanFromBlocksUseCase/RebindDescriptorConceptUseCase` to port calls.
  - Migrated shared modules `ConceptCardResolver/ConceptLocator/FinalizeXiuyuanCreation` to port calls.
- Root-cause policy alignment in touched slice:
  - Removed degrade-style behavior in `CreateConceptDescriptorCardsUseCase`:
    concept-card ensure failure no longer logs-and-continues; it now fails explicitly.
- Verification:
  - `pnpm build` passed.
- Rescan metrics after this round:
  - `src/application` direct `core/siyuan` refs: `24 -> 11` (`14 -> 6` files; excluding tests: `21 -> 8` refs / `12 -> 4` files).
  - `src/application/usecases/xiuyuan + shared` direct refs (excluding tests): `0` refs / `0` files.
  - `src/ui/browser/datasource/*` `any` count: `50`.
  - `src/application + src/ui` `console.*` count: `820` refs / `69` files.

### 15.12 Remaining Non-DDD / Dedup Targets (Latest, After Round 6)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Remaining application direct `core/siyuan` refs are now concentrated in sync/query/container | `src/application/services/XiuyuanSyncService.ts`, `src/application/queries/browser/GetBrowserCardsQueryHandler.ts`, `src/application/queries/CardContentQueryService.ts`, `src/application/ApplicationContext.ts` | Complete bounded extraction for `XiuyuanSyncSiyuanPort`, `BrowserQuerySiyuanPort`, and container-level infra wiring |
| P1 | Query layer still bypasses port boundary | `GetBrowserCardsQueryHandler.ts`, `CardContentQueryService.ts` | Introduce query-side Siyuan read port (`sql/getBlock*`) and inject adapters |
| P1 | Browser datasource typing debt (`any`) remains high | `src/ui/browser/datasource/DeckDataSource.ts`, `QueryDataSource.ts`, `BlockIdsDataSource.ts` | Continue replacing `any` with `BrowserActionContext/QueueLike/DTO` explicit types |
| P2 | `console.*` technical debt remains high | `src/application/handlers/AutoCardHandler.ts`, `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/datasource/*` | Continue migrating to `utils/logger` by hot files first |
| P2 | Container-level dynamic infra import still exists | `src/application/ApplicationContext.ts` (`import('@/core/siyuan')`) | Replace with port/factory registration to keep container infra-agnostic |

### 15.13 Progress Update (2026-02-25, Round 7)
- Query + router boundary extraction completed in this round:
  - Added port: `src/application/ports/QuerySiyuanPort.ts`
  - Added adapter: `src/infrastructure/siyuan/QuerySiyuanAdapter.ts`
  - Migrated `GetBrowserCardsQueryHandler` SQL/attr-key access to injected `QuerySiyuanPort`.
  - Migrated `CardContentQueryService` from dynamic `import('@/core/siyuan/api')` to injected port calls.
  - Migrated `DataAccessFacade.syncToRiff()` to `QuerySiyuanPort.batchSetRiffCardsDueTime()`.
- Sync-service boundary extraction completed in this round:
  - Added port: `src/application/ports/XiuyuanSyncSiyuanPort.ts`
  - Added adapter: `src/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter.ts`
  - Migrated `XiuyuanSyncService` (`getRiffCards/getRiffNewCards/removeRiffCards/getBlockAttrs/setBlockAttrs/ATTR_CARD_TYPE`) to injected port calls.
  - Migrated `ApplicationContext` deckId wiring from dynamic `import('@/core/siyuan')` to `XiuyuanSyncSiyuanAdapter.BUILTIN_DECK_ID`.
- Root-cause / no-degrade cleanup in touched slice:
  - Removed `DataAccessFacade` dead fallback methods: `fillMissingContentFallback` / `fillMissingRootIdsFallback`.
  - `DataAccessFacade` now fails explicitly when `CardContentQueryService` is missing.
  - Removed delete blacklist fallback branch in `XiuyuanSyncService.deleteSyncSingle()`.
- Verification:
  - `pnpm build` passed.
- Rescan metrics after this round:
  - `src/application` direct `core/siyuan` refs (excluding tests): `8 -> 0` refs, `4 -> 0` files.
  - `src/application` direct `core/siyuan` refs (all): `11 -> 0` refs, `6 -> 0` files.
  - Whole `src` direct `core/siyuan` refs remain `87` refs / `49` files (now concentrated in `ui/*`, `core/*`, tests, and infrastructure adapters).

### 15.14 Remaining Non-DDD / Dedup Targets (Latest, After Round 7)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | UI layer still directly depends on `core/siyuan` | `src/ui/browser/SRSBrowser.vue`, `src/ui/browser/browserService.ts`, `src/ui/review/v2/ReviewView.vue`, `src/ui/srs/SrsEditorDialog.vue` | Move UI calls behind application facades/usecases (UI -> application only) |
| P1 | Browser datasource typing debt (`any`) remains high | `src/ui/browser/datasource/DeckDataSource.ts`, `QueryDataSource.ts`, `BlockIdsDataSource.ts` | Continue replacing `any/as any` with explicit `BrowserActionContext/QueueLike/DTO` types |
| P1 | High `console.*` debt in browser/application hot paths | `src/ui/browser/*`, `src/application/handlers/AutoCardHandler.ts` | Continue migration to `utils/logger` module-by-module |
| P2 | Core/domain services still bind directly to `core/siyuan/api` in some slices | `src/core/card/*`, `src/core/queue/filters/TopicFilter.ts`, `src/core/storage/*` | Introduce bounded ports for core-side infra touch points where behavior is still evolving together |
| P2 | Test/migration scripts still mock/call legacy `core/siyuan` paths directly | `src/__tests__/*`, `src/scripts/*` | Keep as-is short term, then align test harness with new ports when touching those suites |

---

*文档生成时间: 2026-02-25*
*基于实际源码分析（持续更新）*

### 15.15 Progress Update (2026-02-25, Round 8)
- UI boundary extraction completed in this round (`ui -> application`):
  - Added port: `src/application/ports/ReviewSiyuanPort.ts`
  - Added adapter: `src/infrastructure/siyuan/ReviewSiyuanAdapter.ts`
  - `ReviewApplicationService` now exposes `getSiyuanApi()` for UI-side orchestration.
- Migrated remaining UI `core/siyuan` direct calls to application port / framework API:
  - `src/ui/review/v2/ReviewView.vue`
  - `src/ui/review/v2/sessions/FinalDrillV2Session.ts`
  - `src/ui/review/v2/adapters/SubsetPracticeAdapter.ts`
  - `src/ui/review/v2/components/XiuyuanListTemplateCard.vue`
  - `src/ui/srs/SrsEditorDialog.vue`
  - `src/ui/srs/FlashcardMetaMenu.vue`
  - `src/ui/menu/TopBar.ts`
- Root-cause / no-degrade cleanup in touched slice:
  - `SrsEditorDialog` removed legacy reschedule fallback branches; scheduling is now single-path via `reviewService`.
  - `FinalDrillV2Session` removed `getAllItems()` fallback read path; now uses `getAllCards()` only.
  - `ReviewView` removed plugin-missing open-document degradation branch; now surfaces explicit error message.
- i18n alignment:
  - Added `pluginNotReady` and `reviewServiceUnavailable` in `src/i18n/en_US.json` and `src/i18n/zh_CN.json`.
- Verification:
  - `pnpm build` passed (including prebuild i18n check, 0 missing keys).
- Rescan metrics after this round:
  - `src/ui` direct `core/siyuan` refs (excluding tests): `0` refs / `0` files.
  - `src/application` direct `core/siyuan` refs (excluding tests): `0` refs / `0` files.
  - Whole `src` direct `core/siyuan` refs (excluding tests): `42` refs / `29` files, now concentrated in `core/*`, `infrastructure/*`, `scripts/*`, and migration utilities.

### 15.16 Remaining Non-DDD / Dedup Targets (Latest, After Round 8)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Browser queue action path still contains trait/direct dual-path fallback logic | `src/ui/browser/datasource/MenuActions.ts` | Pick one deterministic active path (recommended: queue capability adapter) and remove fallback branches (`remove/insert/setPriority/sort/addItems`) |
| P1 | ReviewView keyboard handling has duplicated logic | `src/ui/review/v2/ReviewView.vue` (`handleRootClick` vs `handleKeyDown`) | Extract shared hotkey handler function to remove duplicated behavior branches |
| P1 | Review adapter still default-instantiates infra adapter in UI layer | `src/ui/review/v2/adapters/SubsetPracticeAdapter.ts` | Move adapter construction to application factory and inject only port contract into UI adapter |
| P2 | Core/infrastructure still reference legacy `core/siyuan` paths heavily | `src/core/*`, `src/infrastructure/siyuan/*`, `src/scripts/*` | Continue bounded migration from legacy alias to dedicated infra modules/ports by context |
---

### 15.17 Progress Update (2026-02-25, Round 9)
- Browser datasource dedup and single-path cleanup in this round:
  - Added shared queue action executors in `src/ui/browser/datasource/DataSourceUtils.ts`:
    - `removeCardsFromQueue()`
    - `insertCardsIntoQueue()`
    - `setBrowserCardsPriority()`
    - `adjustBrowserCardsDue()`
  - Migrated queue action implementations to shared executors:
    - `src/ui/browser/datasource/BlockIdsDataSource.ts`
    - `src/ui/browser/datasource/RetrievalDataSource.ts`
    - `src/ui/browser/datasource/FinalDrillDataSource.ts`
    - `src/ui/browser/datasource/FilterGroupDataSource.ts`
    - `src/ui/browser/datasource/IncrementalLearningDataSource.ts`
- Root-cause / no-degrade cleanup in touched slice:
  - `MenuActions.ts` removed old trait/direct dual-path queue mutation code:
    - removed `cardsToQueueItems/removeFromQueue/insertAt/setPriority/autoSort`
    - removed deprecated `batchSetBlockPriority`
  - `MenuActions.addToQueue()` now uses deterministic capability path (`addCard` or `addItems`) and explicit unavailable failure handling.
- Review UI dedup in this round:
  - `src/ui/review/v2/ReviewView.vue`
    - extracted shared hotkey dispatcher `handleReviewKeyAction()`
    - removed duplicated logic between `handleRootClick` and `handleKeyDown`
- Review adapter boundary hardening in this round:
  - `src/ui/review/v2/adapters/SubsetPracticeAdapter.ts`
    - removed UI-side default infra instantiation
    - now uses injected `siyuanApi` or plugin-context `reviewService.getSiyuanApi()`
    - missing API now fails explicitly
- Verification:
  - `pnpm build` passed (including prebuild i18n check, 0 issues).
- Rescan metrics after this round:
  - `src/ui` direct `core/siyuan` refs: `0`
  - `src/application` direct `core/siyuan` refs: `1` (test-only, excluding tests: `0`)
  - queue datasource direct per-file remove loop pattern (`queue.removeCard(row.fsrsCardId || row.id)`): `0`
  - queue datasource hardcoded day parse pattern (`Math.floor(Number(context?.days || 1))`): `0`

### 15.18 Remaining Non-DDD / Dedup Targets (Latest, After Round 9)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Deck datasource still carries large custom action orchestration and heavy `console.*`/`any` debt | `src/ui/browser/datasource/DeckDataSource.ts` | Split into shared action executor + typed action context; migrate logs to `utils/logger` |
| P1 | One review session still default-instantiates infra adapter in UI/session layer | `src/ui/review/v2/sessions/FinalDrillV2Session.ts` | Inject `ReviewSiyuanPort` from application factory/context and remove local `new ReviewSiyuanAdapter()` |
| P1 | Queue add capability still keeps dual `addCard/addItems` compatibility branch | `src/ui/browser/datasource/MenuActions.ts` | Define explicit queue add contract per queue type and remove compatibility ambiguity |
| P2 | Application test slice still references legacy `core/siyuan` path | `src/application/usecases/card/__tests__/CreateCardUseCase.template-selection.test.ts` | Align test boundary with new application port mocks when touching test suite |
| P2 | Core/infrastructure legacy coupling remains | `src/core/*`, `src/infrastructure/siyuan/*`, `src/scripts/*` | Continue bounded migration by context to reduce legacy alias usage |
---

### 15.19 Progress Update (2026-02-25, Round 10)
- Completed target #1 (`DeckDataSource`) large cleanup:
  - Rebuilt action orchestration into explicit routes/handlers instead of long branch chain:
    - queue add routes consolidated via `QUEUE_ADD_ROUTES`
    - dedicated handlers: delete / queue-add / subset / set-priority
  - Moved from `console.*` debug path to module logger:
    - `createLogger('DeckDataSource')`
    - removed all `console.log/warn/error` in this file
  - Reduced local technical duplication by reusing shared datasource helpers:
    - `applyDocFilter()`
    - `setBrowserCardsPriority()`
  - Kept behavior deterministic:
    - queue add still through unified manager + `addToQueue()`
    - set priority updates manager first, then block attrs, then invalidates cache
- Completed target #2 (`FinalDrillV2Session`) adapter injection cleanup:
  - Removed session-layer default `new ReviewSiyuanAdapter()`.
  - Added injection path from plugin context:
    - `plugin.getContext().getReviewService().getSiyuanApi()`
  - Added explicit failure when missing:
    - throws `FinalDrillV2Session requires review siyuan api`.
- Verification:
  - `pnpm build` passed (including prebuild i18n check).
- Rescan metrics after this round:
  - `DeckDataSource` `console.*` refs: `0`
  - `DeckDataSource` `any/as any` refs: `9` (down to compatibility boundaries only)
  - `review/v2/sessions` default `new ReviewSiyuanAdapter` refs: `0`
  - `FinalDrillV2Session` explicit missing-api guard refs: `1`

### 15.20 Remaining Non-DDD / Dedup Targets (Latest, After Round 10)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Queue add capability still keeps dual `addCard/addItems` compatibility branch | `src/ui/browser/datasource/MenuActions.ts` | Define explicit queue add contract per queue type and remove compatibility ambiguity |
| P1 | Deck datasource still has residual `any/as any` compatibility casts | `src/ui/browser/datasource/DeckDataSource.ts` | Introduce strict action/context/manager adapter types and eliminate remaining casts |
| P1 | Browser datasource typing debt remains in non-deck files | `src/ui/browser/datasource/QueryDataSource.ts`, `BlockIdsDataSource.ts` | Continue replacing `any/as any` with explicit DTO/port contracts |
| P2 | Application test slice still references legacy `core/siyuan` path | `src/application/usecases/card/__tests__/CreateCardUseCase.template-selection.test.ts` | Align test boundary with new application port mocks when touching test suite |
| P2 | Core/infrastructure legacy coupling remains | `src/core/*`, `src/infrastructure/siyuan/*`, `src/scripts/*` | Continue bounded migration by context to reduce legacy alias usage |
---

### 15.21 Progress Update (2026-02-25, Round 11)
- Completed P0 queue add contract cleanup:
  - `src/ui/browser/datasource/MenuActions.ts`
    - removed `addItems` capability fallback from browser add-to-queue path
    - add-to-queue now deterministic `addCard` single-path with explicit unavailable failure
    - simplified queue add payload from legacy item DTO to minimal queue candidate (`cardId/blockId/cardType`)
- Completed browser datasource normalization wave (typing + observability + dedup):
  - `src/ui/browser/datasource/BlockIdsDataSource.ts`
    - removed `any/as any` queue casts and all `console.*` logs
    - added typed action context, reschedule action guard, logger
    - added direct `neuralQueue` resolution path for neural-roam context
  - `src/ui/browser/datasource/QueryDataSource.ts`
    - removed `row: any` mapping path
    - added typed SQL row adapter (`SqlRowLike`) and explicit field readers
  - `src/ui/browser/datasource/DeckDataSource.ts`
    - removed remaining operational casts for reset/suspend/delete/queue-add/set-priority flows
    - added typed batch manager adapter and typed i18n context guard
  - `src/ui/browser/datasource/FinalDrillDataSource.ts`
    - rewritten to typed fetch/action flow with logger
    - removed `console.*` + `as any` queue/plugin/manager casts
  - `src/ui/browser/datasource/FilterGroupDataSource.ts`
    - rewritten to typed fetch/action flow with logger
    - removed `console.*` + `as any` queue/plugin/manager casts
- Verification:
  - `pnpm build` passed after first refactor wave.
  - `pnpm build` passed again after `FinalDrillDataSource` + `FilterGroupDataSource` rewrite.
- Rescan metrics after this round:
  - `MenuActions.ts` `addItems(` refs: `0` (browser add-to-queue path no longer dual-capability)
  - `Deck/BlockIds/Query/FinalDrill/FilterGroup` `console.*` refs: `0`
  - `Deck/BlockIds/Query/FinalDrill/FilterGroup` `any/as any` refs: `7` total (interface-signature leftovers)
  - Remaining high-debt queue datasources:
    - `RetrievalDataSource.ts` `any/as any/console.*`: `15`
    - `IncrementalLearningDataSource.ts` `any/as any/console.*`: `23`

### 15.22 Remaining Non-DDD / Dedup Targets (Latest, After Round 11)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Retrieval/Incremental queue datasource still carry high `any/as any` + `console.*` debt and duplicated action orchestration | `src/ui/browser/datasource/RetrievalDataSource.ts`, `IncrementalLearningDataSource.ts` | Apply the same typed route-based refactor pattern used in Round 11 (`logger + typed context + shared DataSourceUtils executors`) |
| P1 | Datasource interface still forces weak action signatures (`context?: any`, result ambiguity) | `src/application/interfaces/ICardDataSource.ts` and datasource implementers | Introduce typed action context/result contracts by datasource category to eliminate `Promise<any>` leftovers |
| P1 | `DataSourceUtils` still contains transitional `any` in manager/context helpers | `src/ui/browser/datasource/DataSourceUtils.ts` | Split card manager/card service ports into stricter interfaces and remove `context?: any` in due-adjust utilities |
| P2 | Application test slice still references legacy `core/siyuan` path | `src/application/usecases/card/__tests__/CreateCardUseCase.template-selection.test.ts` | Align test boundary with new application port mocks when touching test suite |
| P2 | Core/infrastructure legacy coupling remains | `src/core/*`, `src/infrastructure/siyuan/*`, `src/scripts/*` | Continue bounded migration by context to reduce legacy alias usage |
---

### 15.23 Progress Update (2026-02-25, Round 12)
- Completed remaining P0 queue datasource cleanup:
  - `src/ui/browser/datasource/RetrievalDataSource.ts`
    - fully rewritten to typed route-based action handling
    - removed all `console.*`, `any`, and `as any` paths
    - unified delete/priority/due-adjust behavior through shared `DataSourceUtils`
  - `src/ui/browser/datasource/IncrementalLearningDataSource.ts`
    - fully rewritten to typed route-based action handling
    - removed all `console.*`, `any`, and `as any` paths
    - switched context menu action composition to shared `buildQueueActions()`
- Cross-datasource dedup in this round:
  - Added `src/ui/browser/datasource/QueueBrowserCardMapper.ts`
    - centralized `FSRSCard -> BrowserCard` mapping for queue datasources
    - removed duplicated conversion logic from:
      - `FinalDrillDataSource.ts`
      - `FilterGroupDataSource.ts`
      - `RetrievalDataSource.ts`
      - `IncrementalLearningDataSource.ts`
- Interface/type contract hardening completed in this round:
  - `src/application/interfaces/ICardDataSource.ts`
    - `FilterModel` index signature `any -> unknown`
    - `performAction` contract changed to `context?: unknown` + `Promise<unknown>`
  - `src/ui/browser/datasource/DataSourceUtils.ts`
    - removed transitional `any` from manager/update contracts
    - introduced typed `QueueDueAdjustContext`/`QueueDueConfigLike`
- Call-site cleanup:
  - `src/ui/browser/SRSBrowser.vue`
    - removed `performAction` invocation cast chain (`as any`)
    - switched to typed unknown-result normalization
- Verification:
  - `pnpm build` passed (prebuild i18n check + vite build).
- Rescan metrics after this round:
  - `src/ui/browser/datasource/*` `any/as any/console.*`: `0`
  - `RetrievalDataSource.ts` `any/as any/console.*`: `0` (from `15`)
  - `IncrementalLearningDataSource.ts` `any/as any/console.*`: `0` (from `23`)
  - `ICardDataSource.ts` `any/as any`: `0`
  - `DataSourceUtils.ts` `any/as any`: `0`
  - `src/application + src/ui` direct `core/siyuan` refs: `3` (all test-only)

### 15.24 Remaining Non-DDD / Dedup Targets (Latest, After Round 12)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P2 | Application test slice still references legacy `core/siyuan` path | `src/application/usecases/card/__tests__/CreateCardUseCase.template-selection.test.ts`, `CreateCardUseCase.test.ts` | Align tests to application port mocks and remove direct `core/siyuan` import/mocks |
| P2 | Core/infrastructure legacy coupling remains | `src/core/*`, `src/infrastructure/siyuan/*`, `src/scripts/*` | Continue bounded migration by context to reduce legacy alias usage |
---

### 15.25 Progress Update (2026-02-25, Round 13)
- Completed application test boundary cleanup:
  - `src/application/usecases/card/__tests__/CreateCardUseCase.test.ts`
    - removed `vi.mock('@/core/siyuan/block')`
    - switched to injected `CardCreationSiyuanPort` mock (`siyuanApi`)
  - `src/application/usecases/card/__tests__/CreateCardUseCase.template-selection.test.ts`
    - removed direct `@/core/siyuan/block` import/mock
    - switched all template-selection symbol checks to injected port mock
- Root-cause/no-degrade cleanup in touched usecase:
  - `src/application/usecases/card/CreateCardUseCase.ts`
    - removed template symbol-detection silent degrade (`catch -> return false`)
    - symbol detection failures now return explicit `Result` error via execute path
    - removed all `as any` branches in command-to-domain conversion flow
    - moved ad-hoc `console.error` to module logger (`createLogger('CreateCardUseCase')`)
- Core extension fallback removal in this round:
  - `src/core/extensions/QueueProvider.ts`
    - expanded provider contract with explicit optional capabilities (`onCustomAction`, `insertAt`)
    - default generic tightened from `any` to `unknown`
  - `src/core/extensions/ProviderBackedQueueStrategy.ts`
    - removed `insertAt` buffer fallback/degrade branch
    - `insertAt` now fails explicitly when provider does not implement capability
    - removed `any/as any` compatibility casts in provider interaction paths
- Test expectation drift fixed to match active behavior:
  - default priority assertion aligned to `50`
  - symbol template assertions aligned to unified `builtin-quick-card` path
- Verification:
  - `pnpm vitest run src/application/usecases/card/__tests__/CreateCardUseCase.test.ts src/application/usecases/card/__tests__/CreateCardUseCase.template-selection.test.ts` passed (`22/22`)
  - `pnpm build` passed (prebuild i18n check + vite build)
- Rescan metrics after this round:
  - `src/application + src/ui` direct `core/siyuan` refs: `0` (from `3`, all test-only refs removed)
  - `CreateCardUseCase.ts` `as any/console.*`: `0`
  - `ProviderBackedQueueStrategy.ts` `any/as any/fallback`: `0`
  - whole `src` direct `core/siyuan` refs: `68` (now concentrated in `core/*`, `infrastructure/*`, `scripts/*`, and non-application/non-ui test tooling)

### 15.26 Remaining Non-DDD / Dedup Targets (Latest, After Round 13)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P2 | Core/infrastructure legacy coupling remains | `src/core/*`, `src/infrastructure/siyuan/*`, `src/scripts/*` | Continue bounded migration by context to reduce legacy alias usage |
---

### 15.27 Progress Update (2026-02-25, Round 14)
- Completed the previously highlighted debt slice (`AutoCardHandler` + `xiuyuan usecases` + `ui/browser as any`):
  - `src/application/handlers/AutoCardHandler.ts`
    - no `as any` / `console.*` / degrade branches in active flow
    - fallback wording now only appears as `getErrorMessage(..., fallback)` parameter name (not behavior branch)
  - `src/application/usecases/xiuyuan/*` and `src/application/services/XiuyuanApplicationService.ts`
    - `Result<any>` and `as any` removed from target slice
    - return types converged to typed `Result<XiuyuanCreationPayload>`
  - `src/ui/browser/*`
    - `as any` cleared to `0`
    - completed typed cleanup across:
      - `SRSBrowser.vue`
      - `browserService.ts`
      - `BrowserHierarchy.vue`
      - `BrowserPreview.vue`
      - `BrowserToolbar.vue`
      - `SRSBrowserQueueView.ts`
      - `useQueueBridge.ts`
      - `useSorting.ts`
      - `useGridInteractions.ts`
      - `useCardActions.ts`
      - `dialogs/AdvanceDialog.vue` / `PostponeDialog.vue` / `SpreadDialog.vue`
      - `components/DateRangeFilter.vue` / `MultiSelectFilter.vue` / `NumericRangeFilter.vue`
- Bounded dedup introduced in this round:
  - Added `src/ui/browser/utils/i18n.ts` for shared flashcard i18n resolution.
  - Added `src/ui/browser/utils/protyleControl.ts` to unify readonly toggle of Protyle in preview-related modules.
  - `src/core/scheduler/ConfigManager.ts` now exposes `listConfigNames()`; dialogs no longer call private method through cast.
- Verification:
  - `pnpm build` passed.
- Rescan metrics after this round:
  - `src/ui/browser` `as any`: `0`
  - target xiuyuan slice `Result<any>|as any`: `0`
  - `AutoCardHandler.ts` `as any|console.*|降级|回退|degrad`: `0`
  - `src/ui/browser` `\bany\b`: `108` (residual typed debt, not cast debt)

### 15.28 Remaining Non-DDD / Dedup Targets (Latest, After Round 14)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P1 | `ui/browser` still has residual `any` typing (cast debt已清零) | `src/ui/browser/utils/validators.ts`, `SRSBrowser.vue`, `composables/useGridInteractions.ts`, `CardBrowserGrid.vue`, `composables/useSorting.ts` | Continue replacing `any` with explicit DTO/port/callback contracts; prioritize top-count files first |
| P2 | Core/infrastructure legacy coupling remains | `src/core/*`, `src/infrastructure/siyuan/*`, `src/scripts/*` | Continue bounded migration by context to reduce legacy alias usage |
---

### 15.29 Progress Update (2026-02-25, Round 15)
- Completed targeted browser typing convergence and local dedup in this round:
  - `src/ui/browser/browserService.ts`
    - `runBrowserSql()` upgraded to generic typed rows (`unknown -> typed row DTO`), removed `Promise<any[]>`.
    - typed SQL result mapping in `getDocTree()` and `fetchBlockInfoBatched()`.
  - `src/ui/browser/utils/*`
    - `validators.ts`: all public validators switched `any -> unknown` with object guards.
    - `helpers.ts`: removed `any` from sort/extract utilities and added safe block-id extraction guard.
    - `dataSourceFactory.ts`: removed `any` signatures, added typed plugin conversion helpers, and reused `extractBlockIds()` to reduce duplication.
  - `src/ui/browser` component/composable slice:
    - `SRSBrowser.vue`, `CardBrowserGrid.vue`, `useSorting.ts`, `useGridInteractions.ts`, `useCardActions.ts`, `SyncStatusIndicator.vue`, `FilterDialog.vue`, `SRSBrowserAdapter.ts`, `columnDefs.ts` cleaned from `any`.
    - removed touched fallback/degrade branches in active browser open/load path (`SRSBrowser` + `useGridInteractions`).
- Verification:
  - `pnpm build` passed.
- Rescan metrics after this round:
  - `src/ui/browser` `\bany\b|as any`: `0`
  - target xiuyuan slice `Result<any>|as any`: `0`
  - `AutoCardHandler.ts` `as any|console.*|降级|回退|degrad`: `0`
  - `src/ui/browser` `回退|降级|degrad`: `0`
  - whole `src` (excluding tests) `\bany\b|as any`: `794` (debt now concentrated outside browser slice)
  - whole `src` (excluding tests) direct `core/siyuan` refs: `42`
  - whole `src` (excluding tests) `console.*`: `845`

### 15.30 Remaining Non-DDD / Dedup Targets (Latest, After Round 15)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Global type debt is now concentrated in application/core (browser slice cleared) | `src/application/ApplicationContext.ts`, `src/application/managers/DialogManager.ts`, `src/application/managers/BlockMenuHandler.ts`, `src/core/storage/manager.ts` | Continue bounded refactor by context (`unknown` + typed ports/contracts), prioritize top-count files |
| P1 | Legacy `core/siyuan` coupling remains outside application/ui active path | mainly `src/core/*`, `src/infrastructure/siyuan/*`, `src/scripts/*` | Continue migration by bounded context to dedicated ports/adapters |
| P1 | High `console.*` volume remains in non-browser slices | `src/application/*`, `src/core/*`, `src/ui/review/v2/*` | Continue migration to `utils/logger` in hot paths first |
| P2 | Filter dialog/service contract still relies on compatibility casts | `src/ui/browser/dialogs/FilterDialog.vue` <-> `src/ui/browser/services/FilterService.ts` | Introduce unified typed filter state contract and remove compatibility casts |

*Document updated: 2026-02-25 (Round 15)*

---

### 15.31 Progress Update (2026-02-25, Round 16)
- Review v2 debt cleanup completed in this round:
  - `src/ui/review/v2/ReviewContent.vue`
    - removed remaining `as any` casts and weak callback typing
    - removed silent renderer degrade path; now surfaces explicit render error state
    - fixed visible mojibake text in empty/answer/failure fallbacks
    - added i18n key `cardRenderFailed`
  - `src/ui/review/v2/*` `as any`: `0`
- Xiuyuan infrastructure convergence completed in this round:
  - `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`
    - removed all `as any` / `any` in active repository path
    - extracted typed list-template parsing (`extractListTemplateChildren`) to reduce repeated unsafe checks
    - typed `cardToFSRSCard` return and DTO restore path (`CardPersistenceDTO`)
  - `src/core/storage/UnifiedStorageManager.ts`
    - added `upsertXiuYuan()` as explicit storage boundary API, replacing repository direct map mutation casts
- Root-cause/no-degrade alignment in touched slice:
  - Review special-renderer errors no longer downgrade to normal render implicitly; errors are explicit and observable.
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues)
- Rescan metrics after this round:
  - `src/ui/review/v2` `as any`: `0`
  - `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` `as any|Result<any>`: `0`
  - previously highlighted debt slice remains clean:
    - `src/application/usecases/xiuyuan/*` `Result<any>`: `0`
    - `src/ui/browser/*` `as any`: `0`
    - `src/application/handlers/AutoCardHandler.ts` `as any`: `0`
  - whole `src` (excluding tests) `\bany\b|as any`: `487`
  - whole `src` (excluding tests) `core/siyuan` refs: `41`
  - whole `src` (excluding tests) `console.*`: `731`

### 15.32 Remaining Non-DDD / Dedup Targets (Latest, After Round 16)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Remaining type debt concentrated in core/application hot files | `src/core/storage/manager.ts`, `src/core/extensions/providers/FSRSRetrievalProvider.ts`, `src/application/managers/TabManager.ts` | Continue bounded large refactor with typed DTO/port contracts, remove `any/as any` in top-count files first |
| P1 | Legacy `core/siyuan` coupling still present outside fully converged slices | mostly `src/core/*`, `src/infrastructure/siyuan/*` | Continue by bounded context: isolate read/write ports then migrate call sites |
| P1 | High `console.*` debt still large | cross `src/core/*` and `src/application/*` | Migrate to `utils/logger` module-by-module in top-frequency files |
| P2 | Browser/review slices are now mostly cast-clean, but architecture docs still lag ongoing convergence details | `ARCHITECTURE.md` | Keep architecture summary lightweight and push round-by-round details only to this tracking doc |

*Document updated: 2026-02-25 (Round 16)*

---

### 15.33 Progress Update (2026-02-25, Round 17)
- Completed high-density debt cleanup in active queue/storage/application slices:
  - `src/application/managers/TabManager.ts`
    - removed all `any/as any`
    - removed obsolete dual restore branch (`savedQueue/savedAdapter` compatibility path)
    - converged to single restore path: tab data -> `QueueType` -> `UnifiedQueueStrategy + UnifiedReviewAdapter`
    - removed `plugin.app as any` document-tab opening cast
  - `src/core/extensions/providers/FSRSRetrievalProvider.ts`
    - removed all `any/as any`
    - introduced explicit typed queue item / riff payload / SQL row parsing
    - extracted normalization helpers (`normalizeNextDues`, `normalizeDueCard`, typed row guards) to reduce repeated unsafe parsing
  - `src/core/storage/manager.ts`
    - removed all `any/as any`
    - introduced typed queue payload contracts (`StoredQueueItem`, `QueuePayload`, typed attribute rows)
    - deduplicated queue item normalization and id/block extraction helpers
    - upgraded JSON/msgpack read/write API to generic typed signatures (`loadData<T>`, `loadMsgpackData<T>`, etc.)
  - `src/core/queue/sequencers/SortedSequencer.ts`
    - removed all `any/as any` (debug logging paths now use canonical `QueueItem` fields)
- Root-cause/no-degrade alignment in this round:
  - `TabManager` no longer keeps inactive legacy restore branches that cannot be reconstructed from current tab payload.
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues, vite build passed).
- Rescan metrics after this round:
  - whole `src` (excluding tests) `\bany\b|as any`: `404` (from `487`, net `-83`)
  - touched high-debt files now clean:
    - `TabManager.ts`: `0`
    - `FSRSRetrievalProvider.ts`: `0`
    - `core/storage/manager.ts`: `0`
    - `SortedSequencer.ts`: `0`
  - `src/application/usecases/xiuyuan/*` `Result<any>`: `0` (still clean)

### 15.34 Remaining Non-DDD / Dedup Targets (Latest, After Round 17)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Remaining `any/as any` now concentrates in diagnostics/infra/native/tooling slices | `src/diagnostics/type-guards.ts`, `src/errors/DataSourceErrors.ts`, `src/infrastructure/siyuan/api.ts`, `src/core/native/session.ts`, `src/core/siyuan/riff*.ts` | Continue bounded typing pass by context; prioritize runtime-critical infra (`infrastructure/siyuan/api.ts`, `core/siyuan/riff*.ts`) before diagnostics |
| P1 | Legacy `core/siyuan` coupling still present outside converged active paths | mostly `src/core/*`, `src/infrastructure/siyuan/*` | Continue port-first extraction and migrate callers context-by-context |
| P1 | `console.*` debt still high in non-browser slices | cross `src/core/*` and `src/application/*` | Continue logger migration in hot files with highest count |
| P2 | Architecture summary doc still partially mojibake-corrupted and may hide latest convergence details | `ARCHITECTURE.md` | keep appending readable snapshots now; plan a dedicated encoding-safe doc restoration pass |

*Document updated: 2026-02-25 (Round 17)*

---

### 15.35 Progress Update (2026-02-25, Round 18)
- Completed runtime-critical debt cleanup in this round:
  - `src/diagnostics/type-guards.ts`
    - removed all `any/as any`
    - removed multi-branch degrade chain in `normalizeToFSRSCard`; now deterministic single-path conversion (`FSRSCard` or `QueueItem`) with explicit error
  - `src/core/siyuan/riff.ts`
    - removed all `any/as any` in review payload methods
    - extracted shared `withReviewedCards()` to deduplicate `reviewedCards` payload assembly
  - `src/core/siyuan/riff/normalizers.ts`
    - removed all `any/as any`
    - introduced typed `RiffQueueItem` and shared unknown-guard normalizers
  - `src/core/queue/abstraction/QueueCardRef.ts`
    - removed all `any` in ID normalization functions (`unknown + guards`)
  - `src/core/extensions/providers/FSRSRetrievalProvider.ts`
    - removed duplicated local `normalizeNextDues/normalizeDueCard`
    - re-used `riff/normalizers` to converge one normalization path
  - `src/core/native/session.ts`
    - removed all `any/as any` (window runtime/card meta/protyle resize paths)
    - added typed runtime window access helpers
  - `src/core/queue/domain/BaseReviewQueue.ts`
    - removed `normalizeToFSRSCard(rawCards as any[])` cast
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues, vite build passed)
- Rescan metrics after this round:
  - whole `src` `\bany\b|as any`: `618` (from `667`, net `-49`)
  - whole `src` excluding `__tests__` `\bany\b|as any`: `353` (from `404`, net `-51`)
  - previously highlighted debt slice status:
    - `src/application/handlers/AutoCardHandler.ts` `any/as any`: `0`
    - `src/application/usecases/xiuyuan/*` `Result<any>|any|as any`: `0`
    - `src/ui/browser/*` `any/as any`: `0`
    - `src/infrastructure/siyuan/api.ts`, `src/errors/DataSourceErrors.ts`, `src/core/native/session.ts`, `src/core/siyuan/riff*.ts`, `src/diagnostics/type-guards.ts` `any/as any`: `0`
  - encoding quick-check (`AutoCardHandler.ts` mojibake markers): `0`

### 15.36 Remaining Non-DDD / Dedup Targets (Latest, After Round 18)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Remaining non-test `any/as any` now concentrates in utility/debug and a few core/application files | `src/debug/fsrs-debug.ts`, `src/utils/debounce.ts`, `src/core/queue/neural/logger.ts`, `src/core/box/TransactionObserver.ts`, `src/core/card/domain/services/CardFilterService.ts`, `src/application/queries/DataAccessFacade.ts` | Continue bounded typed cleanup by hot path; prioritize runtime code before debug-only files |
| P1 | Test-type debt still visible (outside `__tests__` naming convention) | `*.test.ts` under `src/application/managers/*` etc. | Optional follow-up: normalize test helpers to `unknown` and remove `any` casts where cheap |
| P1 | Legacy `core/siyuan` coupling still present outside converged slices | mostly `src/core/*`, `src/infrastructure/siyuan/*` | Continue port-first extraction and migrate callers context-by-context |
| P1 | `console.*` debt remains in non-browser slices | cross `src/core/*` and `src/application/*` | Continue logger migration in top-frequency files |

*Document updated: 2026-02-25 (Round 18)*

---

### 15.37 Progress Update (2026-02-25, Round 19)
- Completed accelerated multi-file cleanup in this round:
  - `src/utils/debounce.ts`
    - full generic rewrite (`unknown`-based function signatures)
    - removed all `any/as any`
  - `src/core/queue/neural/logger.ts`
    - `Record<string, any>` -> `Record<string, unknown>`
    - typed persisted log parsing path
  - `src/core/card/domain/services/CardFilterService.ts`
    - removed all `meta as any` reads
    - introduced typed meta helpers (`isRecord`, `readMetaString`) and deduplicated repeated meta access
  - `src/application/queries/DataAccessFacade.ts`
    - removed all `plugin/settings/context` `any`
    - replaced with explicit boundary interfaces (`DataAccessContextLike`, `DataAccessPlugin`, `SettingsServiceLike`)
    - switched constructor/applicationContext debug logs to module logger
  - `src/core/box/TransactionObserver.ts`
    - removed all `any` in event/context/timer/sql-row paths
    - typed event/detail + Xiuyuan service contract boundary
  - `src/utils/dialog.ts`
    - removed all `any/as any` in props/events and hotkey-forwarding path
    - switched diagnostics logs from `console.*` to module logger
  - `src/index.ts`
    - removed constructor `options: any`
    - removed config migration `as any` casts; normalized migrated config via typed `RiffIntegrationConfig`
  - `src/ui/settings/SettingsPanel.vue`
    - removed all `any/as any` from emits/props/handlers
    - typed quick-card settings as `QuickCardSettings`
    - removed `emit('repair-dates' as any)` cast
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues, vite build passed)
- Rescan metrics after this round:
  - whole `src` `\bany\b|as any`: `568` (from `618`, net `-50`)
  - whole `src` excluding `__tests__`: `303` (from `353`, net `-50`)
  - core non-test/non-spec/non-dts slice: `277` (from `327`, net `-50`)
  - this-round touched files `any/as any`: `0`

### 15.38 Remaining Non-DDD / Dedup Targets (Latest, After Round 19)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Remaining core `any/as any` has shifted to utility/domain/infrastructure tails | `src/debug/fsrs-debug.ts`, `src/domain/entities/Card.ts`, `src/application/observers/CacheManagerObserver.ts`, `src/core/queue/logging/LoggableQueue.ts`, `src/infrastructure/services/FileService.ts` | Continue high-frequency cleanup in runtime paths first (`domain`, `application`, `core` before debug tooling) |
| P1 | Legacy `core/siyuan` coupling remains outside converged slices | mostly `src/core/*`, `src/infrastructure/siyuan/*` | Continue port-first extraction and migrate callers context-by-context |
| P1 | `console.*` debt still present in non-browser slices | cross `src/application/*`, `src/core/*`, `src/infrastructure/*` | Continue logger migration module-by-module in highest-frequency files |

*Document updated: 2026-02-25 (Round 19)*

---

### 15.39 Progress Update (2026-02-25, Round 20)
- Completed accelerated typed cleanup in this round:
  - `src/application/observers/CacheManagerObserver.ts`
    - removed all `any/as any`
    - replaced queue `lastOperation` unsafe cast with explicit runtime guard + extraction helper
    - removed `LRUCache` private-field piercing (`['cache']`, `.maxSize`) by using typed cache API
  - `src/core/queue/logging/LoggableQueue.ts`
    - removed all runtime `any` from wrapped queue boundary
    - introduced explicit wrapped-queue port contract and unified item-id resolver (`blockId/blockID`)
  - `src/infrastructure/services/FileService.ts`
    - `writeJSON/writeMsgpack` migrated to `unknown`
    - file-not-found detection migrated from `any` probing to typed error-shape guard
  - `src/infrastructure/persistence/mappers/CardMapper.ts`
    - removed all `any/as any`
    - deepClone and meta parsing converted to `unknown + guards`
    - Xiuyuan field extraction deduplicated into typed helper functions
  - `src/domain/entities/Card.ts`
    - removed all `any` in scheduler/reschedule fields by binding to `FSRSCard` types
  - `src/utils/performance-helpers.ts`
    - removed all `any/as any` in debounce/throttle/batcher and exposed typed `LRUCache` APIs (`capacity`, `keys`)
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues, vite build passed).
- Rescan metrics after this round:
  - whole `src` `\bany\b|as any`: `547` (from `568`, net `-21`)
  - whole `src` excluding `__tests__`: `282` (from `303`, net `-21`)
  - core non-test/non-spec/non-dts (current query baseline): `256` (from `277`, net `-21`)
  - this-round touched files `any/as any`: `0`

### 15.40 Remaining Non-DDD / Dedup Targets (Latest, After Round 20)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Remaining `any/as any` now concentrates in debug + several runtime utility/application tails | `src/debug/fsrs-debug.ts`, `src/utils/errorReporter.ts`, `src/core/card/concept-definition/application/ConceptDefinitionCardRenderService.ts`, `src/ui/review/components/ConceptDefinitionCardRenderer.vue` | Continue high-frequency typed cleanup; prioritize runtime utility/application before debug-only code |
| P1 | Infra/application websocket and sync slices still carry typed-boundary debt | `src/core/infrastructure/websocket/*`, `src/application/services/XiuyuanSyncService.ts`, `src/application/services/RiffBlacklistService.ts`, `src/infrastructure/services/QueuePersistenceService.ts` | Extract typed ports/contracts and remove remaining casted payload paths |
| P1 | Cross-layer legacy coupling still exists outside converged active paths | mostly `src/core/*`, `src/infrastructure/*` | Keep bounded large refactors: port-first extraction + delete obsolete dual-path logic |
| P1 | `src/types/index.d.ts` remains a separate technical hotspot | `src/types/index.d.ts` | Handle in dedicated typings round (do not mix with runtime refactor rounds) |

*Document updated: 2026-02-25 (Round 20)*

---

### 15.41 Progress Update (2026-02-25, Round 21)
- Completed accelerated P0 convergence in this round:
  - `src/debug/fsrs-debug.ts`
    - full typed rewrite, removed all `any/as any`
    - added explicit debug API contract and response shape guards
  - `src/utils/errorReporter.ts`
    - context contract migrated from `Record<string, any>` to `Record<string, unknown>`
    - introduced context-operation reader to keep behavior deterministic and type-safe
  - `src/core/card/concept-definition/application/ConceptDefinitionCardRenderService.ts`
    - removed all `any/as any` in render/query/runtime access paths
    - introduced typed card input contract and Xiuyuan query result guards
  - `src/ui/review/components/ConceptDefinitionCardRenderer.vue`
    - removed all `any/as any`
    - deleted duplicated plugin/lute fallback wiring and reused service single-path runtime logic
  - `src/core/card/concept-definition/application/runtime.ts` (new)
    - extracted shared runtime boundary helpers: `resolveSiyuanApp`, `resolveSiyuanMemoPlugin`, `resolveLuteRenderer`
    - deduplicated cross-layer window runtime access
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues, vite build passed).
- Rescan metrics after this round:
  - whole `src` `\bany\b|as any`: `524` (from `547`, net `-23`)
  - whole `src` excluding `__tests__`: `259` (from `282`, net `-23`)
  - core non-test/non-spec/non-dts baseline: `233` (from `256`, net `-23`)
  - this-round 4 target files `any/as any`: `0`

### 15.42 Remaining Non-DDD / Dedup Targets (Latest, After Round 21)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Remaining runtime `any/as any` now concentrates in websocket/sync/application slices | `src/core/infrastructure/websocket/QuickCardWebSocketService.ts`, `src/core/infrastructure/websocket/TransactionWebSocketService.ts`, `src/application/services/XiuyuanSyncService.ts`, `src/application/services/RiffBlacklistService.ts` | Continue contract-first extraction for runtime payload boundaries |
| P1 | Queue/browser application tails still have cast debt | `src/infrastructure/services/QueuePersistenceService.ts`, `src/application/managers/PracticeQueueManager.ts`, `src/application/queries/browser/GetBrowserCardsQueryHandler.ts`, `src/ui/components/SyncStatusIndicator.vue`, `src/ui/srs/FlashcardMetaMenu.vue` | Do bounded cleanup in next batch with shared DTO/guard helpers |
| P1 | Shared declaration debt remains isolated | `src/types/index.d.ts` | handle in dedicated declarations round, keep runtime rounds focused |

*Document updated: 2026-02-25 (Round 21)*

---

### 15.43 Progress Update (2026-02-26, Round 22)
- Completed accelerated cleanup on the previously flagged P0 hotspot slice:
  - `src/core/infrastructure/websocket/QuickCardWebSocketService.ts`
    - full rewrite with typed transaction parsing
    - removed runtime fallback URL branch and `window as any` access
  - `src/core/infrastructure/websocket/TransactionWebSocketService.ts`
    - migrated to shared typed parser/runtime boundary
    - removed `WSMessage.data?: any`, `DoOperation.data: any`, and `window as any` usage
  - `src/application/services/XiuyuanSyncService.ts`
    - removed all `any/as any` in event bridge + schedule conversion path
    - introduced typed bridge event (`DomainEvent`) and exact subscribe/unsubscribe mapping (no more unsubscribe mismatch)
    - replaced `(riffCard?.state || 0) as any` with explicit `CardState` conversion
  - `src/application/services/RiffBlacklistService.ts`
    - converged to typed storage port (no optional-chain silent no-op path)
  - `src/core/storage/UnifiedStorageManager.ts`
    - added first-class Riff blacklist contract (`add/remove/get/clear`)
    - persisted blacklist in unified store payload (`riffBlacklist`)
  - `src/core/storage/UnifiedStoragePersistence.ts`
    - empty store now initializes `riffBlacklist`
  - `src/application/ApplicationContext.ts`
    - `RiffBlacklistService` now wired to `UnifiedStorageManager` as single active path
  - new shared websocket convergence files:
    - `src/core/infrastructure/websocket/transaction-types.ts`
    - `src/core/infrastructure/websocket/runtime.ts`
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues, vite build passed).
- Rescan metrics after this round:
  - whole `src` excluding tests `\bany\b|as any`: `223` (from `239`, net `-16` in this round)
  - this-round hotspot files (`websocket + sync + blacklist`) `any/as any`: `0`

### 15.44 Remaining Non-DDD / Dedup Targets (Latest, After Round 22)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Remaining runtime `any/as any` has moved to queue persistence + browser/support tails | `src/infrastructure/services/QueuePersistenceService.ts`, `src/application/managers/PracticeQueueManager.ts`, `src/application/queries/browser/GetBrowserCardsQueryHandler.ts`, `src/ui/components/SyncStatusIndicator.vue`, `src/ui/srs/FlashcardMetaMenu.vue` | continue bounded port/DTO typing pass and remove casted boundary payloads |
| P1 | Shared event base still carries generic `any` payload internals | `src/core/shared/domain/events/DomainEvent.ts`, `src/core/shared/domain/events/EventBus.ts` | perform dedicated event-kernel typing round (`unknown` payload serialization path) |
| P1 | Declaration debt remains isolated | `src/types/index.d.ts` | keep in a dedicated declaration-only round |
| P1 | Fallback/degrade semantic debt still exists in selected non-hot slices | see `DDD_RESCAN_BACKLOG.md` | prune compatibility-only fallback branches with root-cause fixes by bounded context |

Detailed re-scan snapshot and unfinished convergence list have been moved to:
- [DDD_RESCAN_BACKLOG.md](./DDD_RESCAN_BACKLOG.md)

*Document updated: 2026-02-26 (Round 22)*

---

### 15.45 Progress Update (2026-02-26, Round 23)
- Completed next accelerated hotspot batch:
  - `src/infrastructure/services/QueuePersistenceService.ts`
    - removed all `any/as any`
    - cache + read/write payload contracts converged to `unknown`
  - `src/application/managers/PracticeQueueManager.ts`
    - removed all `any/as any`
    - introduced typed retrieval queue port boundary
  - `src/application/queries/browser/GetBrowserCardsQueryHandler.ts`
    - removed all `any/as any`
    - deduplicated meta read/write logic into typed helpers (`ensureMetaObject`, `readMetaString`)
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues, vite build passed).
- Rescan metrics after this round:
  - whole `src` excluding tests `\bany\b|as any`: `211` (from `223`, net `-12`)
  - code-only non-test (`ts/vue`, excluding d.ts/tests/spec): `183` (from `195`, net `-12`)
  - this-round 3 target files `any/as any`: `0`

### 15.46 Remaining Non-DDD / Dedup Targets (Latest, After Round 23)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Remaining highest `any/as any` now concentrates in event kernel + UI tails | `src/core/shared/domain/events/DomainEvent.ts`, `src/ui/components/SyncStatusIndicator.vue`, `src/ui/srs/FlashcardMetaMenu.vue` | converge event payload contracts to `unknown` + typed serializer guards, then clear UI cast edges |
| P1 | Adapter contract tails still cast-heavy | `src/application/interfaces/ISchedulerRouter.ts`, `src/application/ports/ReviewSiyuanPort.ts`, `src/core/queue/types.ts` | do one bounded adapter-contract pass with shared type utilities |
| P1 | Infra/siyuan support tails still have residual casts | `src/infrastructure/siyuan/ManagerSiyuanAdapter.ts`, `src/infrastructure/siyuan/ReviewSiyuanAdapter.ts` | align adapters to typed port DTOs and remove bridge casts |
| P1 | Fallback/degrade semantic debt still exists in selected contexts | see `DDD_RESCAN_BACKLOG.md` section 5 | remove compatibility-only fallback branches with root-cause fixes |

Detailed re-scan and backlog are maintained in:
- [DDD_RESCAN_BACKLOG.md](./DDD_RESCAN_BACKLOG.md)

*Document updated: 2026-02-26 (Round 23)*

---

### 15.47 Progress Update (2026-02-26, Round 30)

- Completed accelerated debt-cleanup batch in this round:
  - Removed remaining non-test `strict-any` tails across active runtime paths (`src/application`, `src/core`, `src/ui`, `src/infrastructure`, `src/utils`, `src/types`, `src/scripts` touched set).
  - Converged port/adapter boundaries from `Promise<any[]>` to `Promise<unknown[]>`.
  - Removed legacy generic defaults and weak contracts (`EventEmitter`, queue strategy/schedulers, helper payloads).
  - Cleared last runtime `any/as any` occurrences in non-test `ts/vue` code.
- Root-cause/no-degrade alignment in this round:
  - `src/core/native/adapter.ts`: removed `getAllItems()` fallback path; native adapter now requires `getAllCards()` single path.
  - `src/ui/review/v2/ReviewView.vue`: removed menu-position degrade fallback branch (`currentTarget` null now explicit error).
  - `src/core/queue/filters/TopicFilter.ts`: removed silent degrade return paths; SQL/query failures now throw explicitly.
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues, vite build passed).
- Rescan metrics after this round:
  - code-only non-test (`*.ts/*.vue`, excluding tests and `*.d.ts`) `:\s*any|<any>|as any`: `0`
  - code-only non-test `\bany\b|as any`: `7` matches, all comment/string-literal text (no runtime type debt)

### 15.48 Remaining Non-DDD / Dedup Targets (Latest, After Round 30)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Runtime `console.*` debt remains high | cross `src/application/*`, `src/core/*`, `src/ui/*` | Continue logger migration module-by-module in hot paths first |
| P1 | Compatibility semantics still present in selected service slices | `src/application/services/XiuyuanSyncService.ts`, `src/application/managers/DialogManager.ts` | Remove compatibility-only branches while preserving single deterministic path |
| P1 | Architecture doc contains legacy mojibake sections | `ARCHITECTURE.md` | Do dedicated UTF-8 restoration pass; keep round snapshots append-only until restoration |

Detailed re-scan and backlog are maintained in:
- [DDD_RESCAN_BACKLOG.md](./DDD_RESCAN_BACKLOG.md)

*Document updated: 2026-02-26 (Round 30)*

---

### 15.49 Progress Update (2026-02-26, Round 31)

- Completed root-cause sync convergence in this round:
  - `src/core/siyuan/riff.ts`
    - `getRiffNewCards()` no longer silently drops cards when `created` timestamp is invalid; unknown timestamp cards are now included in incremental set.
  - `src/application/services/XiuyuanSyncService.ts`
    - removed long-term "time filter disabled" branch and restored incremental fetch with `since=lastSyncTime`.
    - incremental cursor now updates to sync `startTime` (not `Date.now()` at end), preventing sync-window misses.
    - removed swallow-and-continue branch in `detectCardTypesForNewCards()` for `getBlockAttrs` failure.
- Completed accelerated logger migration in high-frequency runtime files:
  - `src/ui/browser/SRSBrowser.vue`
  - `src/application/managers/BlockMenuHandler.ts`
  - `src/application/queries/DataAccessFacade.ts`
  - `src/ui/browser/dialogs/FilterDialog.vue`
  - `src/ui/browser/browserService.ts`
  - `src/ui/browser/services/FilterService.ts`
  - `src/ui/browser/composables/useGridInteractions.ts`
  - `src/ui/browser/composables/useSorting.ts`
  - `src/ui/browser/composables/useCardTypeDetection.ts`
  - `src/application/factories/createUnifiedReviewDialog.ts`
  - `src/application/managers/ReviewSyncManager.ts` (rewritten with clean UTF-8 comments + logger path)
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues, vite build passed).
- Rescan metrics after this round:
  - code-only non-test (`*.ts/*.vue`, excluding tests and `*.d.ts`) `:\s*any|<any>|as any`: `0`
  - code-only non-test (`*.ts/*.vue`, excluding tests and `*.d.ts`) `\bany\b|as any`: `7` (comment/string-literal only)
  - runtime console scan (non-test ts/vue, excluding comment lines): `239`

### 15.50 Remaining Non-DDD / Dedup Targets (Latest, After Round 31)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Runtime `console.*` debt still exists in medium/high-frequency slices | `src/application/usecases/card/DeleteCardsUseCase.ts`, `src/infrastructure/services/FileService.ts`, `src/infrastructure/events/RiffSyncEventHandler.ts`, `src/application/services/SettingsService.ts` | Continue module-by-module logger migration with runtime-first order |
| P1 | Compatibility semantics still present in selected manager/service contexts | `src/application/managers/DialogManager.ts`, residual tails in `src/application/services/XiuyuanSyncService.ts` | Continue single-path convergence and remove compatibility-only branches on touch |
| P1 | Architecture summary doc contains legacy mojibake sections | `ARCHITECTURE.md` | Perform dedicated UTF-8 restoration pass and normalize old sections |

Detailed re-scan and backlog are maintained in:
- [DDD_RESCAN_BACKLOG.md](./DDD_RESCAN_BACKLOG.md)

*Document updated: 2026-02-26 (Round 31)*

---

### 15.51 Progress Update (2026-02-26, Round 32)

- Completed runtime logger-debt closure in diagnostics active path:
  - added shared diagnostics output port:
    - `src/diagnostics/utils/output.ts`
  - migrated diagnostics modules to unified stdout/stderr/json output without direct `console.*`:
    - `src/diagnostics/cli.ts`
    - `src/diagnostics/scanners/ArchitectureScanner.ts`
    - `src/diagnostics/analyzers/MigrationAnalyzer.ts`
    - `src/diagnostics/reporters/ReportGenerator.ts`
    - `src/diagnostics/validators/InterfaceValidator.ts`
    - `src/diagnostics/validators/ApiCompatibilityChecker.ts`
- Completed residual strict-typing tail in non-test code:
  - `src/shims-vue.d.ts` moved from `any` shim to typed `DefineComponent` declaration.
  - `ApiCompatibilityChecker` default param-type text changed from `'any'` to `'unknown'`.
- Aligned fallback-message helper semantics in active usecase/handler slice:
  - `AutoCardHandler` removed optional fallback parameter from `getErrorMessage(...)`.
  - `CreateCardUseCase`, `CreateXiuyuanFromBlocksUseCase`, `CreateListTemplateCardsUseCase`,
    `StorageOperationResult` switched `fallback*` naming to explicit `defaultMessage`.
  - `ConceptLocator` debug message updated to deterministic wording (no fallback phrasing).
- Validation:
  - `pnpm build` passed (prebuild i18n check: 0 issues, vite build passed).
- Rescan metrics after this round:
  - code-only non-test strict query (`:\s*any|<any>|as any`): `0`
  - code-only non-test broad query (`\bany\b|as any`): `7` (comment/string-literal only)
  - runtime `console.*` scan (non-test ts/vue, excluding comment lines): `0`

### 15.52 Remaining Non-DDD / Dedup Targets (Latest, After Round 32)
| Priority | Issue | Typical Locations | Suggested Action |
|------|------|---------|---------|
| P0 | Fallback/degrade branches still exist in active browser/review runtime | `src/ui/browser/composables/useIncrementalGridUpdates.ts`, `src/ui/review/ReviewViewAdapter.ts`, `src/core/native/session.ts` | Remove degrade paths by fixing payload/anchor contracts and keep single deterministic path |
| P0 | Compatibility wiring tails still visible in composition root | `src/application/ApplicationContext.ts` | continue compatibility-pruning once active callers are validated on unified path |
| P1 | Legacy fallback-message helper style still present in selected handlers/usecases | `src/application/handlers/AutoCardHandler.ts`, selected `application/usecases/*` helpers | normalize to explicit default-message contracts and keep errors observable |
| P1 | Architecture summary document still contains mojibake historical blocks | `ARCHITECTURE.md` | run dedicated UTF-8 restoration and historical section normalization pass |

Detailed re-scan and backlog are maintained in:
- [DDD_RESCAN_BACKLOG.md](./DDD_RESCAN_BACKLOG.md)

*Document updated: 2026-02-26 (Round 32)*
