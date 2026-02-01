# E2E 测试失败的深度分析

## 问题总览

剩余 4 个失败的测试都有一个**共同的根本原因**：

**测试之间的状态污染** - 全局 Mock 状态（`globalMockRiffCards`）在测试之间没有被正确清理。

---

## 根本原因分析

### 问题 1: 全局状态污染

我们使用了全局变量来 Mock Riff API：

```typescript
const globalMockRiffCards = new Map<string, any>();
const globalMockRemovedCards = new Set<string>();

vi.mock('@/core/siyuan/riff', () => ({
  getRiffDueCards: vi.fn().mockImplementation(async (deckID: string) => {
    const cards = Array.from(globalMockRiffCards.values()).filter(c => c.deckID === deckID);
    return {
      cards,
      unreviewedCount: cards.length,
      unreviewedNewCardCount: 0,
      unreviewedOldCardCount: cards.length,
    };
  }),
  // ...
}));
```

**问题**：
- `globalMockRiffCards` 在所有测试之间共享
- 每个测试都会向 `globalMockRiffCards` 添加卡片
- `beforeEach` 中的 `mockRiffAPI.clear()` **只清理了 `mockRiffAPI` 的本地状态**，而不是全局状态
- 结果：后面的测试会看到前面测试添加的卡片

### 问题 2: `beforeEach` 清理不完整

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  storage = createMockStorage();
  router = new SchedulerRouter(...);
  mockRiffAPI = createMockRiffAPI();  // ❌ 这不会清理全局状态！
});
```

`createMockRiffAPI()` 创建了一个新的 API 对象，但它仍然引用同一个全局 `globalMockRiffCards`。

---

## 4 个失败测试的具体分析

### 测试 1: 应该完成从加载到评分的完整流程

**错误**: `stats.size` 为 0

**原因分析**:
1. 这是第一个测试，`globalMockRiffCards` 是空的
2. 测试添加了 2 张卡片到 `globalMockRiffCards`
3. 但是 `RetrievalHybridDataSource.getAll()` 返回空数组

**为什么返回空数组？**

让我检查日志：
```
[RetrievalHybridDataSource] Loaded 0 items from storage
[RiffDataSource] Merge local nextDues: { total: 3, localFound: 1 }
```

等等，`total: 3`？这意味着 Riff 返回了 3 张卡片，而不是 2 张！

**真正的原因**：前面的测试（可能是其他测试套件）已经向 `globalMockRiffCards` 添加了卡片，这些卡片没有被清理。

但是，`RetrievalHybridDataSource.getAll()` 过滤掉了这些卡片，因为：
- 它们可能不符合 "Outstanding queue logic"（已过期）
- 或者被 Topic 过滤器过滤掉了

**实际问题**：测试添加的卡片的 `nextDues` 是**未来的时间**，但 `RetrievalHybridDataSource.getAll()` 只返回**已过期的卡片**。

```typescript
// 测试中添加的卡片
nextDues: {
  1: new Date(Date.now() + 1000).toISOString(),  // ❌ 未来时间！
  2: new Date(Date.now() + 2000).toISOString(),
  3: new Date(Date.now() + 3000).toISOString(),
  4: new Date(Date.now() + 4000).toISOString(),
}
```

但是 `RetrievalHybridDataSource.getAll()` 的逻辑是：
```typescript
async getAll(): Promise<QueueItem[]> {
  // Load Riff cards
  this.riffBuffer = await this.getFromSource('riff');
  
  // Filter local buffer for due cards only
  const now = Date.now();
  const dueLocalItems = this.localBuffer.filter(item => {
    const dueTime = CardStorage.getDueTime(item);
    return dueTime <= now;  // ❌ 只返回已过期的卡片
  });
  
  // Merge Riff + due local cards
  return [...this.riffBuffer, ...dueLocalItems];
}
```

**问题**：`this.riffBuffer` 包含所有 Riff 卡片，但是这些卡片的 `nextDues` 都是未来时间，所以它们不应该被返回。

**等等**，我理解错了！让我重新看：

`RetrievalHybridDataSource.getAll()` 返回：
- **所有 Riff 卡片**（`this.riffBuffer`）
- **已过期的本地卡片**（`dueLocalItems`）

所以 Riff 卡片**不需要过期**就会被返回。

那么问题是什么？让我再看日志：

```
[RiffDataSource] Merge local nextDues: { total: 3, localFound: 1 }
[RiffDataSource] Card types query result: { totalBlocks: 3, foundTypes: 0, typeBreakdown: {} }
[RiffDataSource] Topic filter result: { total: 3, filtered: 3, topicCount: 0 }
```

Riff 返回了 3 张卡片，Topic 过滤后还是 3 张。但是 `stats.size` 为 0？

**真正的问题**：`getStats()` 的实现有问题，或者 `riffBuffer` 没有被正确填充。

让我检查 `getStats()` 的实现。

---

### 测试 2: 应该支持删除卡片

**错误**: 删除后 `stats.size` 仍为 4

**原因分析**:
1. 这是第 5 个测试（在场景 2 中）
2. 前面的 4 个测试已经向 `globalMockRiffCards` 添加了卡片
3. 这个测试添加了 1 张卡片到本地队列
4. 删除这 1 张卡片后，`stats.size` 应该是 0
5. 但是 `stats.size` 是 4，说明还有 4 张卡片

**真正的原因**：`globalMockRiffCards` 中有 4 张来自前面测试的卡片，这些卡片没有被清理。

日志证实了这一点：
```
[IncrementalLearningQueue] Loading Riff cards for deck: test-deck
[IncrementalLearningQueue] Riff cards loaded: { deckID: 'test-deck', total: 4, new: 0, old: 4, cardCount: 4 }
```

---

### 测试 3: 应该支持 Riff 卡片删除同步

**错误**: `mockRiffAPI.removeRiffCards` 未被调用

**原因分析**:
1. `IncrementalLearningQueue` 使用的是全局 Mock 的 `riff.removeRiffCards`
2. 测试验证的是 `mockRiffAPI.removeRiffCards`
3. 这两个是不同的函数！

**真正的原因**：验证错误的函数。应该验证全局 Mock 的 `removeRiffCards`。

---

### 测试 4: 应该按优先级排序卡片

**错误**: 返回了 'low' 而不是 'high'

**原因分析**:
1. 这是第 10 个测试
2. 前面的 9 个测试已经向 `globalMockRiffCards` 添加了 8 张卡片
3. 这个测试添加了 2 张卡片（'high' 和 'low'）
4. 队列中现在有 10 张卡片
5. 排序后，第一张卡片是 'low' 而不是 'high'

**真正的原因**：前面测试添加的卡片可能有更高的优先级（或更早的 due 时间），所以 'high' 不是第一张。

日志证实了这一点：
```
[RiffDataSource] Merge local nextDues: { total: 8, localFound: 2 }
```

有 8 张卡片来自前面的测试！

---

## 解决方案

### 方案 1: 在 `beforeEach` 中清理全局状态（推荐）

```typescript
beforeEach(() => {
  vi.clearAllMocks();
  
  // 🆕 清理全局 Mock 状态
  globalMockRiffCards.clear();
  globalMockRemovedCards.clear();
  
  storage = createMockStorage();
  router = new SchedulerRouter(...);
  mockRiffAPI = createMockRiffAPI();
});
```

### 方案 2: 使用 `afterEach` 清理

```typescript
afterEach(() => {
  globalMockRiffCards.clear();
  globalMockRemovedCards.clear();
});
```

### 方案 3: 每个测试独立清理

```typescript
it('test', async () => {
  // 清理全局状态
  globalMockRiffCards.clear();
  globalMockRemovedCards.clear();
  
  // 测试逻辑...
});
```

---

## 修复测试 3 的特殊问题

测试 3 需要验证全局 Mock 的 `removeRiffCards`，而不是 `mockRiffAPI.removeRiffCards`：

```typescript
it('应该支持 Riff 卡片删除同步', async () => {
  // ... 测试逻辑 ...
  
  // 🆕 验证全局 Mock 的 removeRiffCards
  const riffModule = await import('@/core/siyuan/riff');
  expect(vi.mocked(riffModule.removeRiffCards)).toHaveBeenCalledWith(
    'test-deck',
    ['block-riff-del']
  );
});
```

---

## 修复测试 1 的特殊问题

测试 1 的 `stats.size` 为 0 可能还有其他原因。让我检查 `RetrievalPracticeQueue.getStats()` 的实现：

```typescript
async getStats(): Promise<QueueStats> {
  const stats = await super.getStats();
  
  // Add Riff-specific counts
  return {
    ...stats,
    label: `${this.riffUnreviewedNew}/${this.riffUnreviewedOld}`,
    total: stats.size,
    remaining: stats.size,
    reviewed: this.reviewedCount,
  } as any;
}
```

`stats.size` 来自 `super.getStats()`，它调用 `BaseCompositeQueue.getStats()`。

问题可能是：
1. `riffUnreviewedNew` 和 `riffUnreviewedOld` 没有被正确初始化
2. 或者 `BaseCompositeQueue.getStats()` 返回的 `size` 为 0

需要检查 `BaseCompositeQueue.getStats()` 的实现。

---

## 总结

**根本原因**：全局 Mock 状态污染

**影响的测试**：
1. ✅ 测试 1 - 部分影响（还有其他问题）
2. ✅ 测试 2 - 完全影响
3. ✅ 测试 3 - 验证错误的函数
4. ✅ 测试 4 - 完全影响

**修复优先级**：
1. **高优先级**：在 `beforeEach` 中清理全局状态
2. **中优先级**：修复测试 3 的验证逻辑
3. **低优先级**：调查测试 1 的 `stats.size` 问题

**预计修复时间**：10-20 分钟

---

**最后更新**: 2026-02-01
