# 性能优化

## 1. 性能目标

| 操作 | 数据规模 | 目标时间 |
|------|---------|---------|
| 加载数据 | 10 万卡片 | < 2s |
| 查询到期卡片 | 10 万卡片 | < 100ms |
| 按类型查询 | 10 万卡片 | < 50ms |
| 按块 ID 查询 | 10 万卡片 | < 50ms |
| 创建卡片 | - | < 50ms |
| 更新卡片 | - | < 50ms |
| 删除卡片 | - | < 50ms |
| 保存数据 | 10 万卡片 | < 1s |

## 2. 内存索引优化

### 2.1 索引设计

```typescript
class UnifiedStorageManager {
  // 主数据
  private xiuyuans: Map<string, IXiuyuan> = new Map();
  private cards: Map<string, FSRSCard> = new Map();
  
  // 索引（O(1) 查询）
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  private indexByType: Map<CardType, string[]> = new Map();
  private indexByPriority: Map<number, string[]> = new Map();
  private indexByDue: FSRSCard[] = [];  // 已排序
}
```

### 2.2 索引构建优化

```typescript
private rebuildIndexes(): void {
  console.time('[Storage] Rebuild indexes');
  
  // 清空索引
  this.indexByBlockID.clear();
  this.indexByXiuyuanID.clear();
  this.indexByType.clear();
  this.indexByPriority.clear();
  this.indexByDue = [];
  
  // 预分配数组容量
  const cardCount = this.cards.size;
  this.indexByDue = new Array(cardCount);
  
  let i = 0;
  for (const card of this.cards.values()) {
    // 批量添加到索引
    this.addToIndex(this.indexByBlockID, card.blockId, card.id);
    this.addToIndex(this.indexByXiuyuanID, card.meta.xiuyuanID, card.id);
    this.addToIndex(this.indexByType, card.type, card.id);
    this.addToIndex(this.indexByPriority, card.priority, card.id);
    
    // 添加到 due 索引
    this.indexByDue[i++] = card;
  }
  
  // 一次性排序
  this.indexByDue.sort((a, b) => a.due - b.due);
  
  console.timeEnd('[Storage] Rebuild indexes');
}
```

### 2.3 增量更新索引

```typescript
private updateIndexesForCard(
  card: FSRSCard,
  action: 'add' | 'remove'
): void {
  if (action === 'add') {
    // 添加到索引
    this.addToIndex(this.indexByBlockID, card.blockId, card.id);
    this.addToIndex(this.indexByXiuyuanID, card.meta.xiuyuanID, card.id);
    this.addToIndex(this.indexByType, card.type, card.id);
    this.addToIndex(this.indexByPriority, card.priority, card.id);
    
    // 二分插入到 due 索引（保持排序）
    const index = this.binarySearch(this.indexByDue, card.due);
    this.indexByDue.splice(index, 0, card);
  } else {
    // 从索引移除
    this.removeFromIndex(this.indexByBlockID, card.blockId, card.id);
    this.removeFromIndex(this.indexByXiuyuanID, card.meta.xiuyuanID, card.id);
    this.removeFromIndex(this.indexByType, card.type, card.id);
    this.removeFromIndex(this.indexByPriority, card.priority, card.id);
    
    // 从 due 索引移除
    const index = this.indexByDue.findIndex(c => c.id === card.id);
    if (index !== -1) {
      this.indexByDue.splice(index, 1);
    }
  }
}

private binarySearch(arr: FSRSCard[], due: number): number {
  let left = 0;
  let right = arr.length;
  
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid].due < due) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  
  return left;
}
```

## 3. 查询优化

### 3.1 到期卡片查询

```typescript
getDueCards(limit: number = 100): FSRSCard[] {
  const now = Date.now();
  const result: FSRSCard[] = [];
  
  // indexByDue 已排序，直接遍历
  for (const card of this.indexByDue) {
    if (card.due > now) break;  // 提前终止
    if (card.skipped) continue;  // 跳过暂停的卡片
    
    result.push(card);
    if (result.length >= limit) break;  // 达到限制
  }
  
  return result;
}
```

**时间复杂度**：O(limit)，最坏 O(n)

### 3.2 按块 ID 查询

```typescript
getCardsByBlockId(blockId: string): FSRSCard[] {
  const cardIds = this.indexByBlockID.get(blockId) || [];
  return cardIds.map(id => this.cards.get(id)!).filter(Boolean);
}
```

**时间复杂度**：O(k)，k 为该块的卡片数量

### 3.3 按类型查询

```typescript
getCardsByType(type: CardType): FSRSCard[] {
  const cardIds = this.indexByType.get(type) || [];
  return cardIds.map(id => this.cards.get(id)!).filter(Boolean);
}
```

**时间复杂度**：O(k)，k 为该类型的卡片数量

### 3.4 复杂查询优化

```typescript
// 查询：到期的概念卡，优先级 > 50
getDueConceptCardsWithHighPriority(limit: number): FSRSCard[] {
  const now = Date.now();
  const result: FSRSCard[] = [];
  
  // 方案 1：遍历 due 索引（推荐）
  for (const card of this.indexByDue) {
    if (card.due > now) break;
    if (card.type !== 'concept') continue;
    if (card.priority > 50) continue;
    
    result.push(card);
    if (result.length >= limit) break;
  }
  
  return result;
}
```

## 4. 持久化优化

### 4.1 MessagePack 序列化

```typescript
async save(): Promise<Result<void>> {
  if (!this.dirty) return ok(undefined);
  
  try {
    console.time('[Storage] Serialize');
    
    // 1. 构建数据
    const data: UnifiedCardStore = {
      version: 1,
      xiuyuans: Object.fromEntries(this.xiuyuans),
      cards: Object.fromEntries(this.cards),
    };
    
    // 2. 序列化（MessagePack 比 JSON 快 2-3 倍）
    const buffer = encode(data);
    
    console.timeEnd('[Storage] Serialize');
    console.time('[Storage] Write file');
    
    // 3. 写入文件
    await this.plugin.saveData('unified-cards.msgpack', buffer);
    
    console.timeEnd('[Storage] Write file');
    
    this.dirty = false;
    return ok(undefined);
  } catch (error) {
    return err(error as Error);
  }
}
```

### 4.2 防抖保存

```typescript
private saveTimer: NodeJS.Timeout | null = null;
private readonly SAVE_DELAY = 1000;  // 1秒防抖

private scheduleSave(): void {
  if (this.saveTimer) {
    clearTimeout(this.saveTimer);
  }
  
  this.saveTimer = setTimeout(() => {
    this.save();
  }, this.SAVE_DELAY);
}
```

### 4.3 批量操作

```typescript
async batchCreateCards(
  xiuyuan: IXiuyuan,
  cards: FSRSCard[]
): Promise<Result<void>> {
  // 1. 保存 Xiuyuan
  this.xiuyuans.set(xiuyuan.id, xiuyuan);
  
  // 2. 批量保存 Card
  for (const card of cards) {
    this.cards.set(card.id, card);
  }
  
  // 3. 批量更新索引
  for (const card of cards) {
    this.updateIndexesForCard(card, 'add');
  }
  
  // 4. 一次性排序
  this.indexByDue.sort((a, b) => a.due - b.due);
  
  // 5. 标记为脏
  this.dirty = true;
  
  // 6. 防抖保存
  this.scheduleSave();
  
  return ok(undefined);
}
```

## 5. 内存优化

### 5.1 对象池

```typescript
class CardPool {
  private pool: FSRSCard[] = [];
  private readonly MAX_POOL_SIZE = 1000;
  
  acquire(): FSRSCard {
    return this.pool.pop() || this.createCard();
  }
  
  release(card: FSRSCard): void {
    if (this.pool.length < this.MAX_POOL_SIZE) {
      // 重置卡片
      this.resetCard(card);
      this.pool.push(card);
    }
  }
  
  private createCard(): FSRSCard {
    return {
      id: '',
      xiuyuanID: '',
      blockId: '',
      // ... 其他字段
    };
  }
  
  private resetCard(card: FSRSCard): void {
    card.id = '';
    card.xiuyuanID = '';
    // ... 重置其他字段
  }
}
```

### 5.2 弱引用缓存

```typescript
class WeakCardCache {
  private cache: WeakMap<object, FSRSCard> = new WeakMap();
  
  get(key: object): FSRSCard | undefined {
    return this.cache.get(key);
  }
  
  set(key: object, card: FSRSCard): void {
    this.cache.set(key, card);
  }
}
```

### 5.3 延迟加载

```typescript
class LazyXiuyuan {
  private _fields?: IXiuyuanField[];
  
  get fields(): IXiuyuanField[] {
    if (!this._fields) {
      this._fields = this.loadFields();
    }
    return this._fields;
  }
  
  private loadFields(): IXiuyuanField[] {
    // 从存储加载
    return [];
  }
}
```

## 6. 查询缓存

### 6.1 LRU 缓存

```typescript
class LRUCache<K, V> {
  private cache: Map<K, V> = new Map();
  private readonly maxSize: number;
  
  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移到最前面
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最旧的
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

### 6.2 查询缓存应用

```typescript
class UnifiedStorageManager {
  private queryCache: LRUCache<string, any> = new LRUCache(100);
  private readonly CACHE_TTL = 5000;  // 5秒
  
  getDueCardsWithCache(limit: number): FSRSCard[] {
    const cacheKey = `due:${limit}`;
    const cached = this.queryCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    
    const data = this.getDueCards(limit);
    this.queryCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
    
    return data;
  }
}
```

## 7. 并发优化

### 7.1 Web Worker

```typescript
// worker.ts
self.onmessage = (e) => {
  const { type, data } = e.data;
  
  switch (type) {
    case 'rebuild-indexes':
      const indexes = rebuildIndexes(data.cards);
      self.postMessage({ type: 'indexes-ready', indexes });
      break;
    
    case 'sort-cards':
      const sorted = sortCards(data.cards);
      self.postMessage({ type: 'cards-sorted', sorted });
      break;
  }
};

// main.ts
const worker = new Worker('worker.ts');

worker.postMessage({
  type: 'rebuild-indexes',
  data: { cards: Array.from(this.cards.values()) },
});

worker.onmessage = (e) => {
  if (e.data.type === 'indexes-ready') {
    this.applyIndexes(e.data.indexes);
  }
};
```

### 7.2 批处理

```typescript
class BatchProcessor {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  
  async add(task: () => Promise<void>): Promise<void> {
    this.queue.push(task);
    
    if (!this.processing) {
      this.process();
    }
  }
  
  private async process(): Promise<void> {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, 100);  // 每次处理 100 个
      await Promise.all(batch.map(task => task()));
    }
    
    this.processing = false;
  }
}
```

## 8. 性能监控

### 8.1 性能指标收集

```typescript
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();
  
  measure(name: string, fn: () => void): void {
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;
    
    const values = this.metrics.get(name) || [];
    values.push(elapsed);
    this.metrics.set(name, values);
  }
  
  getStats(name: string): {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) {
      return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = values.slice().sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    
    return {
      avg: sum / values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }
}
```

### 8.2 性能日志

```typescript
const monitor = new PerformanceMonitor();

// 监控查询性能
monitor.measure('getDueCards', () => {
  storage.getDueCards(100);
});

// 定期输出统计
setInterval(() => {
  const stats = monitor.getStats('getDueCards');
  console.log('getDueCards performance:', stats);
}, 60000);  // 每分钟
```

## 9. 性能基准

### 9.1 基准测试

```typescript
describe('Performance Benchmarks', () => {
  it('should meet performance targets', async () => {
    const storage = new UnifiedStorageManager(plugin);
    
    // 生成 10 万张卡片
    for (let i = 0; i < 100000; i++) {
      await storage.createCard(xiuyuan, card);
    }
    
    // 基准 1：查询到期卡片
    const start1 = Date.now();
    storage.getDueCards(100);
    const elapsed1 = Date.now() - start1;
    expect(elapsed1).toBeLessThan(100);
    
    // 基准 2：按类型查询
    const start2 = Date.now();
    storage.getCardsByType('concept');
    const elapsed2 = Date.now() - start2;
    expect(elapsed2).toBeLessThan(50);
    
    // 基准 3：保存数据
    const start3 = Date.now();
    await storage.save();
    const elapsed3 = Date.now() - start3;
    expect(elapsed3).toBeLessThan(1000);
  });
});
```

## 10. 优化清单

- [ ] 实现内存索引
- [ ] 优化索引构建
- [ ] 实现增量索引更新
- [ ] 优化查询算法
- [ ] 使用 MessagePack 序列化
- [ ] 实现防抖保存
- [ ] 实现批量操作
- [ ] 实现查询缓存
- [ ] 添加性能监控
- [ ] 运行性能基准测试
- [ ] 优化内存使用
- [ ] 文档性能指标
