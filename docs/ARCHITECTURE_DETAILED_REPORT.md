# FSRS 插件详细架构报告

> **文档目的**: 为 AI 和开发者提供完整的架构理解，涵盖所有抽象层和设计模式
> 
> **创建时间**: 2026-02-01
> 
> **代码规模**: 218 个 TypeScript 文件，约 30,000+ 行代码

---

## 目录

1. [架构概览](#1-架构概览)
2. [核心抽象层](#2-核心抽象层)
3. [队列系统架构](#3-队列系统架构)
4. [调度器系统](#4-调度器系统)
5. [数据流与同步](#5-数据流与同步)
6. [UI 层架构](#6-ui-层架构)
7. [服务层设计](#7-服务层设计)
8. [设计模式总结](#8-设计模式总结)
9. [关键约束与原则](#9-关键约束与原则)
10. [扩展指南](#10-扩展指南)

---

## 1. 架构概览

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         思源笔记核心                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Riff 原生闪卡系统 (Go 实现)                   │  │
│  │  - 卡片数据库                                              │  │
│  │  - 复习调度                                                │  │
│  │  - 间隔算法                                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↕ HTTP API
┌─────────────────────────────────────────────────────────────────┐
│                    FSRS 插件 (TypeScript)                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                   UI 层 (Vue 3)                         │   │
│  │  - 复习界面 (ReviewView)                                │   │
│  │  - 卡片浏览器 (SRSBrowser)                              │   │
│  │  - 设置面板 (SettingsPanel)                             │   │
│  └────────────────────────────────────────────────────────┘   │
│                              ↕                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                   服务层 (Services)                      │   │
│  │  - ReviewDialogManager                                  │   │
│  │  - BlockMenuHandler                                     │   │
│  │  - MenuService                                          │   │
│  └────────────────────────────────────────────────────────┘   │
│                              ↕                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                   核心层 (Core)                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │   │
│  │  │ 队列系统      │  │ 调度器系统    │  │ 存储系统      │ │   │
│  │  │ (Queue)      │  │ (Scheduler)  │  │ (Storage)    │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │   │
│  └────────────────────────────────────────────────────────┘   │
│                              ↕                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              思源 API 封装层 (core/siyuan)               │   │
│  │  - Riff API 封装                                        │   │
│  │  - 块操作 API                                           │   │
│  │  - SQL 查询封装                                         │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 分层职责

| 层级 | 职责 | 关键约束 |
|------|------|----------|
| **UI 层** | 用户交互、视图渲染 | 不直接访问思源 API，通过服务层 |
| **服务层** | 协调核心层和 UI 层 | 无状态，纯协调逻辑 |
| **核心层** | 业务逻辑、算法实现 | 与 UI 解耦，可独立测试 |
| **API 封装层** | 思源 API 调用 | 唯一的数据出入口 |

---


## 2. 核心抽象层

### 2.1 抽象层次结构

FSRS 插件采用了**多层抽象**设计，每一层都有明确的职责边界：

```
┌─────────────────────────────────────────────────────────────┐
│ Level 5: Provider Layer (扩展层)                             │
│ - QueueProvider: 统一的队列访问接口                           │
│ - ReviewUIProvider: 复习 UI 提供者                           │
│ - 为外部组件提供标准化 API                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Level 4: Session Layer (会话层)                              │
│ - SessionManager: 管理复习会话状态                            │
│ - FinalDrillV2Session: 刻意练习会话                          │
│ - 封装会话逻辑，维护临时状态                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Level 3: Strategy Layer (策略层)                             │
│ - IQueueStrategy: 队列策略接口                                │
│ - BaseCompositeQueue: 复合队列基类                            │
│ - 实现具体的队列逻辑                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Level 2: Component Layer (组件层)                            │
│ - IScheduler: 调度器接口                                      │
│ - ISequencer: 排序器接口                                      │
│ - IDataSource: 数据源接口                                     │
│ - IQueueTrait: 特性接口                                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Level 1: Data Layer (数据层)                                 │
│ - QueueItem: 队列项数据结构                                   │
│ - FSRSCard: FSRS 卡片数据结构                                │
│ - 纯数据，无行为                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心接口定义

#### 2.2.1 IQueueStrategy (队列策略接口)

```typescript
export interface IQueueStrategy<TItem = any> {
  // UI 配置：决定复习界面的显示方式
  getUIConfig(currentItem: TItem | null): QueueUIConfig;
  
  // 获取下一个项目
  next(): Promise<TItem | null>;
  
  // 处理用户反馈（评分、跳过等）
  onFeedback(currentItem: TItem | null, feedback: QueueFeedback): Promise<void>;
  
  // 获取统计信息（可选）
  getStats?(): Promise<QueueStats>;
  
  // 重新排序（可选）
  reorder?(orderedItems: TItem[]): Promise<boolean>;
}
```

**设计意图**:
- 统一所有队列类型的接口
- 支持不同的复习模式（提取练习、刻意练习、神经漫游等）
- UI 层只需要知道这个接口，不需要了解具体实现

#### 2.2.2 IDataSource (数据源接口)

```typescript
export interface IDataSource<TItem> {
  // 获取所有项目
  getAll(): Promise<TItem[]>;
  
  // 添加项目（可选）
  add?(items: TItem[]): Promise<number>;
  
  // 移除项目（可选）
  remove?(items: TItem[]): Promise<number>;
  
  // 获取大小（可选）
  size?(): Promise<number> | number;
  
  // 检查是否为空（可选）
  isEmpty?(): Promise<boolean> | boolean;
}
```

**设计意图**:
- 抽象数据来源（Riff API、本地存储、图遍历等）
- 支持不同的存储后端
- 可选方法支持不同的数据源能力

#### 2.2.3 IScheduler (调度器接口)

```typescript
export interface IScheduler<TCard, TGrade = number> {
  // 执行调度，返回更新后的卡片
  schedule(card: TCard, grade: TGrade): Promise<TCard>;
}
```

**设计意图**:
- 封装调度算法（FSRS、SM-2、SM-15、A-Factor 等）
- 无状态设计，只接收卡片快照，返回调度结果
- 支持不同的评分系统

#### 2.2.4 ISequencer (排序器接口)

```typescript
export interface ISequencer<TItem> {
  // 获取下一个项目
  next(): Promise<TItem | null>;
  
  // 重新排序（可选）
  reorder?(orderedItems: TItem[]): void;
}
```

**设计意图**:
- 封装排序逻辑（优先级、到期时间、图遍历等）
- 支持不同的排序策略
- 可以缓存排序结果以提高性能

---


## 3. 队列系统架构

### 3.1 复合队列模式 (Composite Queue Pattern)

**核心思想**: 将队列分解为可插拔的组件，通过组合实现不同的队列类型。

```
┌─────────────────────────────────────────────────────────────┐
│              BaseCompositeQueue<TItem>                       │
│  ┌────────────────────────────────────────────────────┐    │
│  │  组件组合:                                          │    │
│  │  - Scheduler: 调度算法 (FSRS, SM-2, A-Factor)      │    │
│  │  - Sequencer: 排序逻辑 (Priority, Sorted, Graph)   │    │
│  │  - DataSource: 数据来源 (Riff, Local, Hybrid)      │    │
│  │  - Traits: 可选特性 (Mutable, Removable, etc.)     │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  核心方法:                                                   │
│  - next(): 获取下一个项目 (委托给 Sequencer)                │
│  - onFeedback(): 处理反馈 (委托给 Scheduler)                │
│  - getStats(): 获取统计 (聚合各组件数据)                    │
│  - rotateToEnd(): 旋转项目到队尾                            │
└─────────────────────────────────────────────────────────────┘
```

#### 3.1.1 组件职责划分

| 组件 | 职责 | 可选性 | 示例实现 |
|------|------|--------|----------|
| **Scheduler** | 算法逻辑 | 可选 | RiffScheduler, FSRSScheduler |
| **Sequencer** | 排序逻辑 | 必需 | PrioritySequencer, SortedSequencer |
| **DataSource** | 数据存储 | 必需 | RiffDataSource, HybridDataSource |
| **Traits** | 扩展能力 | 可选 | Mutable, Removable, Prioritizable |

#### 3.1.2 Trait 系统 (特性系统)

**设计模式**: Mixin / Capability Pattern

```typescript
// 可变特性：支持插入操作
interface IMutableTrait<TItem> {
  id: 'mutable';
  insertAt(items: TItem[], index: number): Promise<void>;
}

// 可移除特性：支持删除操作
interface IRemovableTrait<TItem> {
  id: 'removable';
  removeItems(items: TItem[]): Promise<number>;
}

// 可优先级特性：支持设置优先级
interface IPrioritizableTrait<TItem> {
  id: 'prioritizable';
  setPriority(item: TItem, priority: number): Promise<boolean>;
}
```

**使用示例**:
```typescript
// 检查队列是否支持某个特性
if (queue.hasTrait('mutable')) {
  const mutableTrait = queue.getTrait<IMutableTrait<QueueItem>>('mutable');
  await mutableTrait.insertAt(items, 0);
}
```

### 3.2 具体队列实现

#### 3.2.1 RetrievalPracticeQueue (提取练习队列)

**特点**:
- 混合数据源 (Riff API + 本地存储)
- 优先级排序 (到期时间 + 优先级)
- 支持手动添加卡片
- SM-15 风格的失败处理

**组件配置**:
```typescript
{
  scheduler: RiffScheduler,           // 使用 Riff API 调度
  sequencer: SortedSequencer,         // 二分查找排序
  dataSource: HybridDataSource,       // 混合数据源
  traits: [
    MutableTrait,                     // 支持插入
    RemovableTrait,                   // 支持删除
    PrioritizableTrait                // 支持优先级
  ]
}
```

**数据流**:
```
1. 加载阶段:
   Riff API → RiffDataSource → HybridDataSource → SortedSequencer
   Local Storage → StorageDataSource → HybridDataSource → SortedSequencer

2. 复习阶段:
   User Rating → onFeedback() → RiffScheduler → Riff API
                              → Storage.saveCard()
                              
3. 失败处理 (Rating < 3):
   Remove from queue → Update due time → Binary insert back
```

#### 3.2.2 FinalDrillQueue (刻意练习队列)

**特点**:
- 纯本地存储
- 评分 < 4 的卡片旋转到队尾
- 支持进度持久化
- 支持恢复未完成的会话

**组件配置**:
```typescript
{
  scheduler: RiffScheduler,           // 使用 Riff API 调度
  sequencer: ListSequencer,           // 简单列表排序
  dataSource: StorageDataSource,      // 本地存储
  traits: [
    MutableTrait,                     // 支持插入
    RemovableTrait                    // 支持删除
  ]
}
```

**会话管理**:
```typescript
// FinalDrillV2Session 管理会话状态
{
  inProgress: boolean,      // 是否正在进行
  answered: number,         // 已回答数量
  correct: number,          // 正确数量
  startedAt: number,        // 开始时间
  durationMs: number,       // 持续时间
  initialTotal: number      // 初始总数（用于计算进度）
}
```

#### 3.2.3 NeuralRoamQueue (神经漫游队列)

**特点**:
- 基于知识图谱的随机游走
- 加权选择下一个节点
- 支持种子节点
- 无限队列（动态生成）

**组件配置**:
```typescript
{
  scheduler: null,                    // 不使用调度器
  sequencer: GraphSequencer,          // 图遍历排序
  dataSource: GraphDataSource,        // 图数据源
  traits: []                          // 无特殊特性
}
```

**图遍历算法**:
```
1. 从种子节点开始
2. 获取所有出链（引用、反链）
3. 根据权重随机选择下一个节点
4. 重复步骤 2-3
```

### 3.3 数据源架构

#### 3.3.1 HybridDataSource (混合数据源)

**设计模式**: Composite Pattern

```
┌─────────────────────────────────────────────────────────┐
│           HybridDataSource                               │
│  ┌────────────────────────────────────────────────┐    │
│  │  sources: {                                     │    │
│  │    'riff': RiffDataSource,                      │    │
│  │    'local': StorageDataSource                   │    │
│  │  }                                              │    │
│  │  priority: ['riff', 'local']                    │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  getAll(): 按优先级合并所有数据源                        │
│  getFromSource(id): 获取特定数据源的数据                 │
└─────────────────────────────────────────────────────────┘
```

**合并策略**:
```typescript
async getAll(): Promise<QueueItem[]> {
  const results: QueueItem[] = [];
  
  // 按优先级顺序加载
  for (const sourceId of this.priority) {
    const source = this.sources[sourceId];
    const items = await source.getAll();
    results.push(...items);
  }
  
  // 去重（基于 cardID）
  return deduplicateByCardId(results);
}
```

#### 3.3.2 RiffDataSource (Riff API 数据源)

**职责**:
- 从 Riff API 获取到期卡片
- 过滤 Topic 卡片（只返回 Item 卡片）
- 合并本地 nextDues 数据
- 处理黑名单

**关键方法**:
```typescript
async getAll(): Promise<QueueItem[]> {
  // 1. 从 Riff API 获取到期卡片
  const riffCards = await this.api.getRiffDueCards(this.deckId);
  
  // 2. 过滤 Topic 卡片
  const itemCards = await this.filterTopicCards(riffCards);
  
  // 3. 合并本地 nextDues（优先使用本地数据）
  const merged = await this.mergeLocalNextDues(itemCards);
  
  // 4. 应用黑名单过滤
  const filtered = this.applyBlacklist(merged);
  
  return filtered;
}
```

**Topic 过滤逻辑**:
```typescript
// 批量查询卡片类型
const cardTypes = await this.batchGetCardTypes(blockIds);

// 过滤掉 Topic 卡片
return items.filter(item => {
  const cardType = cardTypes.get(item.blockID);
  return cardType !== 'topic';  // 只保留 Item 卡片
});
```

---


## 4. 调度器系统

### 4.1 SchedulerRouter (调度器路由)

**设计模式**: Strategy Pattern + Router Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    SchedulerRouter                           │
│  ┌────────────────────────────────────────────────────┐    │
│  │  schedulers: Map<SchedulerType, Scheduler>         │    │
│  │  - 'fsrs-v5': SimpleFSRSScheduler                  │    │
│  │  - 'sm2': SM2Scheduler                             │    │
│  │  - 'sm15': SM15Scheduler                           │    │
│  │  - 'a-factor': TopicScheduler                      │    │
│  │  - 'a-factor-v2': ImprovedTopicScheduler           │    │
│  │  - 'riff': RiffSchedulerAdapter                    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  route(card, rating): 根据卡片类型选择调度器                │
│  getSchedulerType(card): 确定使用哪个调度器                 │
│  switchScheduler(card, newType): 切换调度器                 │
│  preview(card): 预览所有评分选项                            │
└─────────────────────────────────────────────────────────────┘
```

#### 4.1.1 调度器选择逻辑

**优先级**:
1. **卡片类型强制规则**: Topic 卡片 → A-Factor 系列
2. **用户覆盖配置**: 手动指定的调度器
3. **卡片自身配置**: card.schedulerType
4. **默认调度器**: 全局配置的默认值

```typescript
getSchedulerType(card: FSRSCard): SchedulerType {
  // 1. 强制规则：Topic 必须使用 A-Factor
  if (card.type === 'topic') {
    return this.schedulers.has('a-factor-v2') 
      ? 'a-factor-v2' 
      : 'a-factor';
  }
  
  // 2. 用户覆盖
  if (this.config.schedulerOverrides?.has(card.id)) {
    return this.config.schedulerOverrides.get(card.id)!;
  }
  
  // 3. 卡片自身配置
  if (card.schedulerType && this.schedulers.has(card.schedulerType)) {
    return card.schedulerType;
  }
  
  // 4. 默认调度器
  return this.config.defaultScheduler;
}
```

#### 4.1.2 调度器实现

##### FSRS v5 Scheduler

**算法**: Free Spaced Repetition Scheduler v5

**核心参数**:
```typescript
{
  requestRetention: 0.9,      // 目标记忆保持率
  maximumInterval: 36500,     // 最大间隔（天）
  weights: [...]              // 19 个权重参数
}
```

**状态转换**:
```
New (0) → Learning (1) → Review (2)
              ↓
         Relearning (3) → Review (2)
```

**评分映射**:
- Rating 1 (Again): 重新学习
- Rating 2 (Hard): 困难，缩短间隔
- Rating 3 (Good): 正常，标准间隔
- Rating 4 (Easy): 简单，延长间隔

##### A-Factor Scheduler (Topic 专用)

**算法**: SuperMemo A-Factor 算法

**核心参数**:
```typescript
{
  aFactor: 1.2 - 6.0,         // A-Factor 值
  interval: number,           // 当前间隔（天）
  repetitions: number         // 重复次数
}
```

**间隔计算**:
```
I(n) = I(n-1) * A-Factor
```

**A-Factor 调整**:
- Rating 1-2: A-Factor -= 0.2
- Rating 3: A-Factor 不变
- Rating 4: A-Factor += 0.1

##### SM-15 Scheduler

**算法**: SuperMemo 15 算法

**核心参数**:
```typescript
{
  aFactor: number,            // A-Factor
  uFactor: number,            // U-Factor (难度)
  interval: number,           // 间隔
  repetitions: number         // 重复次数
}
```

**特点**:
- 支持 U-Factor（难度因子）
- 更精细的间隔调整
- 支持状态迁移

### 4.2 调度器适配器

#### 4.2.1 RiffSchedulerAdapter

**职责**: 将 Riff API 调用封装为标准调度器接口

```typescript
class RiffSchedulerAdapter implements SchedulerEngineAdapter {
  async review(card: FSRSCard, rating: Rating): FSRSCard {
    // 1. 调用 Riff API
    await riff.reviewRiffCard(card.deckID, card.id, rating);
    
    // 2. 从 Riff API 获取更新后的数据
    const updated = await riff.getRiffCard(card.id);
    
    // 3. 转换为 FSRSCard 格式
    return this.convertToFSRSCard(updated);
  }
  
  preview(card: FSRSCard): Map<Rating, FSRSCard> {
    // 预览所有评分选项
    const previews = new Map();
    for (const rating of [1, 2, 3, 4]) {
      previews.set(rating, this.simulateReview(card, rating));
    }
    return previews;
  }
}
```

### 4.3 状态迁移系统

**场景**: 切换调度器时需要转换卡片状态

```typescript
// 从 A-Factor 切换到 FSRS
function migrateAFactorToFSRS(card: FSRSCard): FSRSCard {
  // A-Factor (1.2-6.0) → FSRS difficulty (1-10)
  const difficulty = 1 + ((card.aFactor - 1.2) / 4.8) * 9;
  
  // interval → stability
  const stability = card.scheduledDays || 2;
  
  return {
    ...card,
    difficulty,
    stability,
    schedulerType: 'fsrs-v5'
  };
}

// 从 FSRS 切换到 A-Factor
function migrateFSRSToAFactor(card: FSRSCard): FSRSCard {
  // FSRS difficulty (1-10) → A-Factor (1.2-6.0)
  const aFactor = 1.2 + ((card.difficulty - 1) / 9) * 4.8;
  
  return {
    ...card,
    aFactor,
    schedulerType: 'a-factor-v2'
  };
}
```

---


## 5. 数据流与同步

### 5.1 双向同步架构

```
┌─────────────────────────────────────────────────────────────┐
│                    思源 Riff 系统                            │
│  - 原生闪卡数据库                                            │
│  - 内置调度算法                                              │
│  - 复习记录                                                  │
└─────────────────────────────────────────────────────────────┘
                    ↕ 双向同步
┌─────────────────────────────────────────────────────────────┐
│              core/siyuan/riff.ts (API 封装)                  │
│  - getRiffDueCards(): 获取到期卡片                           │
│  - reviewRiffCard(): 提交复习结果                            │
│  - addRiffCards(): 添加卡片到 Riff                           │
│  - removeRiffCards(): 从 Riff 删除卡片                       │
└─────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────┐
│              core/storage/manager.ts (本地存储)              │
│  - FSRSCard 数据（扩展字段）                                 │
│  - 复习日志                                                  │
│  - 队列状态                                                  │
│  - 用户配置                                                  │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 数据同步策略

#### 5.2.1 读取优先级

**原则**: 本地数据优先，Riff 数据作为补充

```typescript
// RiffDataSource.mergeLocalNextDues()
async mergeLocalNextDues(riffItems: QueueItem[]): Promise<QueueItem[]> {
  // 1. 批量查询本地卡片
  const localCards = new Map<string, FSRSCard>();
  for (const item of riffItems) {
    const card = this.storage.getCard(item.cardID);
    if (card) {
      localCards.set(item.cardID, card);
    }
  }
  
  // 2. 合并数据（本地优先）
  return riffItems.map(item => {
    const localCard = localCards.get(item.cardID);
    if (!localCard) return item;
    
    // 优先使用本地的 nextDues
    return {
      ...item,
      nextDues: this.extractNextDues(localCard),  // 本地数据
      state: localCard.state,
      lapses: localCard.lapses,
      priority: localCard.priority ?? item.priority
    };
  });
}
```

#### 5.2.2 写入策略

**原则**: 双写（本地 + Riff），本地为主

```typescript
// SchedulerRouter.route()
async route(card: FSRSCard, rating: Rating): Promise<FSRSCard> {
  // 1. 使用调度器计算新状态
  const scheduler = this.getScheduler(card);
  const updatedCard = scheduler.review(card, rating);
  
  // 2. 保存到本地（必须）
  this.storage.setCard(updatedCard);
  await this.storage.saveCards();
  
  // 3. 同步到 Riff（可选，根据配置）
  if (this.config.enableRiffSync) {
    try {
      await riff.reviewRiffCard(card.deckID, card.id, rating);
    } catch (error) {
      // 同步失败不影响本地数据
      console.error('Riff sync failed:', error);
    }
  }
  
  return updatedCard;
}
```

#### 5.2.3 冲突解决

**场景**: 本地和 Riff 数据不一致

**策略**:
1. **读取时**: 本地数据优先
2. **写入时**: 双写，本地为准
3. **冲突时**: 使用最新的 `updatedAt` 时间戳

```typescript
function resolveConflict(local: FSRSCard, riff: RiffCard): FSRSCard {
  // 比较时间戳
  const localTime = local.updatedAt || 0;
  const riffTime = new Date(riff.lastReview).getTime();
  
  // 使用较新的数据
  return localTime > riffTime ? local : convertRiffToFSRS(riff);
}
```

### 5.3 黑名单机制

**目的**: 处理 Riff API 删除失败的情况

```typescript
// 删除失败时添加到黑名单
try {
  await riff.removeRiffCards(deckID, blockIds);
} catch (error) {
  // 添加到黑名单，下次加载时过滤
  for (const blockID of blockIds) {
    this.storage.addToRiffBlacklist(blockID);
  }
}

// 加载时过滤黑名单
const blacklist = this.storage.getRiffBlacklist();
const filtered = items.filter(item => !blacklist.has(item.blockID));
```

### 5.4 数据持久化

#### 5.4.1 存储结构

```
storage/
├── cards.json              # FSRSCard 数据
├── review-logs.json        # 复习日志
├── settings.json           # 用户配置
├── queue-retrieval-practice.json  # 提取练习队列
├── queue-final-drill.json         # 刻意练习队列
└── review-v2-final-drill.json     # 刻意练习进度
```

#### 5.4.2 FSRSCard 数据结构

```typescript
interface FSRSCard {
  // 基础字段
  id: string;                 // 卡片 ID
  blockID: string;            // 块 ID
  deckID: string;             // 牌组 ID
  
  // FSRS 字段
  state: CardState;           // 0=New, 1=Learning, 2=Review, 3=Relearning
  stability: number;          // 稳定性 (S)
  difficulty: number;         // 难度 (D) 1-10
  reps: number;               // 复习次数
  lapses: number;             // 遗忘次数
  lastReview: number;         // 上次复习时间戳
  due: number;                // 到期时间戳
  
  // Topic 字段
  type?: 'topic' | 'item';    // 卡片类型
  aFactor?: number;           // A-Factor (1.2-6.0)
  
  // 元数据
  priority: number;           // 优先级 (0-100)
  schedulerType?: SchedulerType;  // 调度器类型
  syncToRiff?: boolean;       // 是否同步到 Riff
  updatedAt: number;          // 更新时间戳
}
```

---


## 6. UI 层架构

### 6.1 Provider-Adapter 模式

**设计模式**: Adapter Pattern + Provider Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                      ReviewView.vue                          │
│  (通用复习界面，不关心具体队列类型)                           │
└─────────────────────────────────────────────────────────────┘
                    ↕ 标准接口
┌─────────────────────────────────────────────────────────────┐
│                   Provider Layer                             │
│  - RetrievalPracticeProvider                                 │
│  - FinalDrillProvider                                        │
│  - NeuralRoamProvider                                        │
│  (提供统一的队列访问接口)                                     │
└─────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────┐
│                   Adapter Layer                              │
│  - RetrievalPracticeAdapter                                  │
│  - FinalDrillAdapter                                         │
│  - NeuralRoamAdapter                                         │
│  (适配不同的 UI 显示需求)                                     │
└─────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────┐
│                   Queue Layer                                │
│  - RetrievalPracticeQueue                                    │
│  - FinalDrillQueue                                           │
│  - NeuralRoamQueue                                           │
│  (核心队列逻辑)                                               │
└─────────────────────────────────────────────────────────────┘
```

#### 6.1.1 QueueProvider 接口

```typescript
interface QueueProvider<TItem = any> {
  readonly id: string;
  readonly displayName: string;
  
  // 核心方法
  getDueCards(options: Record<string, unknown>): Promise<TItem[]>;
  reviewCard(cardId: string, rating: number, reviewedCards?: TItem[]): Promise<void>;
  skipReviewCard(cardId: string): Promise<void>;
  
  // 可选方法
  postponeCard?(cardId: string, days: number): Promise<void>;
  advanceCard?(cardId: string, days: number): Promise<void>;
  resetCard?(cardId: string): Promise<void>;
  setPriority?(cardId: string, priority: number): Promise<void>;
  
  // 统计
  getStats?(options?: Record<string, unknown>): Promise<QueueStats>;
}
```

**设计意图**:
- UI 层只需要知道这个接口
- 不同的队列类型实现相同的接口
- 支持运行时切换队列类型

#### 6.1.2 SessionManager (会话管理器)

**职责**: 管理复习会话的临时状态

```typescript
class SessionManager<TCard> {
  private sequencer: SortedSequencer<TCard>;
  private loaded = false;
  
  // 加载卡片到会话
  load(cards: TCard[]): void {
    this.sequencer.clear();
    this.sequencer.insertMany(cards);
    this.loaded = true;
  }
  
  // 获取下一张卡片
  async next(): Promise<TCard | null> {
    return await this.sequencer.next();
  }
  
  // 旋转卡片（失败时重新插入）
  rotate(card: TCard): void {
    this.sequencer.insert(card);
  }
  
  // 旋转并增加失败次数
  rotateWithLapse(card: TCard): void {
    (card as any).lapses = ((card as any).lapses || 0) + 1;
    this.sequencer.insert(card);
  }
  
  // 获取统计信息
  getStats(): SessionStats {
    const cards = this.sequencer.getAll();
    const lapses = cards.map(c => (c as any).lapses || 0);
    
    return {
      total: cards.length,
      avgLapses: lapses.reduce((a, b) => a + b, 0) / cards.length,
      maxLapses: Math.max(...lapses),
      cardsWithLapses: lapses.filter(l => l > 0).length
    };
  }
}
```

**使用场景**:
- RetrievalPracticeProvider: 管理提取练习会话
- FinalDrillProvider: 管理刻意练习会话
- 支持 SM-15 风格的失败处理

### 6.2 卡片浏览器架构

#### 6.2.1 组件结构

```
SRSBrowser.vue (1230 行)
├── BrowserToolbar.vue (152 行)
│   ├── 队列筛选
│   ├── 文档筛选
│   ├── 预设筛选
│   └── 搜索框
├── AG-Grid (卡片列表)
│   ├── 列定义
│   ├── 排序
│   ├── 筛选
│   └── 分页
└── BrowserPreview.vue (212 行)
    ├── 卡片预览
    ├── 元数据显示
    └── 操作按钮
```

#### 6.2.2 Composables 模式

**目的**: 将复杂逻辑抽取为可复用的组合式函数

```typescript
// composables/useSorting.ts (237 行)
export function useSorting(options: SortingOptions) {
  const sortBy = ref<SortField>('due');
  const sortOrder = ref<'asc' | 'desc'>('asc');
  
  const sortedCards = computed(() => {
    return sortCards(cards.value, sortBy.value, sortOrder.value);
  });
  
  function toggleSort(field: SortField) {
    if (sortBy.value === field) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy.value = field;
      sortOrder.value = 'asc';
    }
  }
  
  return { sortBy, sortOrder, sortedCards, toggleSort };
}

// composables/useCardActions.ts (169 行)
export function useCardActions(options: CardActionsOptions) {
  async function reviewCard(cardId: string, rating: number) {
    // 复习逻辑
  }
  
  async function deleteCard(cardId: string) {
    // 删除逻辑
  }
  
  async function setPriority(cardId: string, priority: number) {
    // 设置优先级逻辑
  }
  
  return { reviewCard, deleteCard, setPriority };
}
```

#### 6.2.3 四重筛选系统

```
┌─────────────────────────────────────────────────────────────┐
│                    筛选层级                                   │
│                                                              │
│  1. 队列筛选 (Queue Filter)                                  │
│     - 全部卡片                                               │
│     - 到期卡片                                               │
│     - 新卡片                                                 │
│     - 学习中                                                 │
│                                                              │
│  2. 文档筛选 (Document Filter)                               │
│     - 当前文档                                               │
│     - 当前笔记本                                             │
│     - 全部文档                                               │
│                                                              │
│  3. 预设筛选 (Preset Filter)                                 │
│     - 困难卡片 (lapses > 3)                                  │
│     - 高优先级 (priority > 70)                               │
│     - 最近复习                                               │
│                                                              │
│  4. 搜索筛选 (Search Filter)                                 │
│     - 全文搜索                                               │
│     - 标签搜索                                               │
│     - ID 搜索                                                │
└─────────────────────────────────────────────────────────────┘
```

**实现**:
```typescript
const filteredCards = computed(() => {
  let result = allCards.value;
  
  // 1. 队列筛选
  result = applyQueueFilter(result, queueFilter.value);
  
  // 2. 文档筛选
  result = applyDocumentFilter(result, documentFilter.value);
  
  // 3. 预设筛选
  result = applyPresetFilter(result, presetFilter.value);
  
  // 4. 搜索筛选
  result = applySearchFilter(result, searchQuery.value);
  
  return result;
});
```

---


## 7. 服务层设计

### 7.1 服务层职责

**设计原则**: 单一职责 + 无状态

```
┌─────────────────────────────────────────────────────────────┐
│                      服务层                                   │
│                                                              │
│  ReviewDialogManager    - 管理复习对话框的创建/销毁          │
│  BlockMenuHandler       - 处理块菜单事件                     │
│  MenuService            - 管理顶栏菜单                       │
│  CardService            - 卡片 CRUD 操作                     │
│  DialogService          - 对话框创建服务                     │
│                                                              │
│  特点:                                                       │
│  - 无状态（不保存数据）                                      │
│  - 纯协调逻辑                                                │
│  - 依赖注入                                                  │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 ReviewDialogManager

**职责**: 统一管理所有复习对话框

```typescript
class ReviewDialogManager {
  private reviewDialog: { dialog: any; destroy: () => void } | null = null;
  
  constructor(private deps: ReviewDialogManagerDeps) {}
  
  // 销毁当前对话框（单例模式）
  destroyCurrentDialog(): void {
    if (this.reviewDialog) {
      this.reviewDialog.destroy();
      this.reviewDialog = null;
    }
  }
  
  // 打开提取练习
  async openRetrievalPractice(): Promise<void> {
    this.destroyCurrentDialog();
    
    const provider = await RetrievalPracticeProvider.create({
      storage: this.deps.storage,
      scheduler: this.deps.scheduler
    });
    
    const adapter = new RetrievalPracticeAdapter({
      i18n: this.deps.i18n
    });
    
    this.createDialog({
      title: provider.displayName,
      provider,
      adapter
    });
  }
  
  // 打开刻意练习
  async openFinalDrill(): Promise<void> {
    this.destroyCurrentDialog();
    
    const provider = new FinalDrillProvider({
      queue: this.deps.finalDrillQueue,
      storage: this.deps.storage,
      i18n: this.deps.i18n
    });
    
    await provider.init();
    
    const adapter = new FinalDrillAdapter({
      i18n: this.deps.i18n
    });
    
    this.createDialog({
      title: provider.displayName,
      provider,
      adapter
    });
  }
  
  // ... 其他复习模式
}
```

**设计优势**:
- 单例模式：同时只能打开一个复习对话框
- 统一管理：所有对话框创建逻辑集中
- 依赖注入：通过构造函数注入依赖

### 7.3 BlockMenuHandler

**职责**: 处理块菜单相关的事件

```typescript
class BlockMenuHandler {
  constructor(private deps: BlockMenuHandlerDeps) {}
  
  // 处理块图标点击
  handleBlockIconClick(e: any): void {
    const blockElements = e.detail.blockElements;
    const menu = e.detail.menu;
    
    // 添加菜单项
    menu.addItem({
      icon: 'iconRiffCard',
      label: '块练习',
      click: async () => {
        const cards = this.buildDrillCardsFromElements(blockElements);
        this.deps.reviewDialogManager.openDrillWithCards(cards, 'block');
      }
    });
    
    menu.addItem({
      icon: 'iconRefresh',
      label: '从此处开始神经复习',
      click: async () => {
        const seedBlockId = blockElements[0].getAttribute('data-node-id');
        await this.deps.openNeuralReviewDialog({ seedBlockId });
      }
    });
    
    // ... 其他菜单项
  }
  
  // 从 DOM 元素构建练习卡片
  buildDrillCardsFromElements(elements: HTMLElement[]): QueueItem[] {
    const result: QueueItem[] = [];
    
    for (const el of elements) {
      const blockID = el.getAttribute('data-node-id');
      const cardID = el.getAttribute('custom-card-id');
      
      if (blockID && cardID) {
        result.push({
          cardID,
          blockID,
          deckID: riff.BUILTIN_DECK_ID,
          priority: DEFAULT_PRIORITY,
          nextDues: { 1: '', 2: '', 3: '', 4: '' }
        });
      }
    }
    
    return result;
  }
  
  // 从文档树获取练习卡片
  async getDrillCardsFromDocTree(docId: string): Promise<QueueItem[]> {
    const blockIds = await getCardBlockIds({ type: 'tree', value: docId });
    return this.buildDrillCardsFromBlockIds(blockIds);
  }
}
```

**设计优势**:
- 职责单一：只处理块菜单相关逻辑
- 可测试：依赖注入，易于单元测试
- 可复用：方法可以被其他服务调用

### 7.4 依赖注入模式

**目的**: 解耦服务之间的依赖关系

```typescript
// 定义依赖接口
interface ReviewDialogManagerDeps {
  app: App;
  i18n: Record<string, string>;
  storage: StorageManager;
  scheduler: SchedulerEngineAdapter;
  finalDrillQueue: FinalDrillQueue;
  filterGroupQueue: FilterGroupQueue;
  incrementalQueue: IncrementalLearningQueue;
  isInitialized: () => boolean;
}

// 在插件入口注入依赖
class FSRSPlugin extends Plugin {
  async onload() {
    // 初始化核心模块
    this.storage = new StorageManager(this.name);
    this.scheduler = createScheduler(settings.fsrs);
    this.finalDrillQueue = new FinalDrillQueue(this.storage);
    
    // 创建服务（注入依赖）
    this.reviewDialogManager = new ReviewDialogManager({
      app: this.app,
      i18n: this.i18n,
      storage: this.storage,
      scheduler: this.scheduler,
      finalDrillQueue: this.finalDrillQueue,
      filterGroupQueue: this.filterGroupQueue,
      incrementalQueue: this.incrementalQueue,
      isInitialized: () => this.isInitialized
    });
    
    this.blockMenuHandler = new BlockMenuHandler({
      app: this.app,
      i18n: this.i18n,
      storage: this.storage,
      reviewDialogManager: this.reviewDialogManager,
      xiuyuanService: this.xiuyuanService,
      openCreateTemplateCardDialog: (blockIds) => 
        this.openCreateTemplateCardDialogWithBlockIds(blockIds),
      openNeuralReviewDialog: (options) => 
        this.reviewDialogManager.openNeuralRoam(options)
    });
  }
}
```

**优势**:
- 解耦：服务不直接依赖具体实现
- 可测试：可以注入 mock 对象
- 灵活：可以在运行时替换依赖

---


## 8. 设计模式总结

### 8.1 使用的设计模式

| 模式 | 应用场景 | 示例 |
|------|----------|------|
| **Strategy Pattern** | 调度器选择 | SchedulerRouter |
| **Composite Pattern** | 队列组合 | BaseCompositeQueue |
| **Adapter Pattern** | UI 适配 | RetrievalPracticeAdapter |
| **Provider Pattern** | 队列访问 | QueueProvider |
| **Factory Pattern** | 对象创建 | RetrievalPracticeQueue.create() |
| **Singleton Pattern** | 对话框管理 | ReviewDialogManager |
| **Dependency Injection** | 服务依赖 | 所有服务类 |
| **Trait/Mixin Pattern** | 能力扩展 | IQueueTrait |
| **Observer Pattern** | 事件监听 | TransactionObserver |
| **Template Method** | 算法框架 | BaseCompositeQueue |

### 8.2 关键设计决策

#### 8.2.1 为什么使用复合队列模式？

**问题**: 不同队列类型有大量重复代码

**解决方案**: 将队列分解为可插拔的组件

**优势**:
- 代码复用：共享基础逻辑
- 灵活组合：可以自由组合不同组件
- 易于扩展：添加新队列类型只需组合现有组件

**示例**:
```typescript
// 提取练习队列 = FSRS 调度器 + 优先级排序 + 混合数据源
const retrievalQueue = new BaseCompositeQueue({
  scheduler: new RiffScheduler(),
  sequencer: new PrioritySequencer(),
  dataSource: new HybridDataSource(),
  traits: [MutableTrait, RemovableTrait]
});

// 神经漫游队列 = 无调度器 + 图遍历排序 + 图数据源
const neuralQueue = new BaseCompositeQueue({
  scheduler: null,
  sequencer: new GraphSequencer(),
  dataSource: new GraphDataSource(),
  traits: []
});
```

#### 8.2.2 为什么使用 Provider-Adapter 模式？

**问题**: UI 层需要适配不同的队列类型

**解决方案**: 
- Provider: 提供统一的数据访问接口
- Adapter: 适配不同的 UI 显示需求

**优势**:
- UI 解耦：UI 层不需要知道具体队列实现
- 可替换：可以在运行时切换队列类型
- 可测试：可以 mock Provider 进行测试

#### 8.2.3 为什么使用 SessionManager？

**问题**: Provider 需要管理复习会话的临时状态

**解决方案**: 抽取 SessionManager 管理会话状态

**优势**:
- 职责分离：Provider 专注于业务逻辑
- 可复用：多个 Provider 可以共享 SessionManager
- 易于测试：SessionManager 可以独立测试

#### 8.2.4 为什么使用 Trait 系统？

**问题**: 不同队列需要不同的能力（可变、可删除、可优先级等）

**解决方案**: 使用 Trait 系统动态添加能力

**优势**:
- 灵活：可以按需添加能力
- 解耦：能力独立于队列实现
- 可发现：可以在运行时检查队列是否支持某个能力

**示例**:
```typescript
// 检查队列是否支持插入
if (queue.hasTrait('mutable')) {
  const mutableTrait = queue.getTrait<IMutableTrait>('mutable');
  await mutableTrait.insertAt(items, 0);
}

// 检查队列是否支持删除
if (queue.hasTrait('removable')) {
  const removableTrait = queue.getTrait<IRemovableTrait>('removable');
  await removableTrait.removeItems(items);
}
```

### 8.3 架构演进

#### 8.3.1 V1 → V2 重构

**V1 架构问题**:
- 代码重复：每个队列都有相似的逻辑
- 难以扩展：添加新队列需要大量代码
- 耦合严重：UI 层直接依赖具体队列实现

**V2 架构改进**:
- 引入复合队列模式
- 引入 Provider-Adapter 模式
- 引入 SessionManager
- 引入 Trait 系统

**重构成果**:
- 代码减少 40%+
- 新增队列类型只需 50 行代码
- UI 层完全解耦

#### 8.3.2 服务层重构

**重构前**: 所有逻辑在 index.ts (1735 行)

**重构后**: 拆分为多个服务
- index.ts: 1044 行 (-40%)
- ReviewDialogManager: 300 行
- BlockMenuHandler: 250 行
- MenuService: 150 行

**优势**:
- 可维护性提升
- 可测试性提升
- 职责更清晰

---


## 9. 关键约束与原则

### 9.1 架构契约

#### 9.1.1 数据源唯一性

**原则**: 思源 API 封装层是唯一的数据出入口

**禁止**:
```typescript
// ❌ 错误：UI 层直接调用思源 API
async function deleteCard(cardId: string) {
  await fetch('/api/attr/setBlockAttrs', {
    method: 'POST',
    body: JSON.stringify({ id: blockId, attrs: {} })
  });
}
```

**正确**:
```typescript
// ✅ 正确：通过 API 封装层
async function deleteCard(cardId: string) {
  await unmarkBlockAsCard(blockId);  // core/siyuan/block.ts
}
```

**原因**:
- 统一错误处理
- 统一日志记录
- 便于测试和 mock
- 便于迁移到其他平台

#### 9.1.2 不可变状态通信

**原则**: 队列引擎与调度器通过不可变对象通信

**禁止**:
```typescript
// ❌ 错误：直接修改卡片对象
function schedule(card: FSRSCard, rating: number): FSRSCard {
  card.due = Date.now() + 86400000;  // 直接修改
  card.reps += 1;
  return card;
}
```

**正确**:
```typescript
// ✅ 正确：返回新对象
function schedule(card: FSRSCard, rating: number): FSRSCard {
  return {
    ...card,
    due: Date.now() + 86400000,
    reps: card.reps + 1
  };
}
```

**原因**:
- 避免副作用
- 便于调试和追踪
- 支持时间旅行调试
- 支持撤销/重做

#### 9.1.3 快照驱动

**原则**: 所有复习模式基于同一张卡片状态快照

**实现**:
```typescript
// 1. 加载时获取快照
const snapshot = await storage.getCard(cardId);

// 2. 传递快照给调度器
const updated = await scheduler.schedule(snapshot, rating);

// 3. 保存更新后的快照
await storage.setCard(updated);
```

**原因**:
- 避免并发问题
- 保证数据一致性
- 支持离线操作

### 9.2 代码规范

#### 9.2.1 Vue 组件规范

**禁止重复声明**:
```typescript
// ❌ 错误：重复声明
<script setup>
function handleClick() { }
const handleClick = () => { }  // 重复声明
</script>
```

**Composables 模式**:
```typescript
// ✅ 正确：抽取为 composable
// composables/useCardActions.ts
export function useCardActions() {
  function handleClick() { }
  return { handleClick };
}

// 组件中使用
<script setup>
const { handleClick } = useCardActions();
</script>
```

**样式分离**:
```typescript
// ✅ 正确：大组件样式抽取到独立文件
<style src="./SRSBrowser.scss" scoped></style>
```

#### 9.2.2 命名约定

| 类型 | 命名规则 | 示例 |
|------|----------|------|
| 队列策略 | `XxxQueue.ts` | `RetrievalPracticeQueue.ts` |
| 数据源 | `XxxDataSource.ts` | `RiffDataSource.ts` |
| 适配器 | `XxxAdapter.ts` | `RetrievalPracticeAdapter.ts` |
| 提供者 | `XxxProvider.ts` | `RetrievalPracticeProvider.ts` |
| 服务 | `XxxService.ts` | `CardService.ts` |
| 管理器 | `XxxManager.ts` | `ReviewDialogManager.ts` |
| 处理器 | `XxxHandler.ts` | `BlockMenuHandler.ts` |

#### 9.2.3 文件组织

**原则**: 按功能模块组织，而非按类型

**禁止**:
```
src/
├── components/
│   ├── Button.vue
│   ├── Card.vue
│   └── Dialog.vue
├── services/
│   ├── CardService.ts
│   └── DialogService.ts
└── utils/
    ├── cardUtils.ts
    └── dialogUtils.ts
```

**正确**:
```
src/
├── ui/
│   ├── browser/
│   │   ├── SRSBrowser.vue
│   │   ├── composables/
│   │   └── utils/
│   └── review/
│       ├── ReviewView.vue
│       ├── adapters/
│       └── providers/
└── core/
    ├── queue/
    │   ├── strategies/
    │   ├── datasource/
    │   └── sequencers/
    └── scheduler/
        ├── strategies/
        └── adapters/
```

### 9.3 性能约束

#### 9.3.1 批量操作

**原则**: 避免循环中的异步操作

**禁止**:
```typescript
// ❌ 错误：循环中的异步操作
for (const blockId of blockIds) {
  const cardType = await getCardType(blockId);  // N 次查询
}
```

**正确**:
```typescript
// ✅ 正确：批量查询
const cardTypes = await batchGetCardTypes(blockIds);  // 1 次查询
for (const blockId of blockIds) {
  const cardType = cardTypes.get(blockId);
}
```

#### 9.3.2 缓存策略

**原则**: 合理使用缓存，避免重复计算

**示例**:
```typescript
class PrioritySequencer<TItem> {
  private items: TItem[] = [];
  private loaded = false;
  
  async next(): Promise<TItem | null> {
    // 只在第一次加载
    if (!this.loaded) {
      this.loaded = true;
      const fetched = await this.fetchAll();
      this.items.push(...fetched);
      this.items.sort(this.compareFn);
    }
    
    return this.items.shift() || null;
  }
  
  // 重置缓存
  reset(): void {
    this.loaded = false;
    this.items.length = 0;
  }
}
```

#### 9.3.3 内存管理

**原则**: 及时清理不再使用的资源

**示例**:
```typescript
class ReviewDialogManager {
  private reviewDialog: { dialog: any; destroy: () => void } | null = null;
  
  destroyCurrentDialog(): void {
    if (this.reviewDialog) {
      this.reviewDialog.destroy();  // 清理 Vue 实例
      this.reviewDialog = null;     // 释放引用
    }
  }
}
```

---


## 10. 扩展指南

### 10.1 添加新的队列类型

**步骤**:

1. **定义队列策略**:
```typescript
// src/core/queue/strategies/MyCustomQueue.ts
export class MyCustomQueue extends BaseCompositeQueue<QueueItem> {
  static async create(options: MyCustomQueueOptions) {
    // 1. 创建数据源
    const dataSource = new MyCustomDataSource(options);
    
    // 2. 创建排序器
    const sequencer = new SortedSequencer({
      getDueMs: (item) => item.due,
      getPriority: (item) => item.priority
    });
    
    // 3. 创建调度器（可选）
    const scheduler = new RiffScheduler(async (card, grade) => {
      await riff.reviewRiffCard(card.deckID, card.cardID, grade);
      return card;
    });
    
    // 4. 创建特性（可选）
    const traits = [
      createMutableTrait(dataSource),
      createRemovableTrait(dataSource)
    ];
    
    // 5. 组合队列
    return new MyCustomQueue({
      scheduler,
      sequencer,
      dataSource,
      traits,
      uiConfig: {
        statsType: 'queue-size',
        showRatingButtons: true,
        allowSkip: true
      }
    });
  }
}
```

2. **创建 Provider**:
```typescript
// src/ui/review/v2/providers/MyCustomProvider.ts
export class MyCustomProvider implements QueueProvider<BrowserCard> {
  readonly id = 'my-custom';
  readonly displayName = '自定义队列';
  
  private readonly queue: MyCustomQueue;
  private readonly session: SessionManager<BrowserCard>;
  
  constructor(queue: MyCustomQueue) {
    this.queue = queue;
    this.session = new SessionManager({
      getDueMs: (card) => card.due,
      getPriority: (card) => card.priority
    });
  }
  
  async getDueCards(): Promise<BrowserCard[]> {
    if (!this.session.isLoaded()) {
      const cards = await this.queue.getAllCards();
      this.session.load(cards);
    }
    return this.session.getAll();
  }
  
  async reviewCard(cardId: string, rating: number): Promise<void> {
    const card = this.session.find(c => c.cardID === cardId);
    if (!card) return;
    
    this.session.remove(c => c.cardID === cardId);
    
    if (rating < 3) {
      this.session.rotate(card);
    }
    
    await this.queue.onFeedback(card, { action: 'rate', rating });
  }
  
  async skipReviewCard(cardId: string): Promise<void> {
    const card = this.session.find(c => c.cardID === cardId);
    if (!card) return;
    
    this.session.remove(c => c.cardID === cardId);
    this.session.rotate(card);
    
    await this.queue.onFeedback(card, { action: 'skip' });
  }
}
```

3. **创建 Adapter**:
```typescript
// src/ui/review/v2/adapters/MyCustomAdapter.ts
export class MyCustomAdapter {
  constructor(private options: { i18n: Record<string, string> }) {}
  
  getTitle(): string {
    return this.options.i18n.myCustomTitle || '自定义队列';
  }
  
  getStats(stats: any): string {
    return `${stats.remaining} 张待复习`;
  }
  
  getRatingLabels(): Record<number, string> {
    return {
      1: '重来',
      2: '困难',
      3: '一般',
      4: '简单'
    };
  }
}
```

4. **注册到 ReviewDialogManager**:
```typescript
// src/services/ReviewDialogManager.ts
async openMyCustomQueue(): Promise<void> {
  this.destroyCurrentDialog();
  
  const queue = await MyCustomQueue.create({ /* options */ });
  const provider = new MyCustomProvider(queue);
  const adapter = new MyCustomAdapter({ i18n: this.deps.i18n });
  
  this.createDialog({
    title: provider.displayName,
    provider,
    adapter
  });
}
```

### 10.2 添加新的调度器

**步骤**:

1. **实现调度器接口**:
```typescript
// src/core/scheduler/strategies/MyCustomScheduler.ts
export class MyCustomScheduler implements SchedulerEngineAdapter {
  constructor(private params: MyCustomParams) {}
  
  review(card: FSRSCard, rating: Rating): FSRSCard {
    // 实现调度算法
    const interval = this.calculateInterval(card, rating);
    const due = Date.now() + interval * 86400000;
    
    return {
      ...card,
      due,
      reps: card.reps + 1,
      lastReview: Date.now(),
      schedulerType: 'my-custom'
    };
  }
  
  preview(card: FSRSCard): Map<Rating, FSRSCard> {
    const previews = new Map();
    for (const rating of [1, 2, 3, 4] as Rating[]) {
      previews.set(rating, this.review(card, rating));
    }
    return previews;
  }
  
  updateParams(params: MyCustomParams): void {
    this.params = params;
  }
  
  private calculateInterval(card: FSRSCard, rating: Rating): number {
    // 实现间隔计算逻辑
    return 1;
  }
}
```

2. **注册到 SchedulerRouter**:
```typescript
// src/core/scheduler/SchedulerRouter.ts
private _initializeSchedulers(): void {
  // ... 现有调度器
  
  // 添加新调度器
  this.schedulers.set('my-custom', new MyCustomScheduler(this.config.params));
}
```

3. **添加类型定义**:
```typescript
// src/core/scheduler/SchedulerRouter.ts
export type SchedulerType = 
  | 'fsrs-v5' 
  | 'sm2' 
  | 'sm15' 
  | 'a-factor' 
  | 'a-factor-v2' 
  | 'riff'
  | 'my-custom';  // 添加新类型
```

### 10.3 添加新的数据源

**步骤**:

1. **实现数据源接口**:
```typescript
// src/core/queue/datasource/MyCustomDataSource.ts
export class MyCustomDataSource implements IDataSource<QueueItem> {
  constructor(private options: MyCustomDataSourceOptions) {}
  
  async getAll(): Promise<QueueItem[]> {
    // 从自定义来源获取数据
    const data = await this.fetchData();
    
    // 转换为 QueueItem 格式
    return data.map(item => ({
      cardID: item.id,
      blockID: item.blockId,
      deckID: item.deckId,
      priority: item.priority || 50,
      nextDues: item.nextDues,
      state: item.state,
      lapses: item.lapses,
      reps: item.reps
    }));
  }
  
  async add(items: QueueItem[]): Promise<number> {
    // 实现添加逻辑
    return items.length;
  }
  
  async remove(items: QueueItem[]): Promise<number> {
    // 实现删除逻辑
    return items.length;
  }
  
  private async fetchData(): Promise<any[]> {
    // 实现数据获取逻辑
    return [];
  }
}
```

2. **在队列中使用**:
```typescript
const dataSource = new MyCustomDataSource({
  /* options */
});

const queue = new BaseCompositeQueue({
  scheduler: new RiffScheduler(),
  sequencer: new SortedSequencer(),
  dataSource: dataSource,  // 使用自定义数据源
  traits: []
});
```

### 10.4 添加新的 Trait

**步骤**:

1. **定义 Trait 接口**:
```typescript
// src/core/queue/abstraction/types.ts
export interface IMyCustomTrait<TItem> extends IQueueTrait {
  id: 'my-custom';
  myCustomMethod(item: TItem, param: any): Promise<void>;
}
```

2. **实现 Trait**:
```typescript
// src/core/queue/traits/MyCustomTrait.ts
export function createMyCustomTrait<TItem>(
  dataSource: IDataSource<TItem>
): IMyCustomTrait<TItem> {
  return {
    id: 'my-custom',
    async myCustomMethod(item: TItem, param: any): Promise<void> {
      // 实现自定义逻辑
    }
  };
}
```

3. **在队列中使用**:
```typescript
const myCustomTrait = createMyCustomTrait(dataSource);

const queue = new BaseCompositeQueue({
  scheduler: new RiffScheduler(),
  sequencer: new SortedSequencer(),
  dataSource: dataSource,
  traits: [myCustomTrait]  // 添加自定义 Trait
});

// 使用 Trait
if (queue.hasTrait('my-custom')) {
  const trait = queue.getTrait<IMyCustomTrait>('my-custom');
  await trait.myCustomMethod(item, param);
}
```

---

## 11. 总结

### 11.1 架构特点

1. **多层抽象**: 5 层抽象（数据层、组件层、策略层、会话层、扩展层）
2. **可插拔组件**: 调度器、排序器、数据源、特性都可以独立替换
3. **设计模式丰富**: 使用了 10+ 种设计模式
4. **高度解耦**: UI 层、服务层、核心层完全解耦
5. **易于扩展**: 添加新功能只需实现标准接口

### 11.2 代码规模

- **总文件数**: 218 个 TypeScript 文件
- **总代码行数**: 约 30,000+ 行
- **核心层**: 约 15,000 行
- **UI 层**: 约 10,000 行
- **服务层**: 约 2,000 行
- **测试代码**: 约 3,000 行

### 11.3 技术栈

- **语言**: TypeScript 5.x
- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite
- **UI 库**: AG-Grid v35+
- **测试框架**: Vitest
- **代码规范**: ESLint + Prettier

### 11.4 未来方向

1. **性能优化**: 
   - 虚拟滚动优化
   - 批量操作优化
   - 缓存策略优化

2. **功能扩展**:
   - 更多调度算法
   - 更多复习模式
   - 更多数据源

3. **架构演进**:
   - 微前端架构
   - 插件系统
   - 云同步支持

---

**文档版本**: v1.0  
**最后更新**: 2026-02-01  
**维护者**: AI + 开发团队

