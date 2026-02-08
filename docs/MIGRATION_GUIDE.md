# 队列架构迁移指南

## 概述

本指南帮助开发者将代码从旧队列架构迁移到新统一架构。如果你的代码使用了 `src/core/queue/strategies/` 中的队列或 `QueueItem` 类型，你需要按照本指南进行迁移。

## 为什么要迁移？

旧架构存在以下问题：

1. **双架构维护负担**: 同时维护两套队列系统增加了复杂性
2. **类型不一致**: `QueueItem` 缺少关键字段，导致类型错误
3. **API 不统一**: 不同队列的方法命名和行为不一致
4. **缺少统一管理**: 没有中心化的队列管理和观察者模式

新架构提供：

- ✅ 统一的 `IReviewQueue` 接口
- ✅ 完整的 `FSRSCard` 类型
- ✅ 中心化的 `UnifiedDataSourceManager`
- ✅ 内置观察者模式
- ✅ 自动模式切换（Simple/Advanced）

## 破坏性变更

### 1. 类型变更

#### QueueItem → FSRSCard

**旧代码**:
```typescript
import { QueueItem } from '@/core/queue/types';

const item: QueueItem = {
    cardID: 'card-123',
    due: Date.now(),
    stability: 5.0,
    // ...
};
```

**新代码**:
```typescript
import type { FSRSCard } from '@/types/card';

const card: FSRSCard = {
    id: 'card-123',
    blockId: 'card-123',
    due: new Date(),
    stability: 5.0,
    // ...
};
```

**字段映射**:

| 旧字段 (QueueItem) | 新字段 (FSRSCard) | 说明 |
|-------------------|------------------|------|
| `cardID` | `blockId` | 卡片 ID |
| `due` (number) | `due` (Date) | 到期时间，类型改为 Date |
| `elapsed_days` | `elapsedDays` | 驼峰命名 |
| `scheduled_days` | `scheduledDays` | 驼峰命名 |
| `last_review` | `lastReview` | 驼峰命名 |
| `cardType` | `type` | 字段名改变 |
| - | `id` | 新增字段 |
| - | `rootId` | 新增字段 |

### 2. 方法变更

#### getAllItems() → getAllCards()

**旧代码**:
```typescript
const items = await queue.getAllItems();
```

**新代码**:
```typescript
const cards = await queue.getAllCards();
```

#### addItems() → addCard()

**旧代码**:
```typescript
await queue.addItems([item1, item2, item3]);
```

**新代码**:
```typescript
// 逐个添加
for (const card of cards) {
    await queue.addCard(card);
}

// 或并行添加
await Promise.all(cards.map(card => queue.addCard(card)));
```

#### onFeedback() → handleReview()

**旧代码**:
```typescript
await queue.onFeedback(item, {
    rating: 'good',
    timestamp: Date.now()
});
```

**新代码**:
```typescript
await queue.handleReview(card.id, 3); // 3 = Good
```

**评分映射**:
- `'again'` → `1`
- `'hard'` → `2`
- `'good'` → `3`
- `'easy'` → `4`

#### removeItems() → removeCard()

**旧代码**:
```typescript
await queue.removeItems([item1, item2]);
```

**新代码**:
```typescript
for (const card of cards) {
    await queue.removeCard(card.id);
}
```

### 3. 队列创建方式变更

#### 直接实例化 → 通过 UnifiedDataSourceManager

**旧代码**:
```typescript
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';

const queue = new RetrievalPracticeQueue({
    scheduler: fsrsScheduler,
    dataSource: riffDataSource,
    // ...
});
await queue.init();
```

**新代码**:
```typescript
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';

const manager = new UnifiedDataSourceManager(plugin);
const queue = manager.getQueue('retrieval-practice');
// 队列已自动初始化
```

### 4. 数据源访问变更

#### 直接访问 → 通过队列接口

**旧代码**:
```typescript
import { RiffDataSource } from '@/core/queue/datasource/RiffDataSource';

const dataSource = new RiffDataSource(plugin);
const cards = await dataSource.getAllCards();
```

**新代码**:
```typescript
const manager = new UnifiedDataSourceManager(plugin);
const queue = manager.getQueue('retrieval-practice');
const cards = await queue.getAllCards();
```

## 迁移步骤

### 步骤 1: 更新导入语句

**查找并替换**:

```typescript
// 旧导入
import { QueueItem } from '@/core/queue/types';
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import { BaseCompositeQueue } from '@/core/queue/composite/BaseCompositeQueue';

// 新导入
import type { FSRSCard } from '@/types/card';
import type { IReviewQueue } from '@/types/unified-data-source';
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
```

### 步骤 2: 更新类型注解

**查找所有 `QueueItem` 并替换为 `FSRSCard`**:

```typescript
// 旧代码
function processItem(item: QueueItem): void {
    console.log(item.cardID);
}

// 新代码
function processCard(card: FSRSCard): void {
    console.log(card.blockId);
}
```

### 步骤 3: 更新队列创建代码

**替换直接实例化为通过管理器获取**:

```typescript
// 旧代码
class MyComponent {
    private queue: RetrievalPracticeQueue;
    
    constructor() {
        this.queue = new RetrievalPracticeQueue(config);
    }
}

// 新代码
class MyComponent {
    private queue: IReviewQueue;
    private manager: UnifiedDataSourceManager;
    
    constructor(plugin: FSRSPlugin) {
        this.manager = new UnifiedDataSourceManager(plugin);
        this.queue = this.manager.getQueue('retrieval-practice');
    }
}
```

### 步骤 4: 更新方法调用

**替换旧方法为新方法**:

```typescript
// 旧代码
const items = await queue.getAllItems();
await queue.addItems(newItems);
await queue.onFeedback(item, feedback);

// 新代码
const cards = await queue.getAllCards();
for (const card of newCards) {
    await queue.addCard(card);
}
await queue.handleReview(card.id, rating);
```

### 步骤 5: 实现观察者模式（可选但推荐）

**添加观察者以自动响应数据变更**:

```typescript
import type { IDataSourceObserver, DataChangeEvent } from '@/types/unified-data-source';

class MyComponent implements IDataSourceObserver {
    private manager: UnifiedDataSourceManager;
    
    constructor(plugin: FSRSPlugin) {
        this.manager = new UnifiedDataSourceManager(plugin);
        this.manager.registerObserver(this);
    }
    
    onDataChanged(event: DataChangeEvent): void {
        switch (event.type) {
            case 'card-updated':
                this.refreshUI();
                break;
            case 'card-deleted':
                this.removeFromUI(event.cardIds);
                break;
            case 'queue-changed':
                this.reloadQueue();
                break;
        }
    }
    
    destroy(): void {
        this.manager.unregisterObserver(this);
    }
}
```

### 步骤 6: 更新测试

**更新测试以使用新架构**:

```typescript
// 旧测试
describe('MyComponent', () => {
    it('should process items', async () => {
        const queue = new RetrievalPracticeQueue(mockConfig);
        const items = await queue.getAllItems();
        expect(items).toHaveLength(5);
    });
});

// 新测试
describe('MyComponent', () => {
    it('should process cards', async () => {
        const manager = new UnifiedDataSourceManager(mockPlugin);
        const queue = manager.getQueue('retrieval-practice');
        const cards = await queue.getAllCards();
        expect(cards).toHaveLength(5);
    });
});
```

## 迁移示例

### 示例 1: 简单队列使用

**旧代码**:
```typescript
import { RetrievalPracticeQueue } from '@/core/queue/strategies/RetrievalPracticeQueue';
import type { QueueItem } from '@/core/queue/types';

class ReviewDialog {
    private queue: RetrievalPracticeQueue;
    
    async loadCards(): Promise<void> {
        const items: QueueItem[] = await this.queue.getAllItems();
        this.displayItems(items);
    }
    
    async rateCard(item: QueueItem, rating: string): Promise<void> {
        await this.queue.onFeedback(item, { rating, timestamp: Date.now() });
    }
}
```

**新代码**:
```typescript
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
import type { IReviewQueue } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';

class ReviewDialog {
    private queue: IReviewQueue;
    private manager: UnifiedDataSourceManager;
    
    constructor(plugin: FSRSPlugin) {
        this.manager = new UnifiedDataSourceManager(plugin);
        this.queue = this.manager.getQueue('retrieval-practice');
    }
    
    async loadCards(): Promise<void> {
        const cards: FSRSCard[] = await this.queue.getAllCards();
        this.displayCards(cards);
    }
    
    async rateCard(card: FSRSCard, rating: number): Promise<void> {
        await this.queue.handleReview(card.id, rating);
    }
}
```

### 示例 2: 带观察者的组件

**旧代码**:
```typescript
class SRSBrowser {
    private queue: RetrievalPracticeQueue;
    
    async refresh(): Promise<void> {
        const items = await this.queue.getAllItems();
        this.render(items);
    }
    
    async deleteCard(cardId: string): Promise<void> {
        await this.queue.removeItems([{ cardID: cardId }]);
        await this.refresh(); // 手动刷新
    }
}
```

**新代码**:
```typescript
import type { IDataSourceObserver, DataChangeEvent } from '@/types/unified-data-source';

class SRSBrowser implements IDataSourceObserver {
    private queue: IReviewQueue;
    private manager: UnifiedDataSourceManager;
    
    constructor(plugin: FSRSPlugin) {
        this.manager = new UnifiedDataSourceManager(plugin);
        this.queue = this.manager.getQueue('retrieval-practice');
        this.manager.registerObserver(this);
    }
    
    async refresh(): Promise<void> {
        const cards = await this.queue.getAllCards();
        this.render(cards);
    }
    
    async deleteCard(cardId: string): Promise<void> {
        await this.queue.removeCard(cardId);
        // 不需要手动刷新，观察者会自动触发
    }
    
    onDataChanged(event: DataChangeEvent): void {
        if (event.type === 'card-deleted' || event.type === 'card-updated') {
            this.refresh();
        }
    }
    
    destroy(): void {
        this.manager.unregisterObserver(this);
    }
}
```

### 示例 3: 批量操作

**旧代码**:
```typescript
async function addMultipleCards(queue: RetrievalPracticeQueue, items: QueueItem[]): Promise<void> {
    await queue.addItems(items);
}
```

**新代码**:
```typescript
async function addMultipleCards(queue: IReviewQueue, cards: FSRSCard[]): Promise<void> {
    // 并行添加以提高性能
    await Promise.all(cards.map(card => queue.addCard(card)));
}
```

## 常见问题

### Q1: 如何处理 `due` 字段类型变更？

**问题**: `QueueItem.due` 是 `number`，`FSRSCard.due` 是 `Date`

**解决方案**:
```typescript
// 旧代码
const item: QueueItem = {
    due: Date.now(),
    // ...
};

// 新代码
const card: FSRSCard = {
    due: new Date(),
    // ...
};

// 如果需要时间戳
const timestamp = card.due.getTime();
```

### Q2: 如何迁移自定义队列？

**问题**: 我有一个继承自 `BaseCompositeQueue` 的自定义队列

**解决方案**:
```typescript
// 旧代码
class MyCustomQueue extends BaseCompositeQueue {
    // ...
}

// 新代码
class MyCustomQueue implements IReviewQueue {
    name = 'my-custom-queue';
    type = 'custom' as QueueType;
    
    async getAllCards(): Promise<FSRSCard[]> {
        // 实现
    }
    
    async getNextCard(): Promise<FSRSCard | null> {
        // 实现
    }
    
    // 实现其他 IReviewQueue 方法
}
```

### Q3: 如何处理队列状态持久化？

**问题**: 旧代码直接访问存储层保存队列状态

**解决方案**:
```typescript
// 旧代码
await storage.saveQueueState(queueType, state);

// 新代码
// 队列状态由 UnifiedDataSourceManager 自动管理
// 如果需要手动保存，使用队列的 updateCard 方法
await queue.updateCard(card);
```

### Q4: 测试中如何 mock 队列？

**问题**: 如何在测试中 mock `IReviewQueue`

**解决方案**:
```typescript
const mockQueue: IReviewQueue = {
    name: 'mock-queue',
    type: 'retrieval-practice',
    getType: vi.fn().mockReturnValue('retrieval-practice'),
    getAllCards: vi.fn().mockResolvedValue([]),
    getNextCard: vi.fn().mockResolvedValue(null),
    addCard: vi.fn().mockResolvedValue(undefined),
    removeCard: vi.fn().mockResolvedValue(undefined),
    updateCard: vi.fn().mockResolvedValue(undefined),
    handleReview: vi.fn().mockResolvedValue(undefined),
    isDynamic: vi.fn().mockReturnValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    reorder: vi.fn().mockResolvedValue(true),
};
```

### Q5: 如何处理模式切换？

**问题**: 简单模式和高级模式下队列行为不同

**解决方案**:
```typescript
const manager = new UnifiedDataSourceManager(plugin);
const mode = manager.getCurrentMode();

if (mode === 'simple') {
    // 简单模式：只读，功能有限
    const queue = manager.getQueue('retrieval-practice');
} else {
    // 高级模式：完整功能
    const queue = manager.getQueue('incremental-learning');
}
```

## 故障排除

### 问题 1: TypeScript 类型错误

**错误信息**:
```
Property 'cardID' does not exist on type 'FSRSCard'
```

**解决方案**: 将 `cardID` 替换为 `blockId`

### 问题 2: 方法不存在

**错误信息**:
```
Property 'getAllItems' does not exist on type 'IReviewQueue'
```

**解决方案**: 将 `getAllItems()` 替换为 `getAllCards()`

### 问题 3: 队列未初始化

**错误信息**:
```
Cannot read property 'getAllCards' of undefined
```

**解决方案**: 确保通过 `UnifiedDataSourceManager` 获取队列：
```typescript
const manager = new UnifiedDataSourceManager(plugin);
const queue = manager.getQueue('retrieval-practice');
```

### 问题 4: 观察者未收到通知

**问题**: 数据变更后 UI 没有自动刷新

**解决方案**: 确保正确注册观察者：
```typescript
class MyComponent implements IDataSourceObserver {
    constructor(plugin: FSRSPlugin) {
        const manager = new UnifiedDataSourceManager(plugin);
        manager.registerObserver(this); // 注册观察者
    }
    
    onDataChanged(event: DataChangeEvent): void {
        // 处理数据变更
    }
}
```

### 问题 5: 性能下降

**问题**: 迁移后操作变慢

**解决方案**: 使用批量操作和并行处理：
```typescript
// ❌ 慢：逐个添加
for (const card of cards) {
    await queue.addCard(card);
}

// ✅ 快：并行添加
await Promise.all(cards.map(card => queue.addCard(card)));
```

## 检查清单

迁移完成后，检查以下项目：

- [ ] 所有 `QueueItem` 引用已替换为 `FSRSCard`
- [ ] 所有 `getAllItems()` 调用已替换为 `getAllCards()`
- [ ] 所有 `addItems()` 调用已替换为 `addCard()`
- [ ] 所有 `onFeedback()` 调用已替换为 `handleReview()`
- [ ] 所有队列创建使用 `UnifiedDataSourceManager`
- [ ] 实现了 `IDataSourceObserver` 接口（如果需要）
- [ ] 更新了所有测试
- [ ] TypeScript 编译无错误
- [ ] 所有测试通过
- [ ] 功能正常工作

## 获取帮助

如果遇到问题：

1. 查看 [队列架构文档](./QUEUE_ARCHITECTURE.md)
2. 查看 [API 参考文档](./API_REFERENCE.md)
3. 查看 [开发者指南](./DEVELOPER_GUIDE.md)
4. 查看源代码中的示例
5. 提交 Issue 或联系维护者

## 参考资源

- [队列架构文档](./QUEUE_ARCHITECTURE.md) - 架构概述和最佳实践
- [API 参考文档](./API_REFERENCE.md) - 完整的 API 文档
- [开发者指南](./DEVELOPER_GUIDE.md) - 如何创建和使用队列
- [IReviewQueue 接口](../src/types/unified-data-source.ts) - 接口定义
- [UnifiedDataSourceManager](../src/managers/UnifiedDataSourceManager.ts) - 管理器实现
