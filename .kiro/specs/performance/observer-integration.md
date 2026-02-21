# 观察者模式在性能优化中的应用

## 背景

你的项目已经有两套观察者模式实现：

1. **队列观察者** (`QueueObserver`) - 用于队列变更通知
2. **事件总线** (`EventBus`) - 用于领域事件发布/订阅

这两套机制可以完美地应用到性能优化中，实现智能缓存失效和实时数据同步。

## 现有观察者模式

### 1. 队列观察者 (QueueObserver)

```typescript
// 接口定义
export interface QueueObserver {
  onQueueUpdate(queue: IReviewQueue): void;
}

// 队列实现
export class BaseReviewQueue implements IReviewQueue {
  protected observers: QueueObserver[] = [];
  
  subscribe(observer: QueueObserver): void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }
  
  unsubscribe(observer: QueueObserver): void {
    this.observers = this.observers.filter(o => o !== observer);
  }
  
  protected notifyObservers(): void {
    for (const observer of this.observers) {
      observer.onQueueUpdate(this);
    }
  }
}
```

### 2. 事件总线 (EventBus)

```typescript
// 事件总线实现
export class EventBus {
  private handlers: Map<string, EventHandler<any>[]> = new Map();
  
  subscribe<T extends DomainEvent>(
    eventName: string,
    handler: EventHandler<T>
  ): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler);
  }
  
  async publish(event: DomainEvent): Promise<void> {
    const eventName = event.getEventName();
    const handlers = this.handlers.get(eventName) || [];
    
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Error handling event ${eventName}:`, error);
      }
    }
  }
}
```

## 性能优化集成方案

### 方案 1: 使用队列观察者实现智能缓存失效

#### 1.1 创建缓存管理观察者

```typescript
/**
 * 缓存管理观察者
 * 
 * 监听队列变更，智能失效缓存。
 */
export class CacheManagerObserver implements QueueObserver {
  private nextDuesCache = new LRUCache<string, Record<number, string>>(100);
  private cardTypeCache = new LRUCache<string, CardType>(50);
  
  /**
   * 队列更新时调用
   * 
   * 根据更新类型决定缓存失效策略。
   */
  onQueueUpdate(queue: IReviewQueue): void {
    // 获取队列的最后一次操作类型
    const lastOperation = (queue as any).lastOperation;
    
    if (!lastOperation) {
      // 未知操作，保守策略：全量失效
      this.invalidateAll();
      return;
    }
    
    switch (lastOperation.type) {
      case 'card-removed':
      case 'queue-cleared':
        // 影响队列结构，全量失效
        this.invalidateAll();
        break;
        
      case 'card-updated':
        // 只影响特定卡片，部分失效
        this.invalidateCard(lastOperation.cardId);
        break;
        
      case 'card-added':
        // 新增卡片，不影响现有缓存
        break;
        
      default:
        // 未知操作，保守策略
        this.invalidateAll();
    }
  }
  
  /**
   * 失效特定卡片的缓存
   */
  private invalidateCard(cardId: string): void {
    // 删除该卡片的所有缓存
    for (const key of this.nextDuesCache.keys()) {
      if (key.startsWith(cardId)) {
        this.nextDuesCache.delete(key);
      }
    }
    this.cardTypeCache.delete(cardId);
  }
  
  /**
   * 全量失效缓存
   */
  private invalidateAll(): void {
    this.nextDuesCache.clear();
    this.cardTypeCache.clear();
  }
  
  /**
   * 获取 nextDues 缓存
   */
  getNextDuesCache(): LRUCache<string, Record<number, string>> {
    return this.nextDuesCache;
  }
  
  /**
   * 获取卡片类型缓存
   */
  getCardTypeCache(): LRUCache<string, CardType> {
    return this.cardTypeCache;
  }
}
```

#### 1.2 在队列策略中使用

```typescript
/**
 * UnifiedQueueStrategy - 使用观察者模式
 */
export class UnifiedQueueStrategy implements IQueueStrategy<FSRSCard> {
  private queue: IReviewQueue;
  private cacheManager: CacheManagerObserver;
  
  constructor(queue: IReviewQueue) {
    this.queue = queue;
    
    // 创建缓存管理观察者
    this.cacheManager = new CacheManagerObserver();
    
    // 订阅队列变更
    this.queue.subscribe(this.cacheManager);
  }
  
  async next(): Promise<FSRSCard | null> {
    const card = await this.queue.next();
    if (!card) return null;
    
    // 使用缓存计算 nextDues
    return await this.addNextDues(card);
  }
  
  private async addNextDues(card: FSRSCard): Promise<any> {
    const cacheKey = `${card.id}-${card.state}-${card.due}-${card.reps}`;
    const cache = this.cacheManager.getNextDuesCache();
    
    // 检查缓存
    const cached = cache.get(cacheKey);
    if (cached) {
      return { ...card, nextDues: cached };
    }
    
    // 计算 nextDues
    const nextDues = await this.calculateNextDues(card);
    
    // 缓存结果
    cache.set(cacheKey, nextDues);
    
    return { ...card, nextDues };
  }
  
  cleanup(): void {
    // 取消订阅
    this.queue.unsubscribe(this.cacheManager);
  }
}
```

### 方案 2: 使用事件总线实现跨模块缓存同步

#### 2.1 定义缓存相关事件

```typescript
/**
 * 缓存失效事件
 */
export class CacheInvalidatedEvent extends DomainEvent {
  constructor(
    public readonly scope: 'full' | 'partial',
    public readonly cardIds?: string[]
  ) {
    super();
  }
  
  getEventName(): string {
    return 'cache.invalidated';
  }
  
  toJSON() {
    return {
      eventName: this.getEventName(),
      occurredOn: this.occurredOn,
      scope: this.scope,
      cardIds: this.cardIds,
    };
  }
}

/**
 * 队列更新事件
 */
export class QueueUpdatedEvent extends DomainEvent {
  constructor(
    public readonly queueType: QueueType,
    public readonly operation: 'add' | 'remove' | 'update' | 'clear',
    public readonly cardIds?: string[]
  ) {
    super();
  }
  
  getEventName(): string {
    return 'queue.updated';
  }
  
  toJSON() {
    return {
      eventName: this.getEventName(),
      occurredOn: this.occurredOn,
      queueType: this.queueType,
      operation: this.operation,
      cardIds: this.cardIds,
    };
  }
}
```

#### 2.2 在浏览器中订阅事件

```typescript
/**
 * SRSBrowser - 使用事件总线
 */
export default {
  setup(props) {
    const eventBus = props.plugin?.eventBus;
    
    // 订阅缓存失效事件
    const handleCacheInvalidated = async (event: CacheInvalidatedEvent) => {
      console.log('[SRSBrowser] Cache invalidated:', event.scope);
      
      if (event.scope === 'full') {
        // 全量刷新
        await loadData(true);
      } else if (event.scope === 'partial' && event.cardIds) {
        // 部分刷新：只更新受影响的行
        await refreshCards(event.cardIds);
      }
    };
    
    // 订阅队列更新事件
    const handleQueueUpdated = async (event: QueueUpdatedEvent) => {
      console.log('[SRSBrowser] Queue updated:', event.queueType, event.operation);
      
      // 刷新队列统计
      await refreshQueueCounts();
      
      // 如果当前显示的是该队列，刷新数据
      if (activeQueueId.value === event.queueType) {
        if (event.operation === 'remove' || event.operation === 'clear') {
          // 立即刷新
          await loadData(true);
        } else {
          // 延迟刷新（使用节流）
          await loadDataThrottled();
        }
      }
    };
    
    onMounted(() => {
      eventBus?.subscribe('cache.invalidated', handleCacheInvalidated);
      eventBus?.subscribe('queue.updated', handleQueueUpdated);
    });
    
    onUnmounted(() => {
      eventBus?.unsubscribe('cache.invalidated', handleCacheInvalidated);
      eventBus?.unsubscribe('queue.updated', handleQueueUpdated);
    });
    
    return {
      // ...
    };
  }
};
```

#### 2.3 在队列中发布事件

```typescript
/**
 * BaseReviewQueue - 发布事件
 */
export class BaseReviewQueue implements IReviewQueue {
  protected observers: QueueObserver[] = [];
  private eventBus: EventBus;
  
  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }
  
  async remove(cardId: string): Promise<void> {
    // 执行删除操作
    // ...
    
    // 通知观察者
    this.notifyObservers();
    
    // 发布事件
    await this.eventBus.publish(
      new QueueUpdatedEvent(this.getType(), 'remove', [cardId])
    );
    
    // 发布缓存失效事件
    await this.eventBus.publish(
      new CacheInvalidatedEvent('partial', [cardId])
    );
  }
  
  async clear(): Promise<void> {
    // 执行清空操作
    // ...
    
    // 通知观察者
    this.notifyObservers();
    
    // 发布事件
    await this.eventBus.publish(
      new QueueUpdatedEvent(this.getType(), 'clear')
    );
    
    // 发布缓存失效事件
    await this.eventBus.publish(
      new CacheInvalidatedEvent('full')
    );
  }
}
```

### 方案 3: 混合使用（推荐）

结合队列观察者和事件总线的优势：

- **队列观察者**：用于队列内部的缓存管理（性能关键路径）
- **事件总线**：用于跨模块的数据同步（UI 更新、统计刷新）

```typescript
/**
 * 混合方案架构
 */

// 1. 队列内部：使用观察者模式管理缓存
class UnifiedQueueStrategy {
  private cacheManager: CacheManagerObserver;
  
  constructor(queue: IReviewQueue) {
    this.cacheManager = new CacheManagerObserver();
    queue.subscribe(this.cacheManager);  // 队列观察者
  }
}

// 2. 跨模块：使用事件总线同步状态
class BaseReviewQueue {
  private eventBus: EventBus;
  
  async remove(cardId: string): Promise<void> {
    // 执行操作
    // ...
    
    // 通知队列观察者（缓存失效）
    this.notifyObservers();
    
    // 发布领域事件（UI 更新）
    await this.eventBus.publish(
      new QueueUpdatedEvent(this.getType(), 'remove', [cardId])
    );
  }
}

// 3. UI 层：订阅事件总线
const SRSBrowser = {
  setup(props) {
    const eventBus = props.plugin?.eventBus;
    
    onMounted(() => {
      // 订阅队列更新事件
      eventBus?.subscribe('queue.updated', async (event) => {
        await refreshQueueCounts();
        if (event.operation === 'remove') {
          await loadData(true);
        }
      });
    });
  }
};
```

## 性能优化效果

### 1. 智能缓存失效

```typescript
// ✅ 使用观察者模式：自动失效
queue.remove(cardId);  // 自动触发缓存失效

// ❌ 手动失效：容易遗漏
queue.remove(cardId);
invalidateCache(cardId);  // 需要手动调用
```

### 2. 解耦合

```typescript
// ✅ 使用事件总线：解耦
queue.remove(cardId);  // 队列不需要知道浏览器的存在
// 浏览器通过事件总线自动收到通知

// ❌ 直接调用：耦合
queue.remove(cardId);
browser.refresh();  // 队列需要知道浏览器
```

### 3. 可扩展性

```typescript
// ✅ 使用观察者模式：易于扩展
queue.subscribe(cacheManager);
queue.subscribe(statisticsCollector);
queue.subscribe(logger);

// ❌ 硬编码：难以扩展
queue.remove(cardId);
cacheManager.invalidate(cardId);
statisticsCollector.update();
logger.log('removed', cardId);
```

## 实施步骤

### Phase 1: 增强队列观察者

1. 创建 `CacheManagerObserver` 类
2. 在 `UnifiedQueueStrategy` 中使用
3. 添加测试用例

### Phase 2: 定义缓存事件

1. 创建 `CacheInvalidatedEvent`
2. 创建 `QueueUpdatedEvent`
3. 在队列中发布事件

### Phase 3: UI 层订阅事件

1. 在 `SRSBrowser` 中订阅事件
2. 在 `ReviewContent` 中订阅事件
3. 实现事件处理逻辑

### Phase 4: 测试和优化

1. 添加集成测试
2. 性能基准测试
3. 调优事件处理逻辑

## 测试用例

### 1. 队列观察者测试

```typescript
describe('CacheManagerObserver', () => {
  it('should invalidate cache on card removal', () => {
    const queue = createQueue();
    const cacheManager = new CacheManagerObserver();
    queue.subscribe(cacheManager);
    
    // 添加缓存
    const cache = cacheManager.getNextDuesCache();
    cache.set('card-1-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
    
    // 删除卡片
    queue.remove('card-1');
    
    // 缓存应该被清除
    expect(cache.has('card-1-key')).toBe(false);
  });
  
  it('should not invalidate unrelated cache', () => {
    const queue = createQueue();
    const cacheManager = new CacheManagerObserver();
    queue.subscribe(cacheManager);
    
    // 添加缓存
    const cache = cacheManager.getNextDuesCache();
    cache.set('card-1-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
    cache.set('card-2-key', { 1: '1d', 2: '3d', 3: '7d', 4: '14d' });
    
    // 删除 card-1
    queue.remove('card-1');
    
    // card-2 的缓存应该保留
    expect(cache.has('card-2-key')).toBe(true);
  });
});
```

### 2. 事件总线测试

```typescript
describe('Queue Events', () => {
  it('should publish event on card removal', async () => {
    const eventBus = new EventBus();
    const queue = new BaseReviewQueue(eventBus);
    
    let eventReceived = false;
    eventBus.subscribe('queue.updated', (event: QueueUpdatedEvent) => {
      eventReceived = true;
      expect(event.operation).toBe('remove');
    });
    
    await queue.remove('card-1');
    
    expect(eventReceived).toBe(true);
  });
  
  it('should trigger UI refresh on queue update', async () => {
    const eventBus = new EventBus();
    const queue = new BaseReviewQueue(eventBus);
    
    let refreshCalled = false;
    eventBus.subscribe('queue.updated', async () => {
      refreshCalled = true;
    });
    
    await queue.remove('card-1');
    
    expect(refreshCalled).toBe(true);
  });
});
```

## 总结

通过整合现有的观察者模式，我们可以实现：

1. **智能缓存失效**：队列变更自动触发缓存失效
2. **解耦合**：队列、缓存、UI 之间通过事件通信
3. **可扩展性**：易于添加新的观察者和事件处理器
4. **性能优化**：减少不必要的缓存失效和数据刷新
5. **保持动态性**：关键事件立即响应，非关键事件延迟处理

这种方案既能提升性能，又能保持代码的清晰和可维护性。
