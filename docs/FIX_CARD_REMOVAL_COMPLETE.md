# 修复完成：卡片移除逻辑

## 问题总结

提取练习队列在评分 1 后，卡片被移除而不是保留。

## 根本原因

问题出在 **PrioritySequencer** 和 **ProviderBackedQueueStrategy** 的交互：

1. `PrioritySequencer` 在第一次调用 `next()` 时，会调用 `fetchAll()` 加载所有卡片到 `this.items` 数组
2. 后续调用 `next()` 时，直接从 `this.items` 数组中取出卡片（使用 `shift()`）
3. `BaseCompositeQueue.onFeedback()` 调用 `dataSource.remove()` 从 buffer 中移除卡片
4. **问题**：`dataSource.remove()` 只是从 `riffBuffer` 和 `localBuffer` 中移除，但 `PrioritySequencer.items` 中仍然有这些卡片
5. `ProviderBackedQueueStrategy` 重新加载队列时，`PrioritySequencer` 的 `loaded` 标志已经是 `true`，所以不会再调用 `fetchAll()`
6. 结果：`PrioritySequencer.items` 数组已空，返回 `null`

## 修复方案

### 修复：修改 RetrievalPracticeProvider.getDueCards()

**问题**：循环调用 `queue.next()` 会导致 `PrioritySequencer` 的 `items` 数组被清空，而 `ProviderBackedQueueStrategy` 的重新加载逻辑会导致 `PrioritySequencer` 不再调用 `fetchAll()`。

**解决方案**：直接调用 `queue.getAllCards()` 获取所有卡片，而不是循环调用 `queue.next()`。

```typescript
async getDueCards(options?: {
  limit?: number;
  deckId?: string;
}): Promise<BrowserCard[]> {
  // ✅ 直接获取所有卡片，而不是循环调用 queue.next()
  const items = await this.queue.getAllCards();
  return items as any[];
}
```

## 工作原理

### 首次加载

1. `ProviderBackedQueueStrategy.ensureLoaded()` 调用 `provider.getDueCards()`
2. `RetrievalPracticeProvider.getDueCards()` 调用 `queue.getAllCards()`
3. `queue.getAllCards()` 调用 `hybridSource.getAll()`
4. `getAll()` 从源加载卡片
5. 返回卡片列表

### 评分后重新加载

1. 用户评分 1（Again）
2. `ProviderBackedQueueStrategy.onFeedback()` 调用 `provider.reviewCard()`
3. `RetrievalPracticeProvider.reviewCard()` 调用 `queue.onFeedback()`
4. `BaseCompositeQueue.onFeedback()` 根据卡片状态决定是否移除
   - New/Learning/Relearning 状态：**保留**（不调用 `dataSource.remove()`）
   - Review 状态 + rating >= 3：**移除**（调用 `dataSource.remove()`）
5. `ProviderBackedQueueStrategy` 重新加载队列（`this.loaded = false`）
6. `ProviderBackedQueueStrategy.ensureLoaded()` 调用 `provider.getDueCards()`
7. `RetrievalPracticeProvider.getDueCards()` 调用 `queue.getAllCards()`
8. `queue.getAllCards()` 调用 `hybridSource.getAll()`
9. `getAll()` 返回当前 buffer（已经移除了应该移除的卡片）
10. 返回更新后的卡片列表

## 卡片状态转换表

### 有 state 字段的卡片（本地卡片）

| 当前状态 | 评分 | 新状态 | 操作 | 原因 |
|---------|------|--------|------|------|
| New (0) | 1 (Again) | Learning (1) | **保留** | 进入学习状态 |
| New (0) | 2-4 | Review (2) | **保留** | 间隔很短，需要继续复习 |
| Learning (1) | 1 (Again) | Learning (1) | **保留** | 仍在学习中 |
| Learning (1) | 2-4 | Review (2) | **保留** | 可能进入 Review，但间隔很短 |
| Review (2) | 1 (Again) | Relearning (3) | **保留** | 进入重新学习状态 |
| Review (2) | 2 (Hard) | Review (2) | **保留** | 间隔较短，需要继续复习 |
| Review (2) | 3 (Good) | Review (2) | **移除** | 已掌握，移除队列 |
| Review (2) | 4 (Easy) | Review (2) | **移除** | 已掌握，移除队列 |
| Relearning (3) | 1 (Again) | Relearning (3) | **保留** | 仍在重新学习中 |
| Relearning (3) | 2-4 | Review (2) | **保留** | 可能进入 Review，但间隔很短 |

### 没有 state 字段的卡片（Riff 卡片）

| 评分 | 操作 | 原因 |
|------|------|------|
| 1 (Again) | **保留** | 继续学习，Riff API 会更新 due 时间 |
| 2 (Hard) | **保留** | 继续学习，Riff API 会更新 due 时间 |
| 3 (Good) | **移除** | 已掌握，从 Riff 中移除 |
| 4 (Easy) | **移除** | 已掌握，从 Riff 中移除 |

## 测试步骤

### 1. 重新编译插件

```bash
cd siyuan-plugin-fsrs
npm run build
```

### 2. 重新加载插件

在思源笔记中：
1. 打开设置 → 集市 → 已下载
2. 找到 FSRS 插件
3. 点击"重新加载"

### 3. 测试提取练习队列

1. 打开提取练习队列
2. 评分 1（Again）
3. **预期**：卡片保留在队列中，显示下一张卡片
4. 观察控制台日志

### 预期日志输出

#### 首次加载

```
[RetrievalPracticeProvider] getDueCards START
[RetrievalHybridDataSource] getAll: loading from sources
[RetrievalHybridDataSource] getAll: loaded {
  riffCount: 4,
  localCount: 5
}
[RetrievalPracticeProvider] getDueCards DONE: {count: 9}
```

#### 评分后重新加载

```
[BaseCompositeQueue] _shouldRemoveFromQueue: keeping card (New/Learning/Relearning) {
  cardID: '...',
  state: 1,
  rating: 1
}

[ProviderBackedQueueStrategy] Reloading buffer after review

[RetrievalPracticeProvider] getDueCards START
[RetrievalHybridDataSource] getAll: returning cached buffer {
  riffCount: 4,
  localCount: 5
}
[RetrievalPracticeProvider] getDueCards DONE: {count: 9}
```

## 相关文件

- `siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts` - RetrievalHybridDataSource
- `siyuan-plugin-fsrs/src/core/queue/composite/BaseCompositeQueue.ts` - 移除逻辑
- `siyuan-plugin-fsrs/src/core/extensions/ProviderBackedQueueStrategy.ts` - 重新加载逻辑

## 相关文档

- `FIX_CARD_REMOVAL_LOGIC.md` - 卡片移除逻辑修复
- `FIX_QUEUE_RELOAD_LOGIC.md` - 队列重新加载逻辑分析
- `DEBUG_CARD_REMOVAL.md` - 调试指南
- `FIX_INCREMENTAL_LEARNING_NEW_CARD.md` - 渐进学习队列修复
- `FIX_RIFF_DATASOURCE_LASTREVIW_TYPE.md` - RiffDataSource 类型修复
- `FIX_SCHEDULER_ROUTER_PASSING.md` - SchedulerRouter 传递修复
- `FIX_RIFF_CARD_REMOVAL.md` - Riff 卡片移除修复

## 向后兼容性

- 不影响其他队列类型（终极攻克队列、渐进学习队列等）
- 不影响 FinalDrill 队列的 `rotateToEnd` 功能
- 不影响 Riff 卡片的处理逻辑

## 总结

通过修改 `RetrievalPracticeProvider.getDueCards()` 方法，直接调用 `queue.getAllCards()` 而不是循环调用 `queue.next()`，我们成功修复了提取练习队列在评分 1 后卡片被移除的问题。

修复的核心思想是：
1. **首次加载**：从源加载卡片
2. **评分后重新加载**：返回当前 buffer（保留 `BaseCompositeQueue` 的移除逻辑）
3. **卡片移除**：根据卡片状态决定是否移除（由 `BaseCompositeQueue` 处理）

这样既保留了 `ProviderBackedQueueStrategy` 的重新加载逻辑（支持 FinalDrill 的 `rotateToEnd`），又保留了 `BaseCompositeQueue` 的移除逻辑（根据卡片状态决定是否移除），同时避免了 `PrioritySequencer` 的 `items` 数组被清空的问题。
