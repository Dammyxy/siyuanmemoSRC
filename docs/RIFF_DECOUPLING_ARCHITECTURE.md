# Riff 解耦架构方案

## 目标

将 Riff 从核心调度逻辑中解耦，使其仅作为数据来源之一，为将来支持官方 Riff 后端调度器留下接口。

## 当前数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                      思源笔记 Riff 系统                          │
│  - 原生闪卡数据库 (Go 实现)                                      │
│  - 内置调度算法                                                  │
│  - 复习记录                                                      │
└─────────────────────────────────────────────────────────────────┘
                    ↕ 双向同步（紧耦合）
┌─────────────────────────────────────────────────────────────────┐
│              core/siyuan/riff.ts (API 封装)                      │
│  - getRiffDueCards(): 获取到期卡片                               │
│  - reviewRiffCard(): 提交复习结果 ⚠️ 依赖 Riff 调度              │
│  - addRiffCards(): 添加卡片到 Riff                               │
└─────────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────────┐
│              RiffDataSource (数据源层)                           │
│  - 从 Riff API 获取卡片                                          │
│  - 合并本地 nextDues                                             │
│  - 过滤 Topic 卡片                                               │
└─────────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────────┐
│              SchedulerRouter (调度器路由)                        │
│  - FSRS v5/v6 调度器                                             │
│  - SM-15 调度器                                                  │
│  - A-Factor 调度器                                               │
│  - RiffSchedulerAdapter ⚠️ 调用 Riff API 进行调度                │
└─────────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────────┐
│              Queue System (队列系统)                             │
│  - RetrievalPracticeQueue                                        │
│  - FinalDrillQueue                                               │
│  - NeuralRoamQueue                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 问题分析

1. **紧耦合**: `reviewRiffCard()` 既提交数据又依赖 Riff 的调度算法
2. **无法独立**: 无法在不使用 Riff 调度的情况下使用 Riff 数据
3. **扩展困难**: 将来官方更新 Riff 算法时，难以切换

## 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      思源笔记 Riff 系统                          │
│  - 原生闪卡数据库 (Go 实现)                                      │
│  - 内置调度算法 (可选使用)                                       │
│  - 复习记录                                                      │
└─────────────────────────────────────────────────────────────────┘
                    ↕ 单向数据流（解耦）
┌─────────────────────────────────────────────────────────────────┐
│              core/siyuan/riff.ts (API 封装)                      │
│  ✅ getRiffCards(): 获取所有卡片（不限到期）                      │
│  ✅ getRiffDueCards(): 获取到期卡片（兼容）                       │
│  ✅ updateRiffCard(): 更新卡片数据（不调度）                      │
│  ✅ addRiffCards(): 添加卡片                                     │
│  ✅ removeRiffCards(): 删除卡片                                  │
│  🆕 syncToRiff(): 同步本地数据到 Riff（可选）                    │
└─────────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────────┐
│              DataSource Layer (数据源层)                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  RiffDataSource (Riff 数据源)                             │  │
│  │  - 从 Riff 获取卡片列表                                   │  │
│  │  - 增量更新新卡片                                         │  │
│  │  - 不依赖 Riff 调度                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  StorageDataSource (本地存储数据源)                       │  │
│  │  - 本地卡片数据                                           │  │
│  │  - 复习历史                                               │  │
│  │  - 调度状态                                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  HybridDataSource (混合数据源)                            │  │
│  │  - 合并 Riff + Local                                      │  │
│  │  - 本地数据优先                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────────┐
│              SchedulerRouter (调度器路由)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  本地调度器（默认）                                        │  │
│  │  - FSRS v5/v6                                             │  │
│  │  - SM-15                                                  │  │
│  │  - A-Factor                                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🆕 RiffSchedulerAdapter (Riff 调度器适配器 - 可选)        │  │
│  │  - 调用 Riff API 进行调度                                 │  │
│  │  - 仅在"简单模式"下使用                                   │  │
│  │  - 不增加新卡片数据                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────────────────────┐
│              Queue System (队列系统)                             │
│  - RetrievalPracticeQueue                                        │
│  - FinalDrillQueue                                               │
│  - NeuralRoamQueue                                               │
└─────────────────────────────────────────────────────────────────┘
```

## 核心改动

### 1. Riff API 层重构

#### 当前 API

```typescript
// ❌ 紧耦合：既提交数据又依赖 Riff 调度
async function reviewRiffCard(
  deckID: string,
  cardID: string,
  rating: Rating
): Promise<void> {
  // 调用 Riff API，依赖 Riff 的调度算法
  await fetch('/api/riff/reviewCard', {
    body: JSON.stringify({ deckID, cardID, rating })
  });
}
```

#### 新 API

```typescript
// ✅ 解耦：只获取数据，不调度
async function getRiffCards(
  deckID: string,
  options?: {
    dueOnly?: boolean;      // 是否只获取到期卡片
    notebook?: string;      // 笔记本过滤
    rootID?: string;        // 根块过滤
    includeNew?: boolean;   // 是否包含新卡片
  }
): Promise<RiffCard[]> {
  // 从 Riff 获取卡片列表（不调度）
  const response = await fetch('/api/riff/getCards', {
    body: JSON.stringify({ deckID, ...options })
  });
  return response.json();
}

// ✅ 解耦：只更新数据，不调度
async function updateRiffCard(
  deckID: string,
  cardID: string,
  updates: Partial<RiffCard>
): Promise<void> {
  // 更新卡片数据（不调度）
  await fetch('/api/riff/updateCard', {
    body: JSON.stringify({ deckID, cardID, updates })
  });
}

// 🆕 可选：同步本地数据到 Riff
async function syncToRiff(
  deckID: string,
  card: FSRSCard
): Promise<void> {
  // 将本地调度结果同步到 Riff
  await updateRiffCard(deckID, card.id, {
    due: card.due,
    state: card.state,
    lapses: card.lapses,
    reps: card.reps,
    lastReview: card.lastReview,
  });
}

// 🆕 增量更新：获取新增的卡片
async function getRiffNewCards(
  deckID: string,
  since?: number  // 时间戳，获取此时间之后新增的卡片
): Promise<RiffCard[]> {
  const response = await fetch('/api/riff/getNewCards', {
    body: JSON.stringify({ deckID, since })
  });
  return response.json();
}
```

### 2. RiffDataSource 重构

#### 当前实现

```typescript
class RiffDataSource extends ObservableDataSource<QueueItem> {
  async getAll(): Promise<QueueItem[]> {
    // ❌ 只能获取到期卡片
    const data = await getRiffDueCards(this.deckId);
    // ...
  }
}
```

#### 新实现

```typescript
class RiffDataSource extends ObservableDataSource<QueueItem> {
  private lastSyncTime: number = 0;
  
  constructor(options: RiffDataSourceOptions) {
    super();
    this.deckId = options.deckId;
    this.mode = options.mode || 'due-only';  // 'due-only' | 'all' | 'incremental'
    // ...
  }
  
  async getAll(): Promise<QueueItem[]> {
    let riffCards: RiffCard[];
    
    switch (this.mode) {
      case 'all':
        // ✅ 获取所有卡片（不限到期）
        riffCards = await getRiffCards(this.deckId, {
          dueOnly: false,
          includeNew: true
        });
        break;
        
      case 'incremental':
        // ✅ 增量更新：只获取新增的卡片
        riffCards = await getRiffNewCards(this.deckId, this.lastSyncTime);
        this.lastSyncTime = Date.now();
        break;
        
      case 'due-only':
      default:
        // ✅ 兼容模式：只获取到期卡片
        riffCards = await getRiffCards(this.deckId, {
          dueOnly: true
        });
        break;
    }
    
    // 转换为 QueueItem
    let items = riffCards.map(card => this.convertToQueueItem(card));
    
    // 合并本地数据（本地优先）
    if (this.storage) {
      items = await this.mergeLocalData(items);
    }
    
    // 过滤 Topic 卡片
    items = await this.filterTopicCards(items);
    
    return items;
  }
  
  // 🆕 合并本地数据（本地优先）
  private async mergeLocalData(items: QueueItem[]): Promise<QueueItem[]> {
    const localCards = new Map<string, FSRSCard>();
    
    for (const item of items) {
      const localCard = this.storage.getCard(item.cardID);
      if (localCard) {
        localCards.set(item.cardID, localCard);
      }
    }
    
    return items.map(item => {
      const localCard = localCards.get(item.cardID);
      if (!localCard) return item;
      
      // 本地数据优先
      return {
        ...item,
        due: localCard.due,
        state: localCard.state,
        lapses: localCard.lapses,
        reps: localCard.reps,
        lastReview: localCard.lastReview,
        priority: localCard.priority ?? item.priority,
        // 使用本地的 nextDues
        nextDues: this.extractNextDues(localCard),
      };
    });
  }
}
```

### 3. SchedulerRouter 重构

#### 新增配置选项

```typescript
interface SchedulerRouterConfig {
  // 现有配置
  defaultScheduler: SchedulerType;
  schedulerOverrides?: Map<string, SchedulerType>;
  
  // 🆕 Riff 集成配置
  riffIntegration?: {
    mode: 'disabled' | 'data-only' | 'full-scheduler';
    syncToRiff?: boolean;  // 是否同步本地调度结果到 Riff
    useRiffScheduler?: boolean;  // 是否使用 Riff 调度器（简单模式）
  };
}
```

#### 调度流程

```typescript
class SchedulerRouter {
  async route(card: FSRSCard, rating: Rating): Promise<FSRSCard> {
    let updatedCard: FSRSCard;
    
    // 1. 选择调度器
    if (this.config.riffIntegration?.useRiffScheduler) {
      // 🆕 简单模式：使用 Riff 调度器
      updatedCard = await this.riffSchedulerAdapter.schedule(card, rating);
    } else {
      // 默认：使用本地调度器
      const scheduler = this.getScheduler(card);
      updatedCard = await scheduler.schedule(card, rating);
    }
    
    // 2. 保存到本地（必须）
    this.storage.setCard(updatedCard);
    await this.storage.saveCards();
    
    // 3. 可选：同步到 Riff
    if (this.config.riffIntegration?.syncToRiff) {
      try {
        await syncToRiff(card.deckID, updatedCard);
      } catch (error) {
        console.error('Riff sync failed:', error);
        // 同步失败不影响本地数据
      }
    }
    
    return updatedCard;
  }
}
```

### 4. 模式切换

#### 模式 1: 完全独立模式（默认）

```typescript
const config: SchedulerRouterConfig = {
  defaultScheduler: 'fsrs-v5',
  riffIntegration: {
    mode: 'data-only',      // 只使用 Riff 作为数据源
    syncToRiff: false,      // 不同步到 Riff
    useRiffScheduler: false // 不使用 Riff 调度器
  }
};
```

**数据流**:
```
Riff (数据源) → RiffDataSource → 本地调度器 → 本地存储
```

#### 模式 2: 双向同步模式

```typescript
const config: SchedulerRouterConfig = {
  defaultScheduler: 'fsrs-v5',
  riffIntegration: {
    mode: 'data-only',
    syncToRiff: true,       // ✅ 同步到 Riff
    useRiffScheduler: false
  }
};
```

**数据流**:
```
Riff (数据源) → RiffDataSource → 本地调度器 → 本地存储
                                              ↓
                                         syncToRiff()
                                              ↓
                                         Riff (备份)
```

#### 模式 3: 简单模式（将来支持）

```typescript
const config: SchedulerRouterConfig = {
  defaultScheduler: 'riff',  // 使用 Riff 调度器
  riffIntegration: {
    mode: 'full-scheduler',
    syncToRiff: true,
    useRiffScheduler: true   // ✅ 使用 Riff 调度器
  }
};
```

**数据流**:
```
Riff (数据源 + 调度器) → RiffDataSource → RiffSchedulerAdapter → Riff
```

## 实施步骤

### Phase 1: API 层重构

1. ✅ 添加 `getRiffCards()` API（获取所有卡片）
2. ✅ 添加 `getRiffNewCards()` API（增量更新）
3. ✅ 添加 `updateRiffCard()` API（只更新数据）
4. ✅ 添加 `syncToRiff()` 辅助函数
5. ✅ 保留 `getRiffDueCards()` 用于兼容

### Phase 2: RiffDataSource 重构

1. ✅ 添加 `mode` 配置选项
2. ✅ 实现 `getAll()` 的三种模式
3. ✅ 实现 `mergeLocalData()` 方法
4. ✅ 添加增量更新支持
5. ✅ 测试数据合并逻辑

### Phase 3: SchedulerRouter 重构

1. ✅ 添加 `riffIntegration` 配置
2. ✅ 实现 `syncToRiff` 选项
3. ✅ 保留 `RiffSchedulerAdapter` 接口
4. ✅ 添加模式切换逻辑
5. ✅ 测试三种模式

### Phase 4: UI 配置

1. ✅ 添加设置面板选项
2. ✅ 支持模式切换
3. ✅ 显示同步状态
4. ✅ 添加增量更新按钮

### Phase 5: 文档和测试

1. ✅ 更新架构文档
2. ✅ 添加迁移指南
3. ✅ 编写单元测试
4. ✅ 编写集成测试

## 接口设计

### IRiffIntegration (Riff 集成接口)

```typescript
/**
 * Riff 集成接口
 * 
 * 定义插件与 Riff 系统的集成方式
 */
interface IRiffIntegration {
  /**
   * 集成模式
   * - 'disabled': 不使用 Riff
   * - 'data-only': 只使用 Riff 作为数据源
   * - 'full-scheduler': 使用 Riff 调度器（简单模式）
   */
  mode: 'disabled' | 'data-only' | 'full-scheduler';
  
  /**
   * 是否同步本地调度结果到 Riff
   */
  syncToRiff: boolean;
  
  /**
   * 是否使用 Riff 调度器
   */
  useRiffScheduler: boolean;
  
  /**
   * 增量更新间隔（毫秒）
   */
  incrementalUpdateInterval?: number;
}
```

### IRiffDataSourceMode (数据源模式)

```typescript
/**
 * Riff 数据源模式
 */
type RiffDataSourceMode = 
  | 'due-only'      // 只获取到期卡片（兼容模式）
  | 'all'           // 获取所有卡片
  | 'incremental';  // 增量更新新卡片
```

## 优势

### 1. 解耦

- Riff 只作为数据源，不参与调度逻辑
- 可以独立使用本地调度器
- 可以选择性同步到 Riff

### 2. 灵活性

- 支持三种模式：独立、同步、简单
- 可以随时切换模式
- 为将来的 Riff 更新留下接口

### 3. 增量更新

- 只获取新增的卡片
- 减少 API 调用
- 提高性能

### 4. 向后兼容

- 保留现有 API
- 支持渐进式迁移
- 不影响现有功能

## 迁移路径

### 当前用户（默认）

```
模式 1: 完全独立模式
- Riff 作为数据源
- 本地调度器
- 不同步到 Riff
```

### 需要备份的用户

```
模式 2: 双向同步模式
- Riff 作为数据源
- 本地调度器
- 同步到 Riff（备份）
```

### 将来官方更新后

```
模式 3: 简单模式
- Riff 作为数据源和调度器
- 不增加新卡片数据
- 完全依赖 Riff
```

## 总结

这个架构方案实现了：

1. ✅ **独立于 Riff**: 只使用 Riff 作为数据来源
2. ✅ **增量更新**: 获取所有卡片 + 增量更新新卡片
3. ✅ **留下接口**: 为将来的 Riff 调度器留下 `RiffSchedulerAdapter`
4. ✅ **简单模式**: 支持只使用 Riff 不新增卡片数据的模式
5. ✅ **向后兼容**: 不影响现有功能，支持渐进式迁移
