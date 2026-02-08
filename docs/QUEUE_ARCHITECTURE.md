# 队列架构文档

## 概述

本文档描述了 FSRS 插件的队列架构，包括新统一架构和旧架构的对比。

## 新统一架构（推荐）

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    UI Components                             │
│  (ReviewDialog, SRSBrowser, MenuActions, etc.)              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              UnifiedDataSourceManager                        │
│  - 管理所有队列实例                                          │
│  - 实现观察者模式                                            │
│  - 处理模式切换（Simple/Advanced）                           │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────┐          ┌──────────────┐
│ SimpleRouter │          │AdvancedRouter│
│ (Riff API)   │          │(LocalStorage)│
└──────────────┘          └──────────────┘
        │                         │
        └────────────┬────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Queue Instances                           │
│  - RetrievalPracticeQueue (动态)                            │
│  - FinalDrillQueue (静态)                                   │
│  - IncrementalLearningQueue (动态)                          │
│  - FilterGroupQueue (动态)                                  │
│  - NeuralRoamQueue (静态)                                   │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

#### 1. UnifiedDataSourceManager

**位置**: `src/managers/UnifiedDataSourceManager.ts`

**职责**:
- 管理所有队列实例的生命周期
- 实现观察者模式，通知 UI 组件数据变更
- 处理简单模式和高级模式的切换
- 提供统一的队列访问接口

**关键方法**:
```typescript
getQueue(type: QueueType): IReviewQueue
registerObserver(observer: IDataSourceObserver): void
unregisterObserver(observer: IDataSourceObserver): void
getCurrentMode(): OperationMode
```

#### 2. IReviewQueue 接口

**位置**: `src/types/unified-data-source.ts`

**职责**: 定义所有队列类型的统一接口

**关键方法**:
```typescript
getAllCards(): Promise<FSRSCard[]>
getNextCard(): Promise<FSRSCard | null>
addCard(card: FSRSCard | string): Promise<void>
removeCard(cardId: string): Promise<void>
handleReview(cardId: string, rating: number): Promise<void>
refresh(): Promise<void>
```

#### 3. 数据路由器

**SimpleDataRouter** (`src/routers/SimpleDataRouter.ts`):
- 使用 Riff API 作为数据源
- 功能有限（只读）
- 适用于简单模式

**AdvancedDataRouter** (`src/routers/AdvancedDataRouter.ts`):
- 使用本地存储作为数据源
- 完整功能访问
- 适用于高级模式

#### 4. 队列实现

所有队列实现位于 `src/queues/` 目录：

**动态队列**（自动获取到期卡片）:
- `RetrievalPracticeQueue` - 检索练习队列
- `IncrementalLearningQueue` - 渐进学习队列
- `FilterGroupQueue` - 过滤组队列

**静态队列**（手动管理）:
- `FinalDrillQueue` - 最终训练队列
- `NeuralRoamQueue` - 神经漫游队列

### 数据流

#### 1. 卡片获取流程

```
UI Component
    │
    ├─> adapter.fetchRows()
    │       │
    │       ├─> manager.getQueue(type)
    │       │       │
    │       │       └─> queue.getAllCards()
    │       │               │
    │       │               ├─> dataRouter.getCards()
    │       │               │       │
    │       │               │       └─> Riff API / LocalStorage
    │       │               │
    │       │               └─> 返回 FSRSCard[]
    │       │
    │       └─> 转换为 BrowserCard[]
    │
    └─> 显示在 UI
```

#### 2. 卡片评分流程

```
UI Component
    │
    ├─> queue.handleReview(cardId, rating)
    │       │
    │       ├─> scheduler.schedule(card, rating)
    │       │       │
    │       │       └─> 计算新的 FSRS 参数
    │       │
    │       ├─> dataRouter.updateCard(card)
    │       │       │
    │       │       └─> 保存到 Riff API / LocalStorage
    │       │
    │       └─> manager.notifyObservers()
    │               │
    │               └─> UI 自动刷新
```

#### 3. 观察者通知流程

```
数据变更
    │
    ├─> manager.notifyObservers(event)
    │       │
    │       ├─> observer1.onDataChanged(event)
    │       ├─> observer2.onDataChanged(event)
    │       └─> observer3.onDataChanged(event)
    │
    └─> UI 组件自动刷新
```

### 模式切换

#### 简单模式 (Simple Mode)

**特点**:
- 使用 Riff API 作为数据源
- 只读访问
- 功能有限

**可用队列**:
- RetrievalPracticeQueue
- FinalDrillQueue

**可用操作**:
- 查看卡片
- 评分复习
- 添加到最终训练

#### 高级模式 (Advanced Mode)

**特点**:
- 使用本地存储作为数据源
- 完整功能访问
- 支持所有队列类型

**可用队列**:
- RetrievalPracticeQueue
- FinalDrillQueue
- IncrementalLearningQueue
- FilterGroupQueue
- NeuralRoamQueue

**可用操作**:
- 所有简单模式操作
- 切换调度器
- 修改卡片类型
- 设置优先级
- 同步到 Riff

## 旧架构（已弃用）

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    UI Components                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              BaseCompositeQueue                              │
│  - Scheduler (FSRS, SM2, etc.)                              │
│  - Sequencer (Priority, Graph, List)                        │
│  - DataSource (Riff, Storage, Hybrid)                       │
│  - Traits (Mutable, Removable, etc.)                        │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

**BaseCompositeQueue** (`src/core/queue/composite/BaseCompositeQueue.ts`):
- 组合模式实现
- 插件化组件（Scheduler, Sequencer, DataSource, Traits）
- 已标记为 @deprecated

**旧数据源** (`src/core/queue/datasource/`):
- RiffDataSource
- LocalStorageDataSource
- HybridDataSource
- 已标记为 @deprecated

### 迁移状态

旧架构已标记为 `@deprecated`，并在运行时发出警告：

```typescript
[Deprecated Queue] RetrievalPracticeQueue belongs to old queue architecture 
and will be removed in a future release.
```

**迁移建议**:
1. 新代码应使用 `src/queues/` 中的队列实现
2. 通过 `UnifiedDataSourceManager` 访问队列
3. 实现 `IReviewQueue` 接口而不是继承 `BaseCompositeQueue`

## 对比总结

| 特性 | 新架构 | 旧架构 |
|------|--------|--------|
| 位置 | `src/queues/` | `src/core/queue/strategies/` |
| 接口 | `IReviewQueue` | `BaseCompositeQueue` |
| 数据源管理 | `UnifiedDataSourceManager` | 直接创建 DataSource |
| 观察者模式 | ✅ 内置 | ❌ 需手动实现 |
| 模式切换 | ✅ 自动处理 | ❌ 需手动处理 |
| 类型系统 | `FSRSCard` | `QueueItem` |
| 状态 | ✅ 活跃开发 | ⚠️ 已弃用 |

## 最佳实践

### 1. 使用 UnifiedDataSourceManager

```typescript
// ✅ 推荐
const manager = new UnifiedDataSourceManager(plugin);
const queue = manager.getQueue('retrieval-practice');

// ❌ 不推荐
const queue = new RetrievalPracticeQueue(config);
```

### 2. 实现观察者接口

```typescript
// ✅ 推荐
class MyComponent implements IDataSourceObserver {
    onDataChanged(event: DataChangeEvent): void {
        // 自动刷新 UI
    }
}

manager.registerObserver(myComponent);
```

### 3. 使用 FSRSCard 类型

```typescript
// ✅ 推荐
const cards: FSRSCard[] = await queue.getAllCards();

// ❌ 不推荐
const items: QueueItem[] = await queue.getAllItems();
```

### 4. 处理模式切换

```typescript
// ✅ 推荐 - 自动处理
const mode = manager.getCurrentMode();
const availableQueues = mode === 'simple' 
    ? ['retrieval-practice', 'final-drill']
    : ['retrieval-practice', 'final-drill', 'incremental-learning', 'filter-group', 'neural-roam'];
```

## 参考文档

- [统一数据源架构设计](.kiro/specs/unified-data-source-architecture/design.md)
- [UI 集成设计](.kiro/specs/unified-data-source-ui-integration/design.md)
- [队列架构迁移计划](.kiro/specs/queue-architecture-migration/tasks.md)
- [IReviewQueue 接口](../src/types/unified-data-source.ts)
- [UnifiedDataSourceManager](../src/managers/UnifiedDataSourceManager.ts)
