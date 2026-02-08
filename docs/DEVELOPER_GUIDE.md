# 开发者指南

## 概述

本指南帮助开发者理解和使用 FSRS 插件的队列系统。无论你是要创建新队列、扩展现有功能，还是集成队列到 UI 组件，本指南都会提供详细的说明和示例。

## 目录

1. [快速开始](#快速开始)
2. [核心概念](#核心概念)
3. [创建自定义队列](#创建自定义队列)
4. [使用队列](#使用队列)
5. [观察者模式](#观察者模式)
6. [数据路由](#数据路由)
7. [测试](#测试)
8. [最佳实践](#最佳实践)
9. [常见模式](#常见模式)
10. [故障排除](#故障排除)

## 快速开始

### 基本使用

```typescript
import { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
import type { IReviewQueue } from '@/types/unified-data-source';

// 1. 创建管理器
const manager = new UnifiedDataSourceManager(plugin);

// 2. 获取队列
const queue = manager.getQueue('retrieval-practice');

// 3. 获取卡片
const cards = await queue.getAllCards();

// 4. 处理复习
await queue.handleReview(cardId, 3); // 评分 3 = Good
```

### 完整示例

```typescript
class MyReviewComponent {
    private manager: UnifiedDataSourceManager;
    private queue: IReviewQueue;
    
    constructor(plugin: FSRSPlugin) {
        this.manager = new UnifiedDataSourceManager(plugin);
        this.queue = this.manager.getQueue('retrieval-practice');
    }
    
    async loadAndDisplay(): Promise<void> {
        const cards = await this.queue.getAllCards();
        console.log(`Loaded ${cards.length} cards`);
        // 显示卡片...
    }
}
```

## 核心概念

### 1. UnifiedDataSourceManager

中心化的队列管理器，负责：
- 创建和管理队列实例
- 处理模式切换（Simple/Advanced）
- 实现观察者模式
- 路由数据访问


**关键方法**:
- `getQueue(type)`: 获取队列实例
- `registerObserver(observer)`: 注册观察者
- `getCurrentMode()`: 获取当前模式
- `notifyObservers(event)`: 通知所有观察者

### 2. IReviewQueue 接口

所有队列必须实现的统一接口：

```typescript
interface IReviewQueue {
    // 基本属性
    name: string;
    type: QueueType;
    
    // 核心方法
    getAllCards(): Promise<FSRSCard[]>;
    addCard(card: FSRSCard | string): Promise<void>;
    removeCard(cardId: string): Promise<void>;
    handleReview(cardId: string, rating: number): Promise<void>;
    
    // 队列管理
    isDynamic(): boolean;
    refresh(): Promise<void>;
    clear(): Promise<void>;
    reorder(cards: FSRSCard[]): Promise<boolean>;
}
```

### 3. 队列类型

**动态队列**（自动获取到期卡片）:
- `RetrievalPracticeQueue`: 检索练习
- `IncrementalLearningQueue`: 渐进学习
- `FilterGroupQueue`: 过滤组

**静态队列**（手动管理）:
- `FinalDrillQueue`: 最终训练
- `NeuralRoamQueue`: 神经漫游

### 4. 数据类型

**FSRSCard**: 完整的卡片数据结构
```typescript
interface FSRSCard {
    id: string;
    blockId: string;
    due: Date;
    stability: number;
    difficulty: number;
    // ... 其他字段
}
```

## 创建自定义队列

### 步骤 1: 继承 BaseReviewQueue

```typescript
import { BaseReviewQueue } from '@/queues/BaseReviewQueue';
import { QueueType } from '@/types/unified-data-source';
import type { FSRSCard } from '@/types/card';

export class MyCustomQueue extends BaseReviewQueue {
    public name = 'MyCustomQueue';
    
    constructor(manager: UnifiedDataSourceManager) {
        super(manager, 'my-custom' as QueueType);
    }
    
    // 实现必需的抽象方法...
}
```

### 步骤 2: 实现必需方法

#### getCards()

获取队列中的卡片：

```typescript
public async getCards(): Promise<FSRSCard[]> {
    try {
        // 1. 从数据源获取卡片
        const cards = await this.manager.getCards({
            cardType: 'item',
            dueDate: { lte: new Date() }
        });
        
        // 2. 应用自定义过滤/排序
        const filtered = cards.filter(card => {
            // 自定义过滤逻辑
            return card.priority > 5;
        });
        
        // 3. 排序
        filtered.sort((a, b) => a.due - b.due);
        
        // 4. 应用自定义排序（如果存在）
        return this.applyCustomOrder(filtered);
    } catch (error) {
        console.error('[MyCustomQueue] Failed to get cards:', error);
        throw error;
    }
}
```


#### addCard()

添加卡片到队列：

```typescript
public async addCard(card: FSRSCard | string): Promise<void> {
    try {
        const cardId = typeof card === 'string' ? card : card.id;
        
        // 1. 添加到内部集合
        this.manualCards.add(cardId);
        
        // 2. 持久化（如果需要）
        await this.persistState();
        
        // 3. 通知观察者
        this.manager.notifyObservers({
            type: 'queue-changed',
            queueType: this.type,
            timestamp: Date.now()
        });
        
        console.log(`[MyCustomQueue] Card ${cardId} added`);
    } catch (error) {
        console.error('[MyCustomQueue] Failed to add card:', error);
        throw error;
    }
}
```

#### removeCard()

从队列移除卡片：

```typescript
public async removeCard(cardId: string): Promise<void> {
    try {
        // 1. 从内部集合移除
        this.manualCards.delete(cardId);
        
        // 2. 持久化
        await this.persistState();
        
        // 3. 通知观察者
        this.manager.notifyObservers({
            type: 'queue-changed',
            queueType: this.type,
            timestamp: Date.now()
        });
        
        console.log(`[MyCustomQueue] Card ${cardId} removed`);
    } catch (error) {
        console.error('[MyCustomQueue] Failed to remove card:', error);
        throw error;
    }
}
```

#### handleReview()

处理卡片复习：

```typescript
public async handleReview(cardId: string, rating: number): Promise<void> {
    try {
        // 1. 获取卡片
        const card = await this.manager.getCard(cardId);
        
        // 2. 根据评分更新卡片
        if (rating >= 3) {
            // 记住了：更新到期日期，从队列移除
            card.due = this.calculateNextDue(card, rating);
            await this.manager.updateCard(card);
            await this.removeCard(cardId);
        } else {
            // 忘记了：保留在队列中
            card.due = new Date();
            await this.manager.updateCard(card);
        }
        
        // 3. 通知观察者
        this.manager.notifyObservers({
            type: 'card-updated',
            cardIds: [cardId],
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('[MyCustomQueue] Failed to handle review:', error);
        throw error;
    }
}
```

#### isDynamic()

标识队列类型：

```typescript
public isDynamic(): boolean {
    // true = 动态队列（自动获取到期卡片）
    // false = 静态队列（仅手动管理）
    return true;
}
```

### 步骤 3: 注册队列

在 `QueueFactory` 中注册你的队列：

```typescript
// src/queues/QueueFactory.ts
import { MyCustomQueue } from './MyCustomQueue';

export class QueueFactory {
    static create(type: QueueType, manager: UnifiedDataSourceManager): IReviewQueue {
        switch (type) {
            case 'my-custom':
                return new MyCustomQueue(manager);
            // ... 其他队列
        }
    }
}
```


## 使用队列

### 基本操作

#### 获取卡片

```typescript
// 获取所有卡片
const cards = await queue.getAllCards();

// 获取下一张卡片
const nextCard = await queue.getNextCard();

// 过滤卡片
const highPriority = await queue.filter(card => card.priority > 7);
```

#### 添加卡片

```typescript
// 添加卡片对象
await queue.addCard(card);

// 添加卡片 ID
await queue.addCard('card-id-123');

// 批量添加
await Promise.all(cards.map(card => queue.addCard(card)));
```

#### 移除卡片

```typescript
// 移除单个卡片
await queue.removeCard('card-id-123');

// 批量移除
await Promise.all(cardIds.map(id => queue.removeCard(id)));
```

#### 处理复习

```typescript
// 评分卡片
await queue.handleReview(cardId, 3); // 3 = Good

// 评分映射
// 1 = Again (重来)
// 2 = Hard (困难)
// 3 = Good (良好)
// 4 = Easy (简单)
```

### 高级操作

#### 排序队列

```typescript
// 使用默认排序（按到期日期）
await queue.sort();

// 使用自定义排序
await queue.sort((a, b) => {
    // 按优先级降序
    return b.priority - a.priority;
});
```

#### 重新排序

```typescript
// 获取当前卡片
const cards = await queue.getAllCards();

// 重新排列
const reordered = [...cards].reverse();

// 应用新顺序
await queue.reorder(reordered);
```

#### 清空队列

```typescript
// 清空队列（动态队列会重新加载）
await queue.clear();

// 清除自定义排序
queue.clearCustomOrder();
```

## 观察者模式

### 实现观察者

```typescript
import type { IDataSourceObserver, DataChangeEvent } from '@/types/unified-data-source';

class MyComponent implements IDataSourceObserver {
    private manager: UnifiedDataSourceManager;
    
    constructor(plugin: FSRSPlugin) {
        this.manager = new UnifiedDataSourceManager(plugin);
        
        // 注册观察者
        this.manager.registerObserver(this);
    }
    
    onDataChanged(event: DataChangeEvent): void {
        console.log('Data changed:', event.type);
        
        switch (event.type) {
            case 'card-updated':
                this.handleCardUpdated(event.cardIds);
                break;
            case 'card-deleted':
                this.handleCardDeleted(event.cardIds);
                break;
            case 'queue-changed':
                this.handleQueueChanged(event.queueType);
                break;
            case 'mode-switched':
                this.handleModeSwitched();
                break;
        }
    }
    
    private handleCardUpdated(cardIds?: string[]): void {
        // 刷新显示的卡片
        this.refreshCards(cardIds);
    }
    
    private handleCardDeleted(cardIds?: string[]): void {
        // 从 UI 中移除卡片
        this.removeCardsFromUI(cardIds);
    }
    
    private handleQueueChanged(queueType?: QueueType): void {
        // 重新加载队列
        this.reloadQueue();
    }
    
    private handleModeSwitched(): void {
        // 重新初始化 UI
        this.reinitialize();
    }
    
    destroy(): void {
        // 取消注册观察者
        this.manager.unregisterObserver(this);
    }
}
```


### 手动触发通知

```typescript
// 在队列中触发通知
this.manager.notifyObservers({
    type: 'card-updated',
    cardIds: ['card-1', 'card-2'],
    timestamp: Date.now()
});
```

## 数据路由

### 模式感知访问

```typescript
const manager = new UnifiedDataSourceManager(plugin);

// 获取当前模式
const mode = manager.getCurrentMode();

if (mode === 'simple') {
    // 简单模式：只读，功能有限
    console.log('Simple mode: read-only access');
} else {
    // 高级模式：完整功能
    console.log('Advanced mode: full access');
}
```

### 直接数据访问

```typescript
// 获取单个卡片
const card = await manager.getCard('card-id-123');

// 获取多个卡片（带过滤）
const cards = await manager.getCards({
    cardType: 'item',
    dueDate: { lte: new Date() },
    priority: { min: 5 }
});

// 更新卡片
await manager.updateCard(card);

// 删除卡片
await manager.deleteCard('card-id-123');
```

### 可用队列类型

```typescript
// 简单模式
const simpleQueues = manager.getAvailableQueueTypes();
// ['retrieval-practice', 'final-drill']

// 高级模式
const advancedQueues = manager.getAvailableQueueTypes();
// ['retrieval-practice', 'final-drill', 'incremental-learning', 'filter-group', 'neural-roam']
```

## 测试

### 单元测试

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyCustomQueue } from './MyCustomQueue';
import type { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';

describe('MyCustomQueue', () => {
    let queue: MyCustomQueue;
    let mockManager: UnifiedDataSourceManager;
    
    beforeEach(() => {
        // 创建 mock 管理器
        mockManager = {
            getCards: vi.fn().mockResolvedValue([]),
            getCard: vi.fn(),
            updateCard: vi.fn(),
            notifyObservers: vi.fn(),
        } as any;
        
        queue = new MyCustomQueue(mockManager);
    });
    
    it('should get cards', async () => {
        const mockCards = [
            { id: '1', blockId: '1', due: new Date(), priority: 5 },
            { id: '2', blockId: '2', due: new Date(), priority: 8 },
        ];
        
        mockManager.getCards = vi.fn().mockResolvedValue(mockCards);
        
        const cards = await queue.getCards();
        
        expect(cards).toHaveLength(2);
        expect(mockManager.getCards).toHaveBeenCalled();
    });
    
    it('should add card', async () => {
        await queue.addCard('card-123');
        
        expect(mockManager.notifyObservers).toHaveBeenCalledWith({
            type: 'queue-changed',
            queueType: queue.type,
            timestamp: expect.any(Number)
        });
    });
});
```

### Mock IReviewQueue

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
    getSize: vi.fn().mockResolvedValue(0),
    isEmpty: vi.fn().mockResolvedValue(true),
    sort: vi.fn().mockResolvedValue(undefined),
    filter: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    notifyObservers: vi.fn(),
    clearCustomOrder: vi.fn(),
};
```


### 集成测试

```typescript
describe('Queue Integration', () => {
    let manager: UnifiedDataSourceManager;
    let queue: IReviewQueue;
    
    beforeEach(() => {
        manager = new UnifiedDataSourceManager(mockPlugin);
        queue = manager.getQueue('retrieval-practice');
    });
    
    it('should handle full workflow', async () => {
        // 1. 添加卡片
        await queue.addCard('card-123');
        
        // 2. 获取卡片
        const cards = await queue.getAllCards();
        expect(cards).toContainEqual(expect.objectContaining({ id: 'card-123' }));
        
        // 3. 处理复习
        await queue.handleReview('card-123', 3);
        
        // 4. 验证卡片已移除
        const afterReview = await queue.getAllCards();
        expect(afterReview).not.toContainEqual(expect.objectContaining({ id: 'card-123' }));
    });
});
```

## 最佳实践

### 1. 使用 UnifiedDataSourceManager

```typescript
// ✅ 推荐：通过管理器获取队列
const manager = new UnifiedDataSourceManager(plugin);
const queue = manager.getQueue('retrieval-practice');

// ❌ 不推荐：直接实例化队列
const queue = new RetrievalPracticeQueue(config);
```

### 2. 实现观察者接口

```typescript
// ✅ 推荐：实现观察者以自动响应变更
class MyComponent implements IDataSourceObserver {
    onDataChanged(event: DataChangeEvent): void {
        // 自动刷新 UI
    }
}

// ❌ 不推荐：手动轮询
setInterval(() => {
    this.refresh();
}, 1000);
```

### 3. 批量操作

```typescript
// ✅ 推荐：并行处理
await Promise.all(cards.map(card => queue.addCard(card)));

// ❌ 不推荐：串行处理
for (const card of cards) {
    await queue.addCard(card);
}
```

### 4. 错误处理

```typescript
// ✅ 推荐：捕获并处理错误
try {
    await queue.handleReview(cardId, rating);
} catch (error) {
    console.error('Review failed:', error);
    // 显示错误消息给用户
    showErrorNotification('复习失败，请重试');
}

// ❌ 不推荐：忽略错误
await queue.handleReview(cardId, rating);
```

### 5. 资源清理

```typescript
// ✅ 推荐：清理资源
class MyComponent implements IDataSourceObserver {
    destroy(): void {
        this.manager.unregisterObserver(this);
    }
}

// ❌ 不推荐：不清理
// 可能导致内存泄漏
```


## 常见模式

### 模式 1: 复习界面

```typescript
class ReviewDialog implements IDataSourceObserver {
    private manager: UnifiedDataSourceManager;
    private queue: IReviewQueue;
    private currentCard: FSRSCard | null = null;
    
    constructor(plugin: FSRSPlugin, queueType: QueueType) {
        this.manager = new UnifiedDataSourceManager(plugin);
        this.queue = this.manager.getQueue(queueType);
        this.manager.registerObserver(this);
    }
    
    async open(): Promise<void> {
        // 加载第一张卡片
        this.currentCard = await this.queue.getNextCard();
        if (this.currentCard) {
            this.displayCard(this.currentCard);
        } else {
            this.showEmptyMessage();
        }
    }
    
    async handleRating(rating: number): Promise<void> {
        if (!this.currentCard) return;
        
        // 处理评分
        await this.queue.handleReview(this.currentCard.id, rating);
        
        // 加载下一张卡片
        this.currentCard = await this.queue.getNextCard();
        if (this.currentCard) {
            this.displayCard(this.currentCard);
        } else {
            this.showCompletionMessage();
        }
    }
    
    onDataChanged(event: DataChangeEvent): void {
        if (event.type === 'queue-changed') {
            // 队列变更，重新加载
            this.open();
        }
    }
    
    destroy(): void {
        this.manager.unregisterObserver(this);
    }
}
```

### 模式 2: 卡片浏览器

```typescript
class CardBrowser implements IDataSourceObserver {
    private manager: UnifiedDataSourceManager;
    private queue: IReviewQueue;
    private displayedCards: FSRSCard[] = [];
    
    constructor(plugin: FSRSPlugin, queueType: QueueType) {
        this.manager = new UnifiedDataSourceManager(plugin);
        this.queue = this.manager.getQueue(queueType);
        this.manager.registerObserver(this);
    }
    
    async load(): Promise<void> {
        this.displayedCards = await this.queue.getAllCards();
        this.render();
    }
    
    async deleteCard(cardId: string): Promise<void> {
        await this.queue.removeCard(cardId);
        // 观察者会自动触发刷新
    }
    
    async reorderCards(newOrder: FSRSCard[]): Promise<void> {
        const success = await this.queue.reorder(newOrder);
        if (success) {
            this.displayedCards = newOrder;
            this.render();
        }
    }
    
    onDataChanged(event: DataChangeEvent): void {
        if (event.type === 'card-deleted' || event.type === 'queue-changed') {
            this.load();
        }
    }
    
    destroy(): void {
        this.manager.unregisterObserver(this);
    }
}
```

### 模式 3: 统计面板

```typescript
class StatisticsPanel implements IDataSourceObserver {
    private manager: UnifiedDataSourceManager;
    private queues: Map<QueueType, IReviewQueue> = new Map();
    
    constructor(plugin: FSRSPlugin) {
        this.manager = new UnifiedDataSourceManager(plugin);
        this.manager.registerObserver(this);
        
        // 加载所有队列
        const types = this.manager.getAvailableQueueTypes();
        for (const type of types) {
            this.queues.set(type, this.manager.getQueue(type));
        }
    }
    
    async loadStatistics(): Promise<void> {
        const stats = new Map<QueueType, number>();
        
        for (const [type, queue] of this.queues) {
            const size = await queue.getSize();
            stats.set(type, size);
        }
        
        this.displayStatistics(stats);
    }
    
    onDataChanged(event: DataChangeEvent): void {
        // 任何数据变更都刷新统计
        this.loadStatistics();
    }
    
    destroy(): void {
        this.manager.unregisterObserver(this);
    }
}
```


## 故障排除

### 问题 1: 队列为空

**症状**: `getAllCards()` 返回空数组

**可能原因**:
1. 没有到期的卡片（动态队列）
2. 队列未初始化
3. 过滤条件太严格

**解决方案**:
```typescript
// 检查队列类型
console.log('Queue type:', queue.getType());
console.log('Is dynamic:', queue.isDynamic());

// 检查队列大小
const size = await queue.getSize();
console.log('Queue size:', size);

// 刷新队列
await queue.refresh();
```

### 问题 2: 观察者未收到通知

**症状**: 数据变更后 UI 没有更新

**可能原因**:
1. 观察者未注册
2. 观察者被意外取消注册
3. 事件类型不匹配

**解决方案**:
```typescript
// 确保注册观察者
this.manager.registerObserver(this);

// 检查事件类型
onDataChanged(event: DataChangeEvent): void {
    console.log('Event received:', event.type);
    // 处理所有事件类型
}

// 确保不会过早取消注册
// 只在组件销毁时取消注册
```

### 问题 3: 性能问题

**症状**: 操作很慢

**可能原因**:
1. 串行处理大量操作
2. 频繁刷新
3. 未使用缓存

**解决方案**:
```typescript
// ✅ 使用并行处理
await Promise.all(cards.map(card => queue.addCard(card)));

// ✅ 避免频繁刷新
// 使用观察者模式而不是轮询

// ✅ 缓存队列实例
this.queue = this.manager.getQueue('retrieval-practice');
// 重复使用同一个实例
```

### 问题 4: 类型错误

**症状**: TypeScript 编译错误

**可能原因**:
1. 使用了旧的 `QueueItem` 类型
2. 方法签名不匹配

**解决方案**:
```typescript
// ✅ 使用 FSRSCard
import type { FSRSCard } from '@/types/card';

// ✅ 使用正确的方法名
await queue.getAllCards(); // 不是 getAllItems()
await queue.addCard(card); // 不是 addItems()
```

### 问题 5: 卡片未持久化

**症状**: 应用重启后卡片丢失

**可能原因**:
1. 未调用持久化方法
2. localStorage 已满
3. 持久化失败但未捕获错误

**解决方案**:
```typescript
// 确保持久化
private async persistState(): Promise<void> {
    try {
        const data = Array.from(this.manualCards);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        console.error('Failed to persist:', error);
        // 处理错误（例如：清理旧数据）
    }
}

// 在添加/删除后调用
await this.persistState();
```

## 调试技巧

### 1. 启用详细日志

```typescript
// 在队列方法中添加日志
console.log(`[${this.name}] Getting cards...`);
console.log(`[${this.name}] Found ${cards.length} cards`);
```

### 2. 检查队列状态

```typescript
// 打印队列信息
console.log('Queue type:', queue.getType());
console.log('Is dynamic:', queue.isDynamic());
console.log('Queue size:', await queue.getSize());
console.log('Is empty:', await queue.isEmpty());
```

### 3. 监控观察者

```typescript
onDataChanged(event: DataChangeEvent): void {
    console.log('Observer notified:', {
        type: event.type,
        cardIds: event.cardIds,
        queueType: event.queueType,
        timestamp: new Date(event.timestamp).toISOString()
    });
}
```

### 4. 验证数据完整性

```typescript
const cards = await queue.getAllCards();
for (const card of cards) {
    console.assert(card.id, 'Card missing id');
    console.assert(card.blockId, 'Card missing blockId');
    console.assert(card.due, 'Card missing due date');
}
```

## 参考资源

- [队列架构文档](./QUEUE_ARCHITECTURE.md) - 架构概述
- [API 参考文档](./API_REFERENCE.md) - 完整 API 文档
- [迁移指南](./MIGRATION_GUIDE.md) - 从旧架构迁移
- [IReviewQueue 接口](../src/types/unified-data-source.ts) - 接口定义
- [BaseReviewQueue](../src/queues/BaseReviewQueue.ts) - 基类实现
- [示例队列](../src/queues/RetrievalPracticeQueue.ts) - 完整示例

## 获取帮助

如果遇到问题：

1. 查看本指南的故障排除部分
2. 查看 API 参考文档
3. 查看源代码中的注释和示例
4. 提交 Issue 或联系维护者

## 贡献

欢迎贡献！如果你：

- 发现了 bug
- 有功能建议
- 想要改进文档
- 想要添加新队列类型

请提交 Pull Request 或 Issue。

## 许可证

本项目采用 MIT 许可证。
