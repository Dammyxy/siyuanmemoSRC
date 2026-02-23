# SiyuanMemo 插件架构报告

> **用途**: 供 AI 助手快速理解当前架构，准确定位需要修改的文件，避免破坏已有设计。
>
> **插件源码**: `H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\`
>
> **最后更新**: 2026-02-23

---

## 目录

1. [整体架构概览](#1-整体架构概览)
2. [目录结构地图](#2-目录结构地图)
3. [各层职责与关键文件](#3-各层职责与关键文件)
4. [核心子系统详解](#4-核心子系统详解)
5. [数据流：从用户操作到持久化](#5-数据流从用户操作到持久化)
6. [关键接口与类型定义](#6-关键接口与类型定义)
7. [需求→代码定位速查表](#7-需求代码定位速查表)
8. [已知技术债务](#8-已知技术债务)
9. [修改前必读规则](#9-修改前必读规则)

---

## 1. 整体架构概览

本插件采用**混合架构**：顶层遵循 DDD 四层架构，内部核心模块（`src/core/`）已内化了自己的 DDD 分层。项目整体处于**从旧服务架构向 DDD 渐进迁移**的过程中。

```
┌─────────────────────────────────────────────────────────────────┐
│  src/ui/          ← 表现层（Vue 组件、复习界面、浏览器）          │
│  src/index.ts     ← 插件入口，生命周期，只做路由不做逻辑          │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓ 调用
┌─────────────────────────────────────────────────────────────────┐
│  src/application/ ← 应用层（用例、Manager、ApplicationContext）  │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓ 调用
┌─────────────────────────────────────────────────────────────────┐
│  src/core/        ← 核心业务层（队列、调度器、Xiuyuan 领域）     │
│  src/domain/      ← 顶层领域（正在迁移中，当前文件较少）         │
└───────────────────────────┬─────────────────────────────────────┘
                            ↓ 实现接口
┌─────────────────────────────────────────────────────────────────┐
│  src/infrastructure/ ← 基础设施（持久化、文件服务）              │
│  src/core/siyuan/    ← 思源 API 封装（历史遗留位置）             │
└─────────────────────────────────────────────────────────────────┘
```

**三大设计原则**：
- **"一核多策略"**：所有复习模式（标准复习、神经漫游、最终冲刺等）共用同一个 `QueueContext`，通过切换 `IQueueStrategy` 实现差异化行为。
- **"服务优先"**：核心功能以无 UI 的 Service/UseCase API 形式暴露，UI 是这些 API 的可视化外壳。
- **"完全抽象"**：UI 层通过 `IAdapter` 接口与具体卡片类型解耦，适配器负责将领域对象转换为 UI 状态。

---

## 2. 目录结构地图

```
src/
├── index.ts                        # 插件入口（< 200 行，只做生命周期和路由）
├── commands.ts                     # 插件快捷键命令注册
│
├── application/                    # 应用层 ─────────────────────────────────
│   ├── ApplicationContext.ts       # ★ 全局 DI 容器，所有服务的工厂和访问点
│   ├── managers/                   # UI 无关的管理者（生命周期协调）
│   │   ├── BlockMenuHandler.ts     # 块右键菜单逻辑
│   │   ├── DialogManager.ts        # 对话框生命周期管理
│   │   ├── DockManager.ts          # 侧边栏面板管理
│   │   ├── MenuManager.ts          # 顶栏菜单管理
│   │   ├── TabManager.ts           # 标签页管理
│   │   └── PracticeQueueManager.ts # 练习队列协调
│   ├── services/                   # 应用服务（跨用例协调）
│   │   ├── CardApplicationService.ts       # 卡片 CRUD 门面
│   │   ├── ReviewApplicationService.ts     # 复习流程协调
│   │   ├── BrowserApplicationService.ts    # 卡片浏览器数据服务
│   │   ├── XiuyuanApplicationService.ts    # 修远卡组应用服务
│   │   ├── XiuyuanSyncService.ts           # 修远↔Riff 双向同步
│   │   ├── UnifiedDataSourceManager.ts     # 统一数据源管理
│   │   ├── SettingsService.ts              # 设置读写服务
│   │   ├── ReviewLogService.ts             # 复习日志
│   │   └── RiffBlacklistService.ts         # Riff 黑名单
│   ├── usecases/                   # 用例（每个业务动作一个文件）
│   │   ├── card/
│   │   │   ├── CreateCardUseCase.ts
│   │   │   ├── DeleteCardUseCase.ts
│   │   │   ├── UpdateCardUseCase.ts
│   │   │   └── DeleteFSRSCardUseCase.ts
│   │   └── xiuyuan/
│   │       ├── CreateXiuyuanFromBlocksUseCase.ts
│   │       ├── CreateConceptDescriptorCardsUseCase.ts
│   │       ├── CreateListTemplateCardsUseCase.ts
│   │       └── DeleteXiuyuanUseCase.ts
│   ├── queries/                    # 查询（只读操作）
│   │   ├── DataAccessFacade.ts     # ★ AdvancedDataRouter，统一查询入口
│   │   ├── CardContentQueryService.ts
│   │   └── card/GetDueCardsQuery*.ts
│   ├── commands/                   # 命令对象（写操作）
│   ├── handlers/
│   │   ├── AutoCardHandler.ts      # 自动创卡监听
│   │   └── RiffSyncHandler.ts      # Riff 同步事件处理
│   ├── adapters/
│   │   ├── UnifiedQueueStrategy.ts # 将 QueueProvider 适配为 IQueueStrategy
│   │   └── UnifiedReviewAdapter.ts
│   ├── observers/
│   │   └── CacheManagerObserver.ts # 缓存刷新观察者
│   ├── controllers/
│   │   └── ReviewViewController.ts
│   └── interfaces/
│       ├── IPluginFacade.ts        # 插件对外门面接口
│       ├── IDialogManager.ts
│       ├── ICardDataSource.ts
│       └── ISchedulerRouter.ts
│
├── core/                           # 核心业务层（旧架构主体）──────────────────
│   ├── queue/                      # ★★ 队列系统（最核心）
│   │   ├── QueueContext.ts         # ★ 策略容器（一核多策略）
│   │   ├── abstraction/
│   │   │   ├── Strategy.ts         # IQueueStrategy 接口定义
│   │   │   └── types.ts            # QueueItem, QueueFeedback 等核心类型
│   │   ├── strategies/             # ★ 队列策略实现（业务逻辑主体）
│   │   │   ├── RetrievalPracticeQueue.ts   # 标准 FSRS 复习
│   │   │   ├── FinalDrillQueue.ts          # 最终冲刺（错题重练）
│   │   │   ├── IncrementalLearningQueue.ts # 增量阅读
│   │   │   ├── LeechQueue.ts               # 困难卡片专项
│   │   │   ├── FilterGroupQueue.ts         # 筛选组复习
│   │   │   └── SubsetPracticeStrategy.ts   # 子集练习
│   │   ├── sequencers/             # 排序器（决定卡片顺序）
│   │   │   ├── FSRSSequencer.ts    # ★ 按 FSRS 优先级排序
│   │   │   ├── PrioritySequencer.ts
│   │   │   ├── DualQueueSequencer.ts # 新旧卡片交替
│   │   │   ├── FinalDrillSequencer.ts
│   │   │   └── ListSequencer.ts
│   │   ├── schedulers/             # 调度器（决定何时复习）
│   │   │   ├── RiffScheduler.ts    # 调用 Riff API 提交复习结果
│   │   │   ├── LeechScheduler.ts
│   │   │   └── NullScheduler.ts    # 无调度（增量阅读用）
│   │   ├── datasource/             # 数据源（卡片从哪来）
│   │   │   ├── IDataSource.ts      # 数据源接口
│   │   │   ├── RiffDataSource.ts   # ★ 从思源 Riff API 获取
│   │   │   ├── ObservableDataSource.ts # 可观察数据源（缓存自动失效）
│   │   │   ├── LocalStorageDataSource.ts
│   │   │   ├── HybridDataSource.ts # Riff + 本地混合
│   │   │   ├── DualQueueDataSource.ts
│   │   │   └── DataSourceFactory.ts
│   │   ├── neural/                 # 神经漫游队列
│   │   │   ├── NeuralQueue.ts
│   │   │   ├── ConceptNeuralQueue.ts
│   │   │   └── WeightedWalkEngine.ts # 加权随机游走
│   │   ├── composite/
│   │   │   └── BaseCompositeQueue.ts
│   │   ├── commands/               # 队列命令（CQRS 风格）
│   │   │   ├── InsertAtCommand.ts
│   │   │   ├── SetPriorityCommand.ts
│   │   │   └── RemoveCommand.ts
│   │   ├── filters/
│   │   │   └── TopicFilter.ts
│   │   └── factories/
│   │       └── QueueFactory.ts
│   │
│   ├── scheduler/                  # ★ 调度器系统
│   │   ├── SchedulerRouter.ts      # ★ 路由器：根据卡片类型选择调度策略
│   │   ├── strategies/
│   │   │   ├── TSFSRSScheduler.ts  # FSRS v6 算法（ts-fsrs 库）
│   │   │   ├── SM15Scheduler.ts    # SuperMemo 15 算法
│   │   │   └── ImprovedTopicScheduler.ts
│   │   ├── rescheduleService.ts    # 批量重排调度
│   │   ├── AdvanceEngine.ts        # 提前复习引擎
│   │   ├── PostponeEngine.ts       # 推迟复习引擎
│   │   ├── SpreadEngine.ts         # 分散复习引擎
│   │   └── BatchProcessor.ts
│   │
│   ├── xiuyuan/                    # ★ 修远领域（自定义卡组系统）
│   │   ├── domain/
│   │   │   ├── Xiuyuan.ts          # 修远聚合根（卡组）
│   │   │   ├── Card.ts             # 修远卡片实体
│   │   │   ├── CardId.ts / BlockId.ts / XiuyuanId.ts  # 值对象
│   │   │   ├── Priority.ts         # 优先级值对象
│   │   │   ├── ScheduleInfo.ts     # 调度信息值对象
│   │   │   ├── services/
│   │   │   │   ├── CardCreationService.ts
│   │   │   │   ├── CardDeletionService.ts
│   │   │   │   └── CardTypeDetectionService.ts
│   │   │   ├── events/
│   │   │   │   ├── CardCreatedEvent.ts
│   │   │   │   └── CardReviewedEvent.ts
│   │   │   └── repositories/
│   │   │       └── IXiuyuanRepository.ts   # 仓储接口
│   │   ├── infrastructure/
│   │   │   └── XiuyuanRepository.ts        # 仓储实现（读写 block 属性）
│   │   ├── templates/
│   │   │   ├── TemplateRegistry.ts
│   │   │   ├── builtin.ts
│   │   │   ├── builtin-concept.ts  # 概念卡模板
│   │   │   └── builtin-quick.ts    # 快速卡模板
│   │   └── cardMeta.ts
│   │
│   ├── card/                       # 卡片渲染与类型系统
│   │   ├── domain/services/
│   │   │   ├── CardFilterService.ts
│   │   │   ├── CardScheduleService.ts
│   │   │   └── CardSortService.ts
│   │   ├── quick-card/             # 快速卡子系统（自包含 DDD）
│   │   │   ├── domain/QuickCard.ts
│   │   │   ├── domain/strategies/  # Basic/Cloze/Concept/Descriptor...
│   │   │   ├── infrastructure/QuickCardRepository.ts
│   │   │   └── application/QuickCardRenderService.ts
│   │   ├── concept/                # 概念卡渲染服务
│   │   ├── descriptor-card/        # 描述符卡渲染服务
│   │   └── common/ui/              # 共用 UI（加载态、错误态、面包屑）
│   │
│   ├── card-type/
│   │   ├── CardTypeMarkerService.ts # 给 block 打类型标记
│   │   └── type-mapping.ts         # 类型枚举与映射
│   │
│   ├── card-builder/               # 卡片构建策略
│   │   ├── detectCardType.ts
│   │   ├── strategies/             # QA/Cloze/Default
│   │   └── extractCardMeta.ts
│   │
│   ├── siyuan/                     # 思源 API 封装（基础设施，历史遗留位置）
│   │   ├── api.ts                  # 通用 API（pushMsg, fetchPost 等）
│   │   ├── riff.ts                 # ★ Riff 卡片 API（创建/删除/复习/查询）
│   │   ├── block.ts                # 块操作 API
│   │   └── cardBlockSql.ts         # 卡片相关 SQL 查询
│   │
│   ├── storage/
│   │   ├── UnifiedStorageManager.ts  # ★ 统一存储（settings.json）
│   │   ├── manager.ts              # 旧存储（legacy）
│   │   └── StorageManagerAdapter.ts  # 新旧兼容适配器
│   │
│   ├── extensions/                 # 扩展层（Provider 模式）
│   │   ├── QueueProvider.ts        # ★ QueueProvider 接口
│   │   ├── ProviderBackedQueueStrategy.ts  # Provider → IQueueStrategy 桥接
│   │   └── providers/FSRSRetrievalProvider.ts
│   │
│   ├── infrastructure/websocket/
│   │   ├── TransactionWebSocketService.ts  # 监听思源事务（块变更）
│   │   └── QuickCardWebSocketService.ts
│   │
│   ├── neural/SeedService.ts
│   ├── shared/domain/events/EventBus.ts  # 内部领域事件总线
│   └── box/TransactionObserver.ts
│
├── domain/                         # 顶层领域层（DDD 迁移目标，文件较少）
│   ├── entities/Card.ts
│   ├── repositories/ICardRepository.ts
│   └── queues/RetrievalPracticeQueue.ts
│
├── infrastructure/                 # 顶层基础设施层
│   ├── persistence/
│   │   ├── CardRepository.ts
│   │   ├── mappers/CardMapper.ts   # 领域↔持久化模型映射
│   │   └── dto/CardPersistenceDTO.ts
│   ├── services/
│   │   ├── FileService.ts          # 文件读写（思源文件 API）
│   │   └── QueuePersistenceService.ts
│   └── events/RiffSyncEventHandler.ts
│
├── ui/                             # 表现层（Vue 组件）─────────────────────────
│   ├── review/v2/                  # ★★ 复习界面 2.0（当前主界面）
│   │   ├── ReviewView.vue          # 复习主视图（根组件）
│   │   ├── ReviewHeader.vue        # 进度、统计
│   │   ├── ReviewContent.vue       # 卡片内容区
│   │   ├── ReviewActions.vue       # 评分按钮区
│   │   ├── useReviewSession.ts     # ★ 复习会话 composable（核心逻辑）
│   │   ├── adapters/SubsetPracticeAdapter.ts
│   │   ├── dialogs/
│   │   │   ├── ScheduleDateDialog.vue
│   │   │   └── InsertPositionDialog.vue
│   │   └── overlays/NeuralRoamTopArea.vue
│   │
│   ├── review/components/          # 卡片类型渲染器
│   │   ├── QuickCardRenderer.vue
│   │   ├── ConceptCardRenderer.vue
│   │   ├── DescriptorCardRenderer.vue
│   │   ├── ConceptDefinitionCardRenderer.vue
│   │   └── MultiClozeCardRenderer.vue
│   │
│   ├── browser/                    # ★ 卡片浏览器（AG-Grid）
│   │   ├── SRSBrowser.vue
│   │   ├── composables/
│   │   │   ├── useCardData.ts
│   │   │   ├── useCardFilter.ts
│   │   │   ├── useCardActions.ts
│   │   │   └── useContextMenu.ts
│   │   ├── dialogs/
│   │   │   ├── RescheduleDialog.vue
│   │   │   ├── PostponeDialog.vue
│   │   │   ├── AdvanceDialog.vue
│   │   │   ├── PriorityDialog.vue
│   │   │   ├── FilterDialog.vue
│   │   │   └── SpreadDialog.vue
│   │   ├── datasource/
│   │   │   ├── RetrievalDataSource.ts
│   │   │   ├── DeckDataSource.ts
│   │   │   ├── FinalDrillDataSource.ts
│   │   │   └── IncrementalLearningDataSource.ts
│   │   └── config/columnDefs.ts    # AG-Grid 列定义
│   │
│   ├── settings/SettingsPanel.vue
│   ├── srs/SrsEditorDialog.vue
│   ├── xiuyuan/TemplateSelectDialog.vue
│   ├── menu/TopBar.ts
│   └── components/SiyuanTheme/     # 思源风格基础组件
│       ├── SyButton.vue
│       ├── SyInput.vue
│       ├── SySelect.vue
│       └── ...
│
├── types/                          # 全局类型定义
│   ├── card.ts
│   ├── settings.ts
│   ├── review.ts
│   ├── scheduler.ts
│   ├── unified-data-source.ts      # ★ QueueType 枚举（队列类型）
│   ├── result.ts                   # Result<T> 函数式错误处理
│   └── branded.ts                  # 品牌类型（类型安全 ID）
│
├── utils/
│   ├── logger.ts                   # ★ 统一日志（必须用它，禁止直接 console）
│   ├── errorReporter.ts
│   ├── dateUtils.ts
│   ├── batchQuery.ts               # 批量查询优化
│   ├── queryCache.ts
│   └── debounce.ts
│
└── i18n/en_US.json, zh_CN.json     # 国际化资源
```

---

## 3. 各层职责与关键文件

### 3.1 插件入口 `src/index.ts`

**职责**：插件生命周期（onload/onunload）、命令注册、事件路由。目标 **< 200 行**，不含任何业务逻辑。

```typescript
export default class FSRSPlugin extends Plugin implements IPluginFacade {
  private context!: ApplicationContext;

  async onload() {
    this.context = await ApplicationContext.create({ plugin: this, i18n: this.i18n });
    // 注册命令、事件监听
  }
  getContext(): ApplicationContext { return this.context; }
}
```

### 3.2 应用层 `src/application/`

| 文件 | 职责 |
|------|------|
| `ApplicationContext.ts` | **全局 DI 容器**，所有服务的工厂与访问点 |
| `managers/DialogManager.ts` | 复习/设置对话框的打开、关闭、生命周期 |
| `managers/BlockMenuHandler.ts` | 块右键菜单（"加入卡组"、"复习"等） |
| `services/CardApplicationService.ts` | 卡片增删改查门面 |
| `services/ReviewApplicationService.ts` | 复习流程启动、数据源选择 |
| `services/UnifiedDataSourceManager.ts` | 管理多种数据源（Riff/修远/混合） |
| `queries/DataAccessFacade.ts` | `AdvancedDataRouter`：统一查询入口 |
| `usecases/card/CreateCardUseCase.ts` | 创建卡片的完整流程 |

### 3.3 核心业务层 `src/core/`

这是**业务逻辑主体**，内部有自己的 DDD 分层。

| 子模块 | 职责 |
|--------|------|
| `queue/` | 队列策略、排序、调度、数据源——**复习行为的核心** |
| `scheduler/` | FSRS v6 / SM-15 算法实现、批量重排 |
| `xiuyuan/` | 修远卡组领域（自定义卡片格式，完整 DDD） |
| `card/` | 卡片类型系统、渲染服务 |
| `siyuan/` | 思源 API 封装（Riff API、块操作、SQL） |
| `storage/` | 插件数据持久化（settings.json） |
| `extensions/` | QueueProvider 扩展点 |

### 3.4 表现层 `src/ui/`

| 子模块 | 职责 |
|--------|------|
| `review/v2/` | **当前主复习界面**，基于适配器模式 |
| `review/components/` | 各卡片类型渲染器组件 |
| `browser/` | 卡片管理浏览器（AG-Grid） |
| `settings/` | 设置面板 |
| `components/SiyuanTheme/` | 遵循思源 UI 规范的基础组件 |

---

## 4. 核心子系统详解

### 4.1 队列系统（"一核多策略"）

`QueueContext` 是容器，持有多个注册的策略，运行时通过 `setStrategy(queueId)` 切换。

```
QueueContext<TItem>
  ├── register(queueId, IQueueStrategy) → 注册策略
  ├── setStrategy(queueId)              → 切换当前策略
  ├── getNextItem()                     → 委托给当前策略
  └── addItem() / removeItem()          → 委托给当前策略

IQueueStrategy<TItem> 接口（src/core/queue/abstraction/Strategy.ts）：
  ├── next(): Promise<TItem | null>              → 下一张卡
  ├── onFeedback(item, feedback): Promise<void>  → 处理用户评分
  ├── getUIConfig(item): QueueUIConfig           → 决定显示哪些按钮
  └── getStats?(): Promise<QueueStats>           → 队列统计
```

**策略文件**：`src/core/queue/strategies/*.ts`

**"三支柱"组合**（每个队列策略内部由三个对象组成）：

```
RetrievalPracticeQueue (IQueueStrategy)
  ├── IDataSource   → 数据来源（RiffDataSource / LocalStorageDataSource）
  ├── ISequencer    → 下一张怎么选（FSRSSequencer / PrioritySequencer）
  └── IScheduler    → 复习后怎么更新（RiffScheduler / NullScheduler）
```

**队列类型枚举**（`src/types/unified-data-source.ts`）：

```typescript
enum QueueType {
  RETRIEVAL_PRACTICE = 'retrieval',
  FINAL_DRILL        = 'final_drill',
  INCREMENTAL_LEARNING = 'incremental',
  NEURAL_ROAM        = 'neural_roam',
  FILTER_GROUP       = 'filter_group',
  LEECH              = 'leech',
}
```

**观察者模式（缓存自动失效）**：
- `ObservableDataSource` 在数据变更时调用 `notifyObservers()`
- `PrioritySequencer` 等实现 `IDataSourceObserver`，收到通知后自动失效缓存
- **禁止**手动调用 `reset()`，依赖观察者自动触发

### 4.2 调度器系统

```
SchedulerRouter（路由器）src/core/scheduler/SchedulerRouter.ts
  ├── TSFSRSScheduler  → FSRS v6（ts-fsrs 库）— 普通闪卡
  ├── SM15Scheduler    → SuperMemo 15 — 话题卡
  └── ImprovedTopicScheduler → 改良话题调度器

批量操作：
  ├── AdvanceEngine.ts   → 批量提前复习
  ├── PostponeEngine.ts  → 批量推迟
  ├── SpreadEngine.ts    → 批量分散
  └── rescheduleService.ts → 批量重排
```

### 4.3 修远（Xiuyuan）领域

修远是插件自定义的卡组系统，数据存储在**思源块属性**中（非 Riff 系统）。

```
Xiuyuan（卡组聚合根）
  └── Card（修远卡片）
        ├── Priority（优先级值对象）
        └── ScheduleInfo（调度信息值对象）

持久化：XiuyuanRepository → 读写 block 自定义属性
同步：XiuyuanSyncService → 修远卡片 ↔ Riff 系统双向同步

模板系统（TemplateRegistry）：
  ├── builtin-quick.ts    → 快速正反卡、挖空卡
  └── builtin-concept.ts  → 概念定义卡
```

### 4.4 复习界面适配器模式

```
ReviewView.vue
  └── useReviewSession.ts（Composable，核心逻辑）
        ├── 持有当前 IQueueStrategy
        ├── 调用 strategy.next() 获取下一张卡
        ├── 通过 IAdapter<TItem> 将卡片转为 UI 状态
        │     ├── toUIState(queue, item, ctx) → ReviewUIState
        │     └── fetchAuxiliaryData?(item)   → 面包屑等异步数据
        └── 调用 strategy.onFeedback() 处理用户评分
```

**卡片类型渲染器**（`src/ui/review/components/`）：每种卡片类型（快速卡、概念卡、描述符卡、挖空卡）对应一个独立的 Renderer 组件。

### 4.5 卡片浏览器

```
SRSBrowser.vue（AG-Grid）
  ├── useCardData.ts   → 加载数据（走 BrowserApplicationService）
  ├── useCardFilter.ts → 列过滤逻辑
  ├── useCardActions.ts → 右键菜单操作
  └── datasource/      → 不同来源（Deck/RetrievalPractice/FinalDrill...）
```

**重要**：所有列定义必须有 `colId`，否则列刷新静默失败。

### 4.6 存储系统

| 数据类型 | 存储位置 | 访问方式 |
|---------|---------|---------|
| 插件设置 | `settings.json`（思源 storage） | `UnifiedStorageManager` |
| 修远卡片数据 | 思源块自定义属性 | `XiuyuanRepository` |
| Riff 卡片数据 | 思源 Riff 数据库（内核管理） | `riff.ts` 中的 API |
| 队列状态 | 文件服务（`FileService`） | `QueuePersistenceService` |

---

## 5. 数据流：从用户操作到持久化

### 5.1 用户评分一张闪卡

```
① 用户点击"一般"按钮 (Rating=3)
   └── ReviewActions.vue → emit('feedback', { action: 'rate', rating: 3 })

② ReviewView.vue
   └── 调用 useReviewSession.ts → handleFeedback()

③ useReviewSession.ts
   └── currentStrategy.onFeedback(currentItem, feedback)

④ RetrievalPracticeQueue.onFeedback()
   ├── RiffScheduler.schedule(item, rating)
   │     └── reviewRiffCard(deckID, cardID, rating)  ← 思源 Riff API
   └── sequencer.next() 准备下一张

⑤ riff.ts → fetchPost('/api/riff/reviewRiffCard', ...)
   └── 思源内核持久化 FSRS 调度数据
```

### 5.2 创建修远卡片

```
① 用户在块右键菜单点击"创建修远卡片"
   └── BlockMenuHandler.ts

② CreateXiuyuanFromBlocksUseCase.execute(blockIds)

③ UseCase 调用：
   ├── CardTypeDetectionService.detect(block) → 检测卡片类型
   ├── CardCreationService.create(xiuyuan, block) → 创建卡片实体
   └── XiuyuanRepository.save(xiuyuan) → 持久化到 block 属性

④ XiuyuanSyncService 触发同步
   └── addRiffCards(deckId, [blockId]) → 同步到 Riff 系统
```

### 5.3 打开复习会话

```
① 用户点击顶栏"开始复习"
   └── commands.ts / TopBar.ts

② DialogManager.openReviewDialog(options)

③ ReviewView.vue 初始化 useReviewSession
   └── 根据 QueueType 从 ApplicationContext 获取对应队列策略

④ strategy.next() → dataSource.getDueCards()
   └── RiffDataSource → getRiffDueCards(deckID) → 思源 API
```

---

## 6. 关键接口与类型定义

### 核心接口速查

| 接口 | 文件 | 用途 |
|------|------|------|
| `IQueueStrategy<TItem>` | `src/core/queue/abstraction/Strategy.ts` | 队列策略接口 |
| `QueueFeedback` | `src/core/queue/abstraction/Strategy.ts` | 用户反馈类型 |
| `QueueItem` | `src/core/queue/abstraction/types.ts` | 队列项基础类型（必须有 blockID） |
| `IDataSource<TItem>` | `src/core/queue/datasource/IDataSource.ts` | 数据源接口 |
| `QueueProvider<TItem>` | `src/core/extensions/QueueProvider.ts` | 扩展层队列提供者 |
| `IXiuyuanRepository` | `src/core/xiuyuan/domain/repositories/IXiuyuanRepository.ts` | 修远仓储接口 |
| `IPluginFacade` | `src/application/interfaces/IPluginFacade.ts` | 插件对外门面 |

### 关键类型

| 类型 | 文件 | 说明 |
|------|------|------|
| `QueueType` (enum) | `src/types/unified-data-source.ts` | 所有队列类型枚举 |
| `ReviewCard` | `src/types/review.ts` | 复习界面卡片数据 |
| `PluginSettings` | `src/types/settings.ts` | 插件设置结构 |
| `Result<T, E>` | `src/types/result.ts` | 函数式错误处理 |
| `QueueUIConfig` | `src/core/queue/types.ts` | UI 显示配置 |
| `BlockID / CardID` | `src/types/branded.ts` | 品牌类型（防 ID 混淆） |

---

## 7. 需求→代码定位速查表

### 修复 BUG

| BUG 类型 | 先检查 | 再检查 |
|----------|--------|--------|
| 评分后卡片重复/不更新 | `src/core/queue/strategies/RetrievalPracticeQueue.ts` → `onFeedback()` | `src/core/queue/schedulers/RiffScheduler.ts` |
| 复习界面空白 | `src/ui/review/v2/useReviewSession.ts` → 初始化流程 | `src/core/queue/datasource/RiffDataSource.ts` |
| 统计数字不准 | `src/core/queue/strategies/[对应队列].ts` → `getStats()` | `src/ui/review/v2/ReviewHeader.vue` |
| 浏览器列不刷新 | `src/ui/browser/config/columnDefs.ts`（检查是否有 `colId`） | `src/ui/browser/SRSBrowser.vue` |
| 菜单项不显示 | `src/application/managers/BlockMenuHandler.ts` | `src/application/managers/MenuManager.ts` |
| 设置保存失败 | `src/application/services/SettingsService.ts` | `src/core/storage/UnifiedStorageManager.ts` |
| 修远卡片不同步 | `src/application/services/XiuyuanSyncService.ts` | `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` |
| 卡片类型检测错误 | `src/core/card-type/CardTypeMarkerService.ts` | `src/core/xiuyuan/domain/services/CardTypeDetectionService.ts` |
| FSRS 算法结果不对 | `src/core/scheduler/strategies/TSFSRSScheduler.ts` | `src/core/queue/schedulers/RiffScheduler.ts` |
| 神经漫游卡片异常 | `src/core/queue/neural/NeuralQueue.ts` | `src/core/queue/neural/WeightedWalkEngine.ts` |
| 推迟/提前复习不生效 | `src/core/scheduler/PostponeEngine.ts` / `AdvanceEngine.ts` | `src/core/siyuan/riff.ts` → `batchSetRiffCardsDueTime()` |

### 增加功能

| 需求 | 改哪里 |
|------|--------|
| **新增队列类型** | 1. `src/types/unified-data-source.ts` 加枚举值<br>2. `src/core/queue/strategies/` 新建策略类（实现 `IQueueStrategy`）<br>3. `src/application/ApplicationContext.ts` 注册到 `QueueContext`<br>4. `src/application/managers/DialogManager.ts` 添加启动入口 |
| **新增排序器** | `src/core/queue/sequencers/` 新建文件，实现排序接口 |
| **新增调度算法** | `src/core/scheduler/strategies/` 新建，在 `SchedulerRouter` 注册 |
| **新增菜单项** | `src/application/managers/BlockMenuHandler.ts` 或 `MenuManager.ts` |
| **新增设置选项** | 1. `src/types/settings.ts` 加字段<br>2. `src/ui/settings/SettingsPanel.vue` 加 UI<br>3. `src/application/services/SettingsService.ts` 处理读写 |
| **新增卡片类型渲染器** | 1. `src/ui/review/components/` 新建 Renderer 组件<br>2. `src/core/card/` 对应子目录加渲染服务 |
| **新增浏览器列** | `src/ui/browser/config/columnDefs.ts`（**必须加 `colId`**） |
| **新增对话框** | `src/ui/browser/dialogs/` 或 `src/ui/review/v2/dialogs/`，通过 `DialogManager` 管理生命周期 |
| **修改卡片创建流程** | `src/application/usecases/card/CreateCardUseCase.ts` |
| **修改卡片类型检测** | `src/core/xiuyuan/domain/services/CardTypeDetectionService.ts` |
| **新增卡片模板** | `src/core/xiuyuan/templates/` 加定义，在 `TemplateRegistry` 注册 |
| **修改复习按钮行为** | `src/ui/review/v2/ReviewActions.vue` → `src/ui/review/v2/useReviewSession.ts` |
| **修改批量重排逻辑** | `src/core/scheduler/rescheduleService.ts` 和对应 Engine |

### 理解数据来源

| 问题 | 答案位置 |
|------|---------|
| 标准复习卡片哪来的 | `src/core/queue/datasource/RiffDataSource.ts` → `getRiffDueCards()` |
| 修远卡片哪来的 | `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` → 读 block 属性 |
| 设置数据哪来的 | `src/core/storage/UnifiedStorageManager.ts` → `settings.json` |
| 浏览器表格数据哪来的 | `src/ui/browser/datasource/*.ts` → 各数据源实现 |
| 神经漫游种子哪来的 | `src/core/neural/SeedService.ts` |

---

## 8. 已知技术债务

| 债务 | 位置 | 说明 |
|------|------|------|
| 旧队列文件残留 | `src/core/queue/domain/` | 与 `strategies/` 部分重复，迁移中 |
| 顶层领域层文件稀少 | `src/domain/` | DDD 迁移目标，当前只有少量文件 |
| `core/siyuan/` 位置不规范 | `src/core/siyuan/` | 按 DDD 规范应在 `src/infrastructure/api/`，历史遗留 |
| 备份文件 | `*.backup`, `*.bak`, `*.corrupted` | 多个 Vue 文件存在备份，需清理 |
| `@deprecated` 访问器 | `src/index.ts` 57~76 行 | 向后兼容 accessor，下个主版本移除 |
| `src/domain/queues/` | `RetrievalPracticeQueue.ts` | 迁移中间状态 |

---

## 9. 修改前必读规则

### 依赖方向（绝对不可违反）

```
ui/  →  application/  →  core/(domain)  ←  core/(infrastructure)
                ↓
         infrastructure/
```

- **UI 层**只能调用 `application/` 层，**不能**直接调用 `src/core/siyuan/riff.ts`
- **application/** 层不能包含 FSRS 算法（算法在 `core/scheduler/`）
- **domain/领域层**不能 `import` Vue 或思源 API
- 新增代码前先确认文件应放哪一层

### 操作 Protyle 的规则

```typescript
// ✅ 正确：传 blockId，让 Protyle 自己加载
new Protyle(app, element, { blockId: 'xxx', mode: 'wysiwyg' });

// ❌ 错误：手动操作 innerHTML（会导致白屏）
element.innerHTML = '<div>...</div>';
```

### 必须使用的工具

```typescript
// 日志：必须用 logger，禁止直接 console.log
import { logger } from '@/utils/logger';
logger.info('message', data);

// 错误处理：推荐 Result 类型，强制调用者处理失败
import type { Result } from '@/types/result';
// { ok: true; value: T } | { ok: false; error: E }
```

### AG-Grid 特别注意

浏览器中所有列定义**必须有 `colId`**，否则列刷新会静默失败：

```typescript
// ✅ 正确
{ field: 'nextDue', colId: 'nextDue', headerName: '到期时间' }

// ❌ 错误（列不会刷新）
{ field: 'nextDue', headerName: '到期时间' }
```

### 构建验证（提交前必须通过）

```bash
npm run build    # 构建成功
npx tsc          # 零类型错误
```

### 常用设计模式速查

| 场景 | 模式 | 参考位置 |
|------|------|---------|
| 新增复习模式 | Strategy 模式 | `src/core/queue/abstraction/Strategy.ts` |
| 数据变更自动刷新 | Observer 模式 | `src/core/queue/datasource/ObservableDataSource.ts` |
| 卡片类型→UI 状态 | Adapter 模式 | `src/ui/review/v2/adapters/` |
| 服务定位/依赖注入 | DI Container | `src/application/ApplicationContext.ts` |
| 类型安全 ID | Branded Types | `src/types/branded.ts` |
| 函数式错误处理 | Result 类型 | `src/types/result.ts` |

---

*文档生成时间: 2026-02-23*
*基于实际源码分析（657 个源文件）*
