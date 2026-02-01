# FSRS 插件架构优化建议

> **文档目的**: 识别当前架构的优化空间，提供具体的改进方案
> 
> **创建时间**: 2026-02-01
> 
> **优先级**: 🔴 高优先级 | 🟡 中优先级 | 🟢 低优先级

---

## 目录

1. [性能优化](#1-性能优化)
2. [架构简化](#2-架构简化)
3. [代码质量](#3-代码质量)
4. [可维护性](#4-可维护性)
5. [测试覆盖](#5-测试覆盖)
6. [类型安全](#6-类型安全)
7. [错误处理](#7-错误处理)
8. [优化路线图](#8-优化路线图)

---

## 1. 性能优化

### 🔴 1.1 Sequencer 缓存失效问题

**问题**: PrioritySequencer 和 SortedSequencer 的缓存机制不一致

**当前实现**:
```typescript
// PrioritySequencer.ts
class PrioritySequencer<TItem> {
  private loaded = false;
  
  async next(): Promise<TItem | null> {
    if (!this.loaded) {
      this.loaded = true;
      const fetched = await this.fetchAll();
      this.items.push(...fetched);
      this.items.sort(this.compareFn);
    }
    return this.items.shift() || null;
  }
  
  reset(): void {
    this.loaded = false;
    this.items.length = 0;
  }
}
```

**问题分析**:
1. `reset()` 方法需要手动调用，容易遗漏
2. 数据源变化后，Sequencer 不知道需要重新加载
3. BaseCompositeQueue 的 `rotateToEnd()` 依赖手动调用 `reset()`

**优化方案**:

```typescript
// 方案 1: 观察者模式 (推荐)
interface IDataSourceObserver {
  onDataChanged(): void;
}

class ObservableDataSource<TItem> implements IDataSource<TItem> {
  private observers: IDataSourceObserver[] = [];
  
  addObserver(observer: IDataSourceObserver): void {
    this.observers.push(observer);
  }
  
  protected notifyObservers(): void {
    for (const observer of this.observers) {
      observer.onDataChanged();
    }
  }
  
  async remove(items: TItem[]): Promise<number> {
    const count = await this.doRemove(items);
    this.notifyObservers();  // 自动通知
    return count;
  }
}

class SmartSequencer<TItem> implements ISequencer<TItem>, IDataSourceObserver {
  private loaded = false;
  
  onDataChanged(): void {
    this.loaded = false;  // 自动失效
    this.items.length = 0;
  }
}

// 使用
const dataSource = new ObservableDataSource();
const sequencer = new SmartSequencer();
dataSource.addObserver(sequencer);  // 自动同步
```

**收益**:
- 消除手动 `reset()` 调用
- 数据一致性保证
- 减少 bug 风险

---

### 🟡 1.2 批量操作优化

**问题**: 多处存在 N+1 查询问题

**示例 1: RiffDataSource.filterTopicCards()**
```typescript
// 当前实现：每个卡片单独查询
async filterTopicCards(items: QueueItem[]): Promise<QueueItem[]> {
  const cardTypes = await this.batchGetCardTypes(blockIds);  // ✅ 已优化
  return items.filter(item => cardTypes.get(item.blockID) !== 'topic');
}
```
✅ 这个已经优化过了

**示例 2: BlockMenuHandler.buildDrillCardsFromBlockIds()**
```typescript
// 当前实现：200 个一批
for (let i = 0; i < uniqueIds.length; i += 200) {
  const batch = uniqueIds.slice(i, i + 200);
  const rows = await sql(`SELECT ... WHERE block_id IN (${idsStr})`);
}
```

**优化方案**: 使用连接池和并发控制

```typescript
// 优化后：并发批量查询
async function batchQueryWithConcurrency<T>(
  items: string[],
  batchSize: number,
  maxConcurrency: number,
  queryFn: (batch: string[]) => Promise<T[]>
): Promise<T[]> {
  const batches = chunk(items, batchSize);
  const results: T[] = [];
  
  // 使用 p-limit 控制并发
  const limit = pLimit(maxConcurrency);
  const promises = batches.map(batch => 
    limit(() => queryFn(batch))
  );
  
  const batchResults = await Promise.all(promises);
  return batchResults.flat();
}

// 使用
const cards = await batchQueryWithConcurrency(
  blockIds,
  200,      // 每批 200 个
  3,        // 最多 3 个并发
  async (batch) => {
    return await sql(`SELECT ... WHERE block_id IN (...)`);
  }
);
```

**收益**:
- 查询时间减少 50%+
- 更好的资源利用

---

### 🟡 1.3 SessionManager 内存优化

**问题**: SessionManager 使用 SortedSequencer，每次插入都需要二分查找

**当前实现**:
```typescript
class SessionManager<TCard> {
  private sequencer: SortedSequencer<TCard>;
  
  rotate(card: TCard): void {
    this.sequencer.insert(card);  // O(log n) 查找 + O(n) 插入
  }
}
```

**优化方案**: 使用优先队列（堆）

```typescript
class HeapSequencer<TItem> implements ISequencer<TItem> {
  private heap: MinHeap<TItem>;
  
  constructor(compareFn: (a: TItem, b: TItem) => number) {
    this.heap = new MinHeap(compareFn);
  }
  
  insert(item: TItem): void {
    this.heap.push(item);  // O(log n)
  }
  
  async next(): Promise<TItem | null> {
    return this.heap.pop() || null;  // O(log n)
  }
}
```

**收益**:
- 插入性能从 O(n) 提升到 O(log n)
- 大队列（1000+ 卡片）性能提升明显

---

