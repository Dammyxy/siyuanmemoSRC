# 动态队列保护策略

## 背景

我们的队列系统是动态的，需要实时响应卡片的增删改操作。在进行性能优化时，必须确保不会破坏队列的动态特性。

## 核心原则

### 原则 1：永远不缓存队列数据本身

```typescript
// ❌ 错误：缓存队列项列表
private queueItemsCache: FSRSCard[] | null = null;

async getQueueItems(): Promise<FSRSCard[]> {
  if (this.queueItemsCache) {
    return this.queueItemsCache;  // 会导致队列不同步
  }
  // ...
}

// ✅ 正确：每次都从队列获取最新数据
async getQueueItems(): Promise<FSRSCard[]> {
  return await this.queue.getAllItems();  // 始终获取最新数据
}
```

### 原则 2：只缓存计算密集型的结果

```typescript
// ✅ 可以缓存：nextDues 计算结果
private nextDuesCache = new Map<string, Record<number, string>>();

async addNextDues(card: FSRSCard): Promise<any> {
  const cacheKey = `${card.id}-${card.state}-${card.due}-${card.reps}`;
  
  if (this.nextDuesCache.has(cacheKey)) {
    return { ...card, nextDues: this.nextDuesCache.get(cacheKey) };
  }
  
  // 计算 nextDues（耗时操作）
  const nextDues = await this.calculateNextDues(card);
  this.nextDuesCache.set(cacheKey, nextDues);
  
  return { ...card, nextDues };
}
```

### 原则 3：关键事件立即响应

```typescript
// ✅ 正确：关键事件立即失效缓存
queue.subscribe((event) => {
  if (event.type === 'card-removed' || event.type === 'queue-cleared') {
    // 立即失效缓存
    this.invalidateCache();
    // 立即重新加载
    void this.reloadCards();
  }
});

// ❌ 错误：使用防抖延迟响应
const debouncedReload = debounce(() => {
  this.invalidateCache();
  void this.reloadCards();
}, 500);

queue.subscribe((event) => {
  debouncedReload();  // 会导致 500ms 延迟，队列不同步
});
```

### 原则 4：精细化缓存失效

```typescript
// ✅ 正确：根据操作类型决定失效范围
async handleAction(actionId: string, cards: BrowserCard[]) {
  await performAction(actionId, cards);
  
  if (actionId === 'delete-card') {
    // 删除卡片：全量失效（影响队列大小和统计）
    invalidateAllCache();
    await loadData(true);
  } else if (actionId === 'postpone') {
    // 推迟卡片：只失效该卡片的缓存
    invalidateCardCache(cards.map(c => c.id));
    // 不需要重新加载，下次 next() 会自动获取最新数据
  } else if (actionId === 'set-priority') {
    // 设置优先级：只失效该卡片的缓存
    invalidateCardCache(cards.map(c => c.id));
  }
}

// ❌ 错误：所有操作都全量失效
async handleAction(actionId: string, cards: BrowserCard[]) {
  await performAction(actionId, cards);
  invalidateAllCache();  // 太激进，影响性能
  await loadData(true);
}
```

## 可以缓存的内容

### 1. 计算结果

```typescript
// ✅ nextDues 计算结果
private nextDuesCache = new Map<string, Record<number, string>>();

// ✅ 格式化后的显示数据
private formattedDataCache = new Map<string, FormattedCard>();
```

### 2. UI 实例

```typescript
// ✅ Protyle 实例（UI 层）
private protyleCache = new Map<string, Protyle>();

// ✅ 渲染结果
private renderCache = new Map<string, HTMLElement>();
```

### 3. 检测结果

```typescript
// ✅ 卡片类型检测结果
private cardTypeCache = new Map<string, {
  isQuick: boolean;
  isDescriptor: boolean;
  isConcept: boolean;
}>();
```

## 不能缓存的内容

### 1. 队列数据

```typescript
// ❌ 队列项列表
private queueItemsCache: FSRSCard[] | null = null;

// ❌ 队列大小
private queueSizeCache: number | null = null;

// ❌ 队列统计
private queueStatsCache: QueueStats | null = null;

// ❌ 当前卡片
private currentCardCache: FSRSCard | null = null;
```

### 2. 实时状态

```typescript
// ❌ 卡片的 due 时间（会动态变化）
private dueTimeCache = new Map<string, Date>();

// ❌ 卡片的 state（会动态变化）
private cardStateCache = new Map<string, CardState>();
```

## 缓存失效策略

### 1. 操作类型分类

```typescript
// 全量失效操作（影响队列结构）
const FULL_INVALIDATION_ACTIONS = [
  'delete-card',
  'reset',
  'spread',
  'auto-sort',
  'remove-from-queue',
  'dismiss',
];

// 部分失效操作（只影响特定卡片）
const PARTIAL_INVALIDATION_ACTIONS = [
  'postpone',
  'advance',
  'set-priority',
  'suspend',
];

// 不失效操作（不影响数据）
const NO_INVALIDATION_ACTIONS = [
  'open',
  'review-subset',
];
```

### 2. 失效实现

```typescript
function invalidateCache(actionId: string, cardIds: string[]): void {
  if (FULL_INVALIDATION_ACTIONS.includes(actionId)) {
    // 全量失效
    nextDuesCache.clear();
    cardTypeCache.clear();
    formattedDataCache.clear();
  } else if (PARTIAL_INVALIDATION_ACTIONS.includes(actionId)) {
    // 部分失效
    for (const cardId of cardIds) {
      // 删除该卡片的所有缓存
      for (const [key, value] of nextDuesCache.entries()) {
        if (key.startsWith(cardId)) {
          nextDuesCache.delete(key);
        }
      }
      cardTypeCache.delete(cardId);
      formattedDataCache.delete(cardId);
    }
  }
  // NO_INVALIDATION_ACTIONS：不做任何操作
}
```

## 队列监听器策略

### 1. 事件分类

```typescript
// 立即响应事件（影响队列结构）
const IMMEDIATE_EVENTS = [
  'card-removed',
  'queue-cleared',
  'queue-rebuilt',
];

// 延迟响应事件（只影响数据）
const DEFERRED_EVENTS = [
  'card-updated',
  'card-added',
];
```

### 2. 监听器实现

```typescript
private subscribeToQueueChanges(): void {
  this.unsubscribe = this.queue.subscribe((event) => {
    if (IMMEDIATE_EVENTS.includes(event.type)) {
      // 立即失效缓存并重新加载
      this.invalidateCache();
      void this.reloadCards();
    } else if (DEFERRED_EVENTS.includes(event.type)) {
      // 只失效缓存，不重新加载
      // 下次 next() 调用时会自动获取最新数据
      this.invalidateCache();
    }
  });
}
```

## 测试用例

### 1. 队列动态性测试

```typescript
describe('Queue Dynamic Behavior', () => {
  it('should reflect card removal immediately', async () => {
    const queue = createQueue();
    const adapter = new UnifiedQueueStrategy(queue);
    
    const initialSize = await adapter.getRemainingSize();
    
    // 删除一张卡片
    await queue.remove(cardId);
    
    // 立即检查大小（不应该使用缓存）
    const newSize = await adapter.getRemainingSize();
    expect(newSize).toBe(initialSize - 1);
  });
  
  it('should reflect card update immediately', async () => {
    const queue = createQueue();
    const adapter = new UnifiedQueueStrategy(queue);
    
    const card = await adapter.next();
    
    // 更新卡片
    await updateCard(card.id, { priority: 100 });
    
    // 下次获取应该是更新后的数据
    const nextCard = await adapter.next();
    expect(nextCard.priority).toBe(100);
  });
  
  it('should not cache queue items', async () => {
    const queue = createQueue();
    const adapter = new UnifiedQueueStrategy(queue);
    
    // 第一次获取
    const items1 = await adapter.getQueueItems();
    
    // 添加新卡片
    await queue.add(newCard);
    
    // 第二次获取应该包含新卡片
    const items2 = await adapter.getQueueItems();
    expect(items2.length).toBe(items1.length + 1);
  });
});
```

### 2. 缓存失效测试

```typescript
describe('Cache Invalidation', () => {
  it('should invalidate cache on delete', async () => {
    const adapter = new UnifiedQueueStrategy(queue);
    
    // 计算 nextDues（会缓存）
    const card1 = await adapter.addNextDues(card);
    
    // 删除卡片
    await handleAction('delete-card', [card]);
    
    // 缓存应该被清除
    expect(adapter.nextDuesCache.size).toBe(0);
  });
  
  it('should partially invalidate cache on postpone', async () => {
    const adapter = new UnifiedQueueStrategy(queue);
    
    // 计算多张卡片的 nextDues
    await adapter.addNextDues(card1);
    await adapter.addNextDues(card2);
    
    // 推迟 card1
    await handleAction('postpone', [card1]);
    
    // 只有 card1 的缓存被清除
    expect(adapter.nextDuesCache.has(getCacheKey(card1))).toBe(false);
    expect(adapter.nextDuesCache.has(getCacheKey(card2))).toBe(true);
  });
});
```

### 3. 性能测试

```typescript
describe('Performance', () => {
  it('should improve nextDues calculation performance', async () => {
    const adapter = new UnifiedQueueStrategy(queue);
    
    // 第一次计算（无缓存）
    const start1 = performance.now();
    await adapter.addNextDues(card);
    const time1 = performance.now() - start1;
    
    // 第二次计算（有缓存）
    const start2 = performance.now();
    await adapter.addNextDues(card);
    const time2 = performance.now() - start2;
    
    // 缓存应该显著提升性能
    expect(time2).toBeLessThan(time1 * 0.1);
  });
  
  it('should not degrade queue operation performance', async () => {
    const adapter = new UnifiedQueueStrategy(queue);
    
    // 测试队列操作性能
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      await adapter.next();
    }
    const time = performance.now() - start;
    
    // 平均每次操作应该小于 10ms
    expect(time / 100).toBeLessThan(10);
  });
});
```

## 实施检查清单

在实施性能优化时，请确保：

- [ ] 没有缓存队列数据本身（`queue.getAllItems()`, `queue.size()`, `queue.getStats()`）
- [ ] 只缓存计算密集型的结果（nextDues, 卡片类型检测等）
- [ ] 关键事件（card-removed, queue-cleared）立即响应，不使用防抖
- [ ] 根据操作类型精细化缓存失效（全量/部分/不失效）
- [ ] 添加了动态性测试用例
- [ ] 添加了性能测试用例
- [ ] 文档说明了哪些可以缓存，哪些不能缓存

## 总结

性能优化的目标是提升用户体验，但不能以牺牲功能正确性为代价。对于动态队列系统，我们必须：

1. **永远不缓存队列数据本身**
2. **只缓存计算结果**
3. **关键事件立即响应**
4. **精细化缓存失效**
5. **充分测试动态性**

遵循这些原则，我们可以在保持队列动态特性的同时，显著提升性能。
