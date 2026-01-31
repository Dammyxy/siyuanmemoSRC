# Riff 数据源解耦 - 设计文档

## 1. 架构设计

### 1.1 当前架构问题

```
当前架构：
┌─────────────────────────────────────┐
│ Riff 系统                           │
├─────────────────────────────────────┤
│ 1. 数据源：提供卡片列表              │
│    - getRiffDueCards()              │
│    - 返回 nextDues 等数据            │
├─────────────────────────────────────┤
│ 2. 控制器：管理排期                 │
│    - reviewRiffCard() 更新 nextDues │
│    - Riff 数据库存储排期结果         │
└─────────────────────────────────────┘
         ↓
    问题：双重角色导致数据不一致
```

### 1.2 目标架构

```
目标架构：
┌─────────────────────────────────────┐
│ Riff 系统（仅数据源）                │
├─────────────────────────────────────┤
│ - getRiffDueCards() 提供卡片列表     │
│ - 不控制排期                        │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ 本地调度器（唯一控制器）             │
├─────────────────────────────────────┤
│ - SchedulerRouter 计算 nextDues     │
│ - StorageManager 存储排期结果        │
│ - 可选同步到 Riff                   │
└─────────────────────────────────────┘
```

---

## 2. 数据流设计

### 2.1 复习流程（修改后）

```
用户评分
  ↓
IncrementalLearningQueue.onFeedback()
  ↓
判断卡片来源
  ├─ 本地卡片 → SchedulerRouter.route()
  │              ↓
  │          更新 nextDues
  │              ↓
  │          StorageManager.setCard()
  │
  └─ Riff 卡片 → SchedulerRouter.route()
                 ↓
             更新 nextDues
                 ↓
             StorageManager.setCard()
                 ↓
             （可选）同步到 Riff
```

### 2.2 删除流程（修改后）

```
用户删除卡片
  ↓
IncrementalLearningQueue.removeItems()
  ↓
判断卡片来源
  ├─ 本地卡片 → 从 localBuffer 移除
  │              ↓
  │          持久化到 storage
  │
  └─ Riff 卡片 → 从 riffBuffer 移除
                 ↓
             调用 removeRiffCards() API
                 ↓
             添加到黑名单
```

### 2.3 加载流程（修改后）

```
加载队列
  ↓
RiffDataSource.getAll()
  ↓
调用 getRiffDueCards()
  ↓
批量查询本地数据库
  ↓
合并数据
  ├─ 本地有 nextDues → 使用本地数据
  └─ 本地没有 → 使用 Riff 数据
  ↓
返回合并后的卡片列表
```

---

## 3. 组件设计

### 3.1 IncrementalLearningQueue 修改

#### 3.1.1 构造函数

```typescript
constructor(options?: {
  deckID?: string;
  api?: Partial<RiffApi>;
  storage?: StorageManager;
  scheduler?: SchedulerEngineAdapter;
  schedulerRouter?: SchedulerRouter;  // 🆕 新增
}) {
  // ...
  this.schedulerRouter = options?.schedulerRouter;
}
```

#### 3.1.2 onFeedback() 方法

```typescript
async onFeedback(
  currentItem: QueueItem | null,
  feedback: QueueFeedback,
): Promise<void> {
  if (!currentItem) return;

  const cardID = String(currentItem?.cardID || '');
  const deckID = String(currentItem?.deckID || this.deckID);
  if (!cardID) return;

  // 判断是否是本地卡片
  const isLocal = this.localBuffer.some(item => String(item.cardID) === cardID);

  if (feedback.action === 'skip') {
    if (isLocal) {
      await this._moveLocalToEnd(cardID);
    } else {
      // 🆕 Riff 卡片：添加到黑名单（不调用 Riff API）
      if (this.storage) {
        this.storage.addToRiffBlacklist(currentItem.blockID);
      }
      this._afterRiffConsumed(currentItem);
      this.riffCurrentRaw = null;
    }
    return;
  }

  if (feedback.action === 'rate') {
    const rating = feedback.rating;
    if (!rating) return;

    // 🆕 统一使用 SchedulerRouter
    if (this.schedulerRouter && this.storage) {
      // 1. QueueItem 转 FSRSCard
      const fsrsCard = this.storage.getCard(cardID);
      if (fsrsCard) {
        // 2. 使用 SchedulerRouter 进行复习
        const updatedCard = await this.schedulerRouter.route(fsrsCard, rating);

        // 3. SchedulerRouter 已经保存了卡片
        // 如果是 Riff 卡片，可选同步到 Riff
        if (!isLocal && this.config?.enableRiffSync) {
          await this.api.reviewRiffCard(deckID, cardID, rating);
        }

        console.log('[IncrementalLearningQueue] ✅ Used SchedulerRouter:', {
          cardID,
          cardType: updatedCard.type,
          schedulerType: updatedCard.schedulerType,
        });
      } else {
        // 后备方案：直接调用 Riff API
        await this.api.reviewRiffCard(deckID, cardID, rating);
      }
    } else {
      // 后备方案：使用原有逻辑
      if (isLocal && this.sortingStrategy) {
        await this.sortingStrategy.review(currentItem, rating);
        await this._persistLocalQueue();
      } else {
        await this.scheduler.schedule({ ...currentItem, deckID, cardID } as QueueItem, rating);
      }
    }

    if (!isLocal) {
      this._afterRiffConsumed(currentItem);
      this.riffCurrentRaw = null;
    }
    this.reviewedCount++;
    return;
  }
}
```

#### 3.1.3 removeItems() 方法

```typescript
async removeItems(items: QueueItem[]): Promise<number> {
  let removedCount = 0;

  for (const item of items) {
    const cardID = String(item?.cardID || '');
    if (!cardID) continue;

    // 尝试从本地队列移除
    const localIndex = this.localBuffer.findIndex(
      localItem => String(localItem.cardID) === cardID
    );

    if (localIndex !== -1) {
      // 本地卡片：从 buffer 移除
      this.localBuffer.splice(localIndex, 1);
      removedCount++;
    } else {
      // Riff 卡片：调用 API 删除
      const riffIndex = this.riffBuffer.findIndex(
        riffItem => String(riffItem.cardID) === cardID
      );

      if (riffIndex !== -1) {
        this.riffBuffer.splice(riffIndex, 1);
        removedCount++;

        // 🆕 调用 Riff API 删除
        try {
          await this.api.removeRiffCards(
            item.deckID || this.deckID,
            [item.blockID]
          );
          console.log('[IncrementalLearningQueue] ✅ Removed from Riff:', item.blockID);
        } catch (error) {
          console.error('[IncrementalLearningQueue] ❌ Failed to remove from Riff:', error);
          // 添加到黑名单作为后备
          if (this.storage) {
            this.storage.addToRiffBlacklist(item.blockID);
          }
        }
      }
    }
  }

  if (removedCount > 0) {
    await this._persistLocalQueue();
  }

  return removedCount;
}
```

### 3.2 RiffDataSource 修改

#### 3.2.1 构造函数

```typescript
export type RiffDataSourceOptions = DataSourceOptions<QueueItem> & {
  deckId: string;
  notebook?: string;
  rootID?: string;
  blacklistProvider?: () => Set<string>;
  storage?: StorageManager;  // 🆕 新增
};

constructor(options: RiffDataSourceOptions) {
  // ...
  this.storage = options.storage;
}
```

#### 3.2.2 getAll() 方法

```typescript
async getAll(): Promise<QueueItem[]> {
  try {
    const data = await getRiffDueCards(this.deckId, this.notebook, this.rootID);

    if (!data || !data.cards || data.cards.length === 0) {
      return [];
    }

    let items: QueueItem[] = data.cards.map(card => ({
      cardID: card.cardID,
      blockID: card.blockID,
      deckID: card.deckID,
      priority: 50,
      nextDues: card.nextDues as any,
      state: card.state,
      lapses: card.lapses,
      reps: card.reps,
      lastReview: card.lastReview ? new Date(card.lastReview).getTime() : undefined,
    }));

    // 🆕 批量查询本地数据库，优先使用本地 nextDues
    if (this.storage) {
      items = await this.mergeLocalNextDues(items);
    }

    // Filter Topic cards
    items = await this.filterTopicCards(items);

    // Filter blacklist cards
    if (this.blacklistProvider) {
      const blacklist = this.blacklistProvider();
      items = items.filter(item => !blacklist.has(item.blockID));
    }

    // Apply custom filter
    if (this.filterFn) {
      items = items.filter(this.filterFn);
    }

    // Apply limit
    if (this.limit && items.length > this.limit) {
      items = items.slice(0, this.limit);
    }

    this.cache = items;
    return items;
  } catch (error) {
    console.error('[RiffDataSource] Failed to load cards:', error);
    return [];
  }
}
```

#### 3.2.3 mergeLocalNextDues() 方法（新增）

```typescript
/**
 * 批量查询本地数据库，合并 nextDues
 *
 * 优先级：本地数据 > Riff 数据
 */
private async mergeLocalNextDues(items: QueueItem[]): Promise<QueueItem[]> {
  if (!this.storage || items.length === 0) return items;

  try {
    // 批量查询本地卡片
    const cardIds = items.map(item => item.cardID);
    const localCards = new Map<string, FSRSCard>();

    for (const cardId of cardIds) {
      const card = this.storage.getCard(cardId);
      if (card) {
        localCards.set(cardId, card);
      }
    }

    console.log('[RiffDataSource] Merge local nextDues:', {
      total: items.length,
      localFound: localCards.size,
    });

    // 合并数据
    return items.map(item => {
      const localCard = localCards.get(item.cardID);
      if (!localCard) return item;

      // 🆕 优先使用本地的 nextDues
      const localNextDues = this.extractNextDues(localCard);
      if (localNextDues) {
        return {
          ...item,
          nextDues: localNextDues,
          // 同时更新其他字段
          state: localCard.state,
          lapses: localCard.lapses,
          reps: localCard.reps,
          lastReview: localCard.lastReview?.getTime(),
        };
      }

      return item;
    });
  } catch (error) {
    console.error('[RiffDataSource] Failed to merge local nextDues:', error);
    return items;
  }
}

/**
 * 从 FSRSCard 提取 nextDues
 */
private extractNextDues(card: FSRSCard): Record<1 | 2 | 3 | 4, string> | null {
  // 如果卡片有 due 时间，计算 nextDues
  if (card.due) {
    const dueTime = card.due.getTime();
    return {
      1: new Date(dueTime).toISOString(),
      2: new Date(dueTime).toISOString(),
      3: new Date(dueTime).toISOString(),
      4: new Date(dueTime).toISOString(),
    };
  }

  return null;
}
```

### 3.3 StorageManager 修改

#### 3.3.1 存储格式说明

**当前实现**：
- 使用 JSON 格式存储（`JSON.stringify()` / `JSON.parse()`）
- 文件路径：`/data/storage/petal/siyuan-plugin-fsrs/`

**思源开发者建议**：
- 使用 **msgpack** 格式（性能更好，避免同步问题）
- 不使用数据库（会有同步冲突）

**实施方案**：
```typescript
// 安装 msgpack 库
// npm install @msgpack/msgpack

import { encode, decode } from '@msgpack/msgpack';

/**
 * 保存数据（msgpack 格式）
 */
async saveData(filename: string, data: any): Promise<void> {
  try {
    // 使用 msgpack 编码
    const buffer = encode(data);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    
    await this.writePluginData(filename, blob);
  } catch (error) {
    console.error(`[StorageManager] Failed to save ${filename}:`, error);
    throw error;
  }
}

/**
 * 加载数据（msgpack 格式）
 */
async loadData(filename: string): Promise<any> {
  try {
    const content = await this.readPluginData(filename);
    if (!content) return null;

    // 使用 msgpack 解码
    const buffer = await content.arrayBuffer();
    return decode(new Uint8Array(buffer));
  } catch (error) {
    console.error(`[StorageManager] Failed to load ${filename}:`, error);
    return null;
  }
}
```

**文件命名**：
```typescript
const STORAGE_FILES = {
  CARDS: 'cards.msgpack',              // 卡片数据
  SETTINGS: 'settings.json',           // 设置（保持 JSON，便于手动编辑）
  PRACTICE_QUEUE: 'practice-queue.msgpack',
  INCREMENTAL_LEARNING_QUEUE: 'incremental-learning-queue.msgpack',
  RIFF_BLACKLIST: 'riff-blacklist.msgpack',
};
```

#### 3.3.2 Riff 黑名单管理（新增）

```typescript
/**
 * Riff 黑名单（已删除的 Riff 卡片）
 */
private riffBlacklist: Set<string> = new Set();

/**
 * 获取 Riff 黑名单
 */
getRiffBlacklist(): Set<string> {
  return this.riffBlacklist;
}

/**
 * 添加到 Riff 黑名单
 */
addToRiffBlacklist(blockID: string): void {
  this.riffBlacklist.add(blockID);
  this._persistRiffBlacklist();
}

/**
 * 从 Riff 黑名单移除
 */
removeFromRiffBlacklist(blockID: string): void {
  this.riffBlacklist.delete(blockID);
  this._persistRiffBlacklist();
}

/**
 * 清空 Riff 黑名单
 */
clearRiffBlacklist(): void {
  this.riffBlacklist.clear();
  this._persistRiffBlacklist();
}

/**
 * 持久化 Riff 黑名单（msgpack 格式）
 */
private async _persistRiffBlacklist(): Promise<void> {
  try {
    const data = {
      version: 1,
      blacklist: Array.from(this.riffBlacklist),
      metadata: {
        savedAt: Date.now(),
        count: this.riffBlacklist.size,
      },
    };

    await this.saveData('riff-blacklist.msgpack', data);
    console.log('[StorageManager] Saved Riff blacklist:', this.riffBlacklist.size);
  } catch (error) {
    console.error('[StorageManager] Failed to persist Riff blacklist:', error);
  }
}

/**
 * 加载 Riff 黑名单（msgpack 格式）
 */
private async _loadRiffBlacklist(): Promise<void> {
  try {
    const data = await this.loadData('riff-blacklist.msgpack');
    if (data && Array.isArray(data.blacklist)) {
      this.riffBlacklist = new Set(data.blacklist);
      console.log('[StorageManager] Loaded Riff blacklist:', this.riffBlacklist.size);
    }
  } catch (error) {
    console.error('[StorageManager] Failed to load Riff blacklist:', error);
  }
}
```

#### 3.3.3 数据迁移（JSON → msgpack）

```typescript
/**
 * 迁移 JSON 数据到 msgpack 格式
 */
async migrateToMsgpack(): Promise<void> {
  const migrations = [
    { from: 'cards.json', to: 'cards.msgpack' },
    { from: 'practice-queue.json', to: 'practice-queue.msgpack' },
    { from: 'incremental-learning-queue.json', to: 'incremental-learning-queue.msgpack' },
    { from: 'riff-blacklist.json', to: 'riff-blacklist.msgpack' },
  ];

  for (const { from, to } of migrations) {
    try {
      // 读取 JSON 文件
      const jsonContent = await this.readPluginData(from);
      if (!jsonContent) continue;

      const data = JSON.parse(jsonContent);

      // 保存为 msgpack
      await this.saveData(to, data);

      console.log(`[StorageManager] Migrated ${from} → ${to}`);

      // 删除旧文件（可选）
      // await this.removeFile(from);
    } catch (error) {
      console.error(`[StorageManager] Failed to migrate ${from}:`, error);
    }
  }
}
```

---

## 4. 配置设计

### 4.1 IncrementalLearningQueue 配置

```typescript
interface IncrementalLearningQueueConfig {
  enableRiffSync: boolean;  // 是否同步到 Riff
  useLocalScheduler: boolean;  // 是否使用本地调度器
  schedulerType: SchedulerType;  // 调度器类型
}
```

### 4.2 RiffDataSource 配置

```typescript
interface RiffDataSourceConfig {
  prioritizeLocal: boolean;  // 优先使用本地数据
  enableBlacklist: boolean;  // 启用黑名单
  cacheTimeout: number;  // 缓存超时时间（毫秒）
}
```

---

## 5. 数据迁移

### 5.1 迁移策略

```typescript
/**
 * 迁移 Riff 数据到本地数据库
 *
 * 步骤：
 * 1. 获取所有 Riff 卡片
 * 2. 检查本地是否已存在
 * 3. 如果不存在，创建本地卡片
 * 4. 同步 nextDues 和其他字段
 */
async migrateRiffToLocal(deckID: string): Promise<number> {
  const data = await getRiffDueCards(deckID);
  let migratedCount = 0;

  for (const riffCard of data.cards) {
    const cardID = riffCard.cardID;
    const existingCard = this.storage.getCard(cardID);

    if (!existingCard) {
      // 创建新卡片
      const newCard: FSRSCard = {
        id: cardID,
        blockId: riffCard.blockID,
        due: new Date(riffCard.nextDues.good),
        stability: riffCard.stability || 2,
        difficulty: riffCard.difficulty || 5,
        elapsedDays: riffCard.elapsedDays || 0,
        scheduledDays: riffCard.scheduledDays || 0,
        reps: riffCard.reps || 0,
        lapses: riffCard.lapses || 0,
        state: riffCard.state || 0,
        lastReview: riffCard.lastReview ? new Date(riffCard.lastReview) : undefined,
        type: 'item',  // 默认为 item
        schedulerType: 'fsrs-v5',  // 默认调度器
      };

      this.storage.setCard(newCard);
      migratedCount++;
    }
  }

  await this.storage.saveCards();
  console.log('[Migration] Migrated', migratedCount, 'cards from Riff to local');
  return migratedCount;
}
```

---

## 6. 测试策略

### 6.1 单元测试

#### 6.1.1 IncrementalLearningQueue

```typescript
describe('IncrementalLearningQueue', () => {
  it('should use SchedulerRouter for Riff cards', async () => {
    // 测试 Riff 卡片使用 SchedulerRouter
  });

  it('should remove Riff cards from database', async () => {
    // 测试删除 Riff 卡片
  });

  it('should add removed cards to blacklist', async () => {
    // 测试黑名单功能
  });
});
```

#### 6.1.2 RiffDataSource

```typescript
describe('RiffDataSource', () => {
  it('should prioritize local nextDues', async () => {
    // 测试优先使用本地数据
  });

  it('should filter blacklisted cards', async () => {
    // 测试黑名单过滤
  });

  it('should batch query local cards', async () => {
    // 测试批量查询性能
  });
});
```

### 6.2 集成测试

```typescript
describe('Riff Data Source Decoupling', () => {
  it('should complete full review flow with local scheduler', async () => {
    // 测试完整复习流程
  });

  it('should persist nextDues after review', async () => {
    // 测试 nextDues 持久化
  });

  it('should sync to Riff when enabled', async () => {
    // 测试 Riff 同步
  });
});
```

---

## 7. 性能优化

### 7.1 批量查询

```typescript
// 批量查询本地卡片（200 个一批）
const BATCH_SIZE = 200;

async function batchGetCards(cardIds: string[]): Promise<Map<string, FSRSCard>> {
  const result = new Map();

  for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
    const batch = cardIds.slice(i, i + BATCH_SIZE);
    for (const cardId of batch) {
      const card = storage.getCard(cardId);
      if (card) {
        result.set(cardId, card);
      }
    }
  }

  return result;
}
```

### 7.2 缓存策略

```typescript
// 缓存本地卡片数据（5 分钟）
const CACHE_TIMEOUT = 5 * 60 * 1000;

class LocalCardCache {
  private cache = new Map<string, { card: FSRSCard; timestamp: number }>();

  get(cardId: string): FSRSCard | null {
    const entry = this.cache.get(cardId);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > CACHE_TIMEOUT) {
      this.cache.delete(cardId);
      return null;
    }

    return entry.card;
  }

  set(cardId: string, card: FSRSCard): void {
    this.cache.set(cardId, { card, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}
```

---

## 8. 回滚策略

### 8.1 功能开关

```typescript
interface FeatureFlags {
  useLocalScheduler: boolean;  // 使用本地调度器
  prioritizeLocalNextDues: boolean;  // 优先本地 nextDues
  enableRiffSync: boolean;  // 启用 Riff 同步
}

// 默认配置（保守）
const DEFAULT_FLAGS: FeatureFlags = {
  useLocalScheduler: false,  // 默认关闭
  prioritizeLocalNextDues: false,  // 默认关闭
  enableRiffSync: true,  // 默认开启
};
```

### 8.2 数据备份

```typescript
// 在修改前备份 Riff 数据
async function backupRiffData(deckID: string): Promise<void> {
  const data = await getRiffDueCards(deckID);
  await storage.saveData('riff-backup.json', {
    version: 1,
    deckID,
    cards: data.cards,
    timestamp: Date.now(),
  });
}
```

---

## 9. 监控和日志

### 9.1 关键指标

- Riff API 调用次数
- 本地数据库查询次数
- nextDues 冲突次数
- 删除操作成功率

### 9.2 日志格式

```typescript
console.log('[IncrementalLearningQueue] ✅ Used SchedulerRouter:', {
  cardID,
  cardType,
  schedulerType,
  isLocal,
  syncToRiff,
});

console.log('[RiffDataSource] Merge local nextDues:', {
  total,
  localFound,
  conflicts,
});
```

---

## 10. 实施计划

### Phase 1: 基础设施（1-2 天）
- StorageManager 添加黑名单管理
- RiffDataSource 添加 storage 参数
- 实现 mergeLocalNextDues() 方法

### Phase 2: IncrementalLearningQueue 集成（2-3 天）
- 添加 schedulerRouter 参数
- 修改 onFeedback() 方法
- 修改 removeItems() 方法

### Phase 3: 测试和优化（2-3 天）
- 单元测试
- 集成测试
- 性能优化

### Phase 4: 数据迁移和部署（1-2 天）
- 实现迁移工具
- 文档更新
- 发布

---

## 11. 风险和缓解

### 11.1 数据不一致

**风险**：本地和 Riff 数据不同步

**缓解**：
- 提供同步工具
- 定期检查一致性
- 提供手动修复功能

### 11.2 性能问题

**风险**：批量查询本地数据库性能差

**缓解**：
- 使用缓存
- 批量查询优化
- 异步加载

### 11.3 兼容性问题

**风险**：现有数据迁移失败

**缓解**：
- 提供数据备份
- 渐进式迁移
- 回滚机制

---

## 12. 总结

本设计文档提供了 Riff 数据源解耦的完整技术方案，包括：

1. **架构设计**：将 Riff 从双重角色（数据源 + 控制器）简化为单一角色（数据源）
2. **数据流设计**：统一使用 SchedulerRouter 进行调度，本地数据库作为唯一数据源
3. **组件设计**：详细的代码修改方案
4. **测试策略**：完整的单元测试和集成测试
5. **性能优化**：批量查询和缓存策略
6. **风险缓解**：功能开关、数据备份、回滚机制

通过这个设计，我们可以实现：
- ✅ Riff 只作为数据源
- ✅ 所有排期由本地调度器控制
- ✅ 删除、时间调整永久生效
- ✅ 统一的数据流和调度逻辑
