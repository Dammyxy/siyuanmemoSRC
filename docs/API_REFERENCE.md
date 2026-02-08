# API 参考文档

## 概述

本文档提供 FSRS 插件队列系统的 API 参考。

## 核心接口

### IReviewQueue

队列的统一接口，所有队列类型都实现此接口。

**位置**: `src/types/unified-data-source.ts`

#### 属性

```typescript
interface IReviewQueue {
    name: string;           // 队列名称
    type: QueueType;        // 队列类型
}
```

#### 方法

##### getType()

获取队列类型。

```typescript
getType(): QueueType
```

**返回值**: 队列类型枚举值

**示例**:
```typescript
const type = queue.getType(); // 'retrieval-practice'
```

---

##### getAllCards()

获取队列中的所有卡片（经过过滤）。

```typescript
getAllCards(): Promise<FSRSCard[]>
```

**返回值**: Promise<FSRSCard[]> - 卡片数组

**说明**: 
- 动态队列：返回到期的卡片
- 静态队列：返回所有手动添加的卡片

**示例**:
```typescript
const cards = await queue.getAllCards();
console.log(`队列中有 ${cards.length} 张卡片`);
```

---

##### getNextCard()

获取下一张待复习的卡片。

```typescript
getNextCard(): Promise<FSRSCard | null>
```

**返回值**: Promise<FSRSCard | null> - 下一张卡片，如果队列为空则返回 null

**示例**:
```typescript
const card = await queue.getNextCard();
if (card) {
    console.log(`下一张卡片: ${card.blockId}`);
}
```

---

##### addCard()

添加卡片到队列。

```typescript
addCard(card: FSRSCard | string, source?: 'manual' | 'auto-failed'): Promise<void>
```

**参数**:
- `card`: FSRSCard 对象或卡片 ID 字符串
- `source`: 可选，来源类型
  - `'manual'`: 手动添加
  - `'auto-failed'`: 自动添加（评分失败）

**示例**:
```typescript
// 添加卡片对象
await queue.addCard(card, 'manual');

// 添加卡片 ID
await queue.addCard('card-id-123', 'manual');
```

---

##### removeCard()

从队列中移除卡片。

```typescript
removeCard(cardIdOrBlockId: string): Promise<void>
```

**参数**:
- `cardIdOrBlockId`: 卡片 ID 或 Block ID

**示例**:
```typescript
await queue.removeCard('card-id-123');
```

---

##### updateCard()

更新卡片数据。

```typescript
updateCard(card: FSRSCard): Promise<void>
```

**参数**:
- `card`: 要更新的卡片对象

**示例**:
```typescript
card.priority = 10;
await queue.updateCard(card);
```

---

##### handleReview()

处理卡片复习（评分）。

```typescript
handleReview(cardId: string, rating: number): Promise<void>
```

**参数**:
- `cardId`: 卡片 ID
- `rating`: 评分 (1-4)
  - 1: Again (重来)
  - 2: Hard (困难)
  - 3: Good (良好)
  - 4: Easy (简单)

**示例**:
```typescript
await queue.handleReview('card-id-123', 3); // 评分为 Good
```

---

##### isDynamic()

判断是否为动态队列。

```typescript
isDynamic(): boolean
```

**返回值**: boolean
- `true`: 动态队列（自动获取到期卡片）
- `false`: 静态队列（手动管理）

**示例**:
```typescript
if (queue.isDynamic()) {
    console.log('这是一个动态队列');
}
```

---

##### refresh()

刷新队列数据。

```typescript
refresh(): Promise<void>
```

**说明**: 重新从数据源加载卡片

**示例**:
```typescript
await queue.refresh();
```

---

##### clear()

清空队列。

```typescript
clear(): Promise<void>
```

**说明**: 
- 动态队列：清除缓存
- 静态队列：移除所有卡片

**示例**:
```typescript
await queue.clear();
```

---

##### reorder()

重新排序队列。

```typescript
reorder(orderedCards: FSRSCard[]): Promise<boolean>
```

**参数**:
- `orderedCards`: 按新顺序排列的卡片数组

**返回值**: Promise<boolean>
- `true`: 重排序成功
- `false`: 不支持或失败

**说明**:
- 动态队列：临时排序覆盖（不持久化）
- 静态队列：持久化排序

**示例**:
```typescript
const cards = await queue.getAllCards();
const sorted = cards.sort((a, b) => b.priority - a.priority);
await queue.reorder(sorted);
```

---

## UnifiedDataSourceManager

统一数据源管理器，管理所有队列实例。

**位置**: `src/managers/UnifiedDataSourceManager.ts`

### 构造函数

```typescript
constructor(plugin: FSRSPlugin)
```

**参数**:
- `plugin`: FSRS 插件实例

### 方法

##### getQueue()

获取指定类型的队列实例。

```typescript
getQueue(type: QueueType): IReviewQueue
```

**参数**:
- `type`: 队列类型
  - `'retrieval-practice'`: 检索练习队列
  - `'final-drill'`: 最终训练队列
  - `'incremental-learning'`: 渐进学习队列
  - `'filter-group'`: 过滤组队列
  - `'neural-roam'`: 神经漫游队列

**返回值**: IReviewQueue - 队列实例

**示例**:
```typescript
const queue = manager.getQueue('retrieval-practice');
```

---

##### registerObserver()

注册观察者以接收数据变更通知。

```typescript
registerObserver(observer: IDataSourceObserver): void
```

**参数**:
- `observer`: 实现 IDataSourceObserver 接口的对象

**示例**:
```typescript
class MyComponent implements IDataSourceObserver {
    onDataChanged(event: DataChangeEvent): void {
        console.log('数据已变更:', event);
    }
}

const component = new MyComponent();
manager.registerObserver(component);
```

---

##### unregisterObserver()

取消注册观察者。

```typescript
unregisterObserver(observer: IDataSourceObserver): void
```

**参数**:
- `observer`: 要取消注册的观察者对象

**示例**:
```typescript
manager.unregisterObserver(component);
```

---

##### getCurrentMode()

获取当前操作模式。

```typescript
getCurrentMode(): OperationMode
```

**返回值**: OperationMode
- `'simple'`: 简单模式（Riff API）
- `'advanced'`: 高级模式（本地存储）

**示例**:
```typescript
const mode = manager.getCurrentMode();
if (mode === 'simple') {
    console.log('当前为简单模式');
}
```

---

## 数据类型

### FSRSCard

卡片数据结构。

**位置**: `src/types/card.ts`

```typescript
interface FSRSCard {
    // 基本信息
    id: string;                    // 卡片 ID
    blockId: string;               // 思源块 ID
    rootId: string;                // 根文档 ID
    
    // FSRS 参数
    due: Date;                     // 到期时间
    state: number;                 // 状态 (0=New, 1=Learning, 2=Review, 3=Relearning)
    stability: number;             // 稳定性
    difficulty: number;            // 难度
    elapsedDays: number;          // 经过天数
    scheduledDays: number;        // 计划天数
    reps: number;                 // 复习次数
    lapses: number;               // 遗忘次数
    lastReview?: Date;            // 上次复习时间
    
    // 自定义属性
    priority?: number;            // 优先级 (0-10)
    tags?: string[];              // 标签
    type?: CardType;              // 卡片类型
    suspended?: boolean;          // 是否暂停
    
    // 元数据
    meta?: Record<string, any>;   // 额外元数据
}
```

---

### QueueType

队列类型枚举。

**位置**: `src/types/unified-data-source.ts`

```typescript
enum QueueType {
    RetrievalPractice = 'retrieval-practice',    // 检索练习
    FinalDrill = 'final-drill',                  // 最终训练
    IncrementalLearning = 'incremental-learning', // 渐进学习
    FilterGroup = 'filter-group',                // 过滤组
    NeuralRoam = 'neural-roam',                  // 神经漫游
}
```

---

### DataChangeEvent

数据变更事件。

**位置**: `src/types/unified-data-source.ts`

```typescript
interface DataChangeEvent {
    type: DataChangeEventType;     // 事件类型
    cardIds?: string[];            // 受影响的卡片 ID
    queueType?: QueueType;         // 受影响的队列类型
    timestamp: number;             // 时间戳
}

type DataChangeEventType =
    | 'card-updated'    // 卡片更新
    | 'card-deleted'    // 卡片删除
    | 'queue-changed'   // 队列变更
    | 'mode-switched';  // 模式切换
```

---

### IDataSourceObserver

观察者接口。

**位置**: `src/types/unified-data-source.ts`

```typescript
interface IDataSourceObserver {
    onDataChanged(event: DataChangeEvent): void;
}
```

**实现示例**:
```typescript
class MyAdapter implements IDataSourceObserver {
    onDataChanged(event: DataChangeEvent): void {
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
}
```

---

## 使用示例

### 完整示例：创建复习界面

```typescript
import { UnifiedDataSourceManager } from './managers/UnifiedDataSourceManager';
import type { IDataSourceObserver, DataChangeEvent } from './types/unified-data-source';

class ReviewComponent implements IDataSourceObserver {
    private manager: UnifiedDataSourceManager;
    private currentQueue: IReviewQueue;
    
    constructor(plugin: FSRSPlugin) {
        // 1. 创建管理器
        this.manager = new UnifiedDataSourceManager(plugin);
        
        // 2. 注册观察者
        this.manager.registerObserver(this);
        
        // 3. 获取队列
        this.currentQueue = this.manager.getQueue('retrieval-practice');
    }
    
    async loadCards(): Promise<void> {
        // 4. 获取卡片
        const cards = await this.currentQueue.getAllCards();
        console.log(`加载了 ${cards.length} 张卡片`);
        
        // 5. 显示在 UI
        this.renderCards(cards);
    }
    
    async reviewCard(cardId: string, rating: number): Promise<void> {
        // 6. 处理评分
        await this.currentQueue.handleReview(cardId, rating);
        
        // 7. 观察者会自动收到通知，UI 会自动刷新
    }
    
    onDataChanged(event: DataChangeEvent): void {
        // 8. 响应数据变更
        console.log('数据已变更:', event.type);
        
        // 9. 刷新 UI
        this.loadCards();
    }
    
    destroy(): void {
        // 10. 清理
        this.manager.unregisterObserver(this);
    }
}
```

---

## 错误处理

### 常见错误

#### 1. 队列未初始化

```typescript
try {
    const cards = await queue.getAllCards();
} catch (error) {
    console.error('队列未初始化:', error);
}
```

#### 2. 卡片不存在

```typescript
try {
    await queue.removeCard('non-existent-id');
} catch (error) {
    console.error('卡片不存在:', error);
}
```

#### 3. 评分失败

```typescript
try {
    await queue.handleReview('card-id', 3);
} catch (error) {
    console.error('评分失败:', error);
    // 可以重试或显示错误消息
}
```

---

## 性能优化

### 1. 批量操作

```typescript
// ❌ 不推荐：逐个添加
for (const card of cards) {
    await queue.addCard(card);
}

// ✅ 推荐：批量添加
await Promise.all(cards.map(card => queue.addCard(card)));
```

### 2. 缓存队列实例

```typescript
// ✅ 推荐：缓存队列实例
const queue = manager.getQueue('retrieval-practice');

// 多次使用同一个实例
await queue.getAllCards();
await queue.getNextCard();
```

### 3. 避免频繁刷新

```typescript
// ❌ 不推荐：每次操作后都刷新
await queue.addCard(card);
await queue.refresh();

// ✅ 推荐：使用观察者模式自动刷新
// 观察者会在数据变更时自动收到通知
```

---

## 参考链接

- [队列架构文档](./QUEUE_ARCHITECTURE.md)
- [迁移指南](./MIGRATION_GUIDE.md)
- [开发者指南](./DEVELOPER_GUIDE.md)
- [类型定义](../src/types/unified-data-source.ts)
