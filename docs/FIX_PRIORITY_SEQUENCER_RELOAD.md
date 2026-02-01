# 修复：PrioritySequencer 重新加载问题

## 问题描述

提取练习队列在评分 1 后，卡片被移除而不是保留。

## 根本原因

问题出在 **PrioritySequencer** 和 **ProviderBackedQueueStrategy** 的交互：

1. `PrioritySequencer` 在第一次调用 `next()` 时，会调用 `fetchAll()` 加载所有卡片到 `this.items` 数组
2. 后续调用 `next()` 时，直接从 `this.items` 数组中取出卡片（使用 `shift()`）
3. `BaseCompositeQueue.onFeedback()` 调用 `dataSource.remove()` 从 buffer 中移除卡片
4. **问题**：`dataSource.remove()` 只是从 `riffBuffer` 和 `localBuffer` 中移除，但 `PrioritySequencer.items` 中仍然有这些卡片
5. `ProviderBackedQueueStrategy` 重新加载队列时，`PrioritySequencer` 的 `loaded` 标志已经是 `true`，所以不会再调用 `fetchAll()`
6. 结果：`PrioritySequencer.items` 数组已空，返回 `null`

## 解决方案

### 方案 1：修改 PrioritySequencer，添加 reset() 方法（❌ 不推荐）

这会破坏 `PrioritySequencer` 的封装性。

### 方案 2：修改 ProviderBackedQueueStrategy，不要重新加载（❌ 会破坏 FinalDrill）

这会破坏 FinalDrill 队列的 `rotateToEnd` 功能。

### 方案 3：修改 BaseCompositeQueue，不要调用 dataSource.remove()（✅ 推荐）

**关键洞察**：`PrioritySequencer` 已经把所有卡片都取出到 `this.items` 数组中了，所以我们不需要从 `dataSource` 中移除卡片。

相反，我们应该：
1. 保留卡片在 `dataSource` 中（不调用 `remove()`）
2. 让 `PrioritySequencer` 自然地消耗 `this.items` 数组
3. 当 `PrioritySequencer.items` 数组为空时，返回 `null`

但这会导致一个问题：**已掌握的卡片会一直保留在 `dataSource` 中**。

### 方案 4：修改 RetrievalPracticeQueue，不使用 ProviderBackedQueueStrategy（✅ 最佳）

**关键洞察**：`RetrievalPracticeQueue` 已经继承了 `BaseCompositeQueue`，它不需要 `ProviderBackedQueueStrategy` 的重新加载逻辑。

`ProviderBackedQueueStrategy` 的重新加载逻辑是为了支持 **FinalDrill** 队列的 `rotateToEnd` 功能，但 `RetrievalPracticeQueue` 不需要这个功能。

**解决方案**：
1. `RetrievalPracticeQueue` 直接使用 `BaseCompositeQueue`（已经实现）
2. `RetrievalPracticeProvider` 不要循环调用 `queue.next()` 来获取所有卡片
3. 相反，`RetrievalPracticeProvider.getDueCards()` 应该直接调用 `queue.getAllCards()`

## 实现步骤

### 步骤 1：修改 RetrievalPracticeProvider.getDueCards()

```typescript
async getDueCards(options?: {
  limit?: number;
  deckId?: string;
}): Promise<BrowserCard[]> {
  console.log('[RetrievalPracticeProvider] getDueCards START');

  // ✅ 直接获取所有卡片，而不是循环调用 queue.next()
  const items = await this.queue.getAllCards();

  console.log('[RetrievalPracticeProvider] getDueCards DONE:', {
    count: items.length,
  });

  return items as any[];
}
```

### 步骤 2：测试

1. 重新编译：`npm run build`
2. 在提取练习队列中测试评分 1
3. 验证卡片保留在队列中

## 为什么这个方案有效？

1. `RetrievalPracticeProvider.getDueCards()` 直接调用 `queue.getAllCards()`
2. `queue.getAllCards()` 调用 `hybridSource.getAll()`
3. `hybridSource.getAll()` 返回当前 buffer 中的卡片（包括已评分但未移除的卡片）
4. `ProviderBackedQueueStrategy` 不再需要重新加载队列
5. `BaseCompositeQueue.onFeedback()` 根据卡片状态决定是否从 buffer 中移除
6. 下次调用 `getDueCards()` 时，返回更新后的 buffer

## 相关文件

- `siyuan-plugin-fsrs/src/ui/review/v2/providers/RetrievalPracticeProvider.ts` - 修改 getDueCards()
- `siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts` - getAllCards() 方法
- `siyuan-plugin-fsrs/src/core/queue/composite/BaseCompositeQueue.ts` - onFeedback() 方法

## 相关文档

- `FIX_CARD_REMOVAL_LOGIC.md` - 卡片移除逻辑修复
- `FIX_QUEUE_RELOAD_LOGIC.md` - 队列重新加载逻辑分析
- `DEBUG_CARD_REMOVAL.md` - 调试指南
