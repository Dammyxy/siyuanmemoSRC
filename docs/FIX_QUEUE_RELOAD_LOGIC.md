# 修复：队列重新加载逻辑导致卡片消失

## 问题描述

提取练习队列在评分 1 后，卡片被移除而不是保留。

## 根本原因

问题出在 **ProviderBackedQueueStrategy** 的重新加载逻辑：

```typescript
async onFeedback(currentItem, feedback) {
  if (feedback.action === 'rate') {
    await this.provider.reviewCard(cardId, rating, reviewed);
    
    // ❌ 问题：重新加载队列
    this.loaded = false;
    await this.ensureLoaded();
  }
}
```

### 问题链路

1. 用户评分 1（Again）
2. `ProviderBackedQueueStrategy.onFeedback()` 调用 `provider.reviewCard()`
3. `RetrievalPracticeProvider.reviewCard()` 调用 `queue.onFeedback()`
4. `BaseCompositeQueue.onFeedback()` 根据卡片状态决定是否移除（**正确**）
5. **问题**：`ProviderBackedQueueStrategy` 重新加载队列（`this.loaded = false`）
6. 重新加载时，`RetrievalPracticeProvider.getDueCards()` 调用 `queue.next()`
7. `queue.next()` → `sequencer.next()` → `fetchAll()` → `hybridSource.getAll()`
8. **问题**：`getAll()` 返回的本地卡片中，评分后的卡片已经被 `BaseCompositeQueue` 从 buffer 中移除
9. 结果：`getDueCards()` 返回空数组，队列显示"完成"

## 思源的做法

从 `siyuan/app/src/card/openCard.ts` 可以看到，思源的做法是：

1. **不重新加载队列**，而是直接从当前的 `cardsData.cards` 数组中操作
2. 评分后，`index++` 移动到下一张卡片
3. 只有当所有卡片都复习完后（`index > cardsData.cards.length - 1`），才会调用 API 获取新一轮的卡片

```typescript
// 思源的做法
if (["1", "2", "3", "4", "-3"].includes(type)) {
  fetchPost("/api/riff/reviewRiffCard", {
    deckID: currentCard.deckID,
    cardID: currentCard.cardID,
    rating: parseInt(type),
    reviewedCards: options.cardsData.cards  // 传递当前所有卡片
  }, () => {
    index++;  // 移动到下一张
    if (index > options.cardsData.cards.length - 1) {
      // 所有卡片都复习完了，获取新一轮
      fetchPost("/api/riff/getRiffDueCards", {
        reviewedCards: options.cardsData.cards  // 传递已复习的卡片
      }, (result) => {
        // 更新队列
        options.cardsData = result.data;
      });
    } else {
      // 继续下一张
      nextCard({ index, cardsData: options.cardsData });
    }
  });
}
```

## 为什么需要重新加载？

`ProviderBackedQueueStrategy` 的重新加载逻辑是为了支持 **FinalDrill** 队列的 `rotateToEnd` 功能：

- FinalDrill 队列在评分后会将卡片移动到队列末尾（`rotateToEnd`）
- 这需要重新加载队列以同步底层队列的变化

但是，这个逻辑对于 **RetrievalPracticeQueue** 是不适用的：

- RetrievalPracticeQueue 不需要 `rotateToEnd`
- RetrievalPracticeQueue 的卡片应该根据状态决定是否保留（由 `BaseCompositeQueue` 处理）

## 解决方案

### 方案 1：移除 ProviderBackedQueueStrategy 的重新加载逻辑（❌ 不可行）

这会破坏 FinalDrill 队列的功能。

### 方案 2：让 BaseCompositeQueue 不移除卡片（❌ 不可行）

这会导致所有卡片都保留在队列中，包括已掌握的卡片。

### 方案 3：修复 RetrievalHybridDataSource.getAll() 的逻辑（✅ 推荐）

**问题**：`getAll()` 返回所有本地卡片，但评分后的卡片已经被 `BaseCompositeQueue` 从 buffer 中移除。

**解决方案**：`getAll()` 应该返回 **当前 buffer 中的卡片**，而不是重新从存储加载。

```typescript
// ❌ 当前实现
async getAll(): Promise<QueueItem[]> {
  this.riffBuffer = await this.getFromSource('riff');
  const allLocalItems = this.localBuffer;  // 从存储加载
  return [...this.riffBuffer, ...allLocalItems];
}

// ✅ 修复后
async getAll(): Promise<QueueItem[]> {
  // 如果 buffer 已经加载，直接返回
  if (this.riffBuffer.length > 0 || this.localBuffer.length > 0) {
    return [...this.riffBuffer, ...this.localBuffer];
  }
  
  // 否则，从源加载
  this.riffBuffer = await this.getFromSource('riff');
  this.localBuffer = await this._loadLocalQueue();
  return [...this.riffBuffer, ...this.localBuffer];
}
```

### 方案 4：修复 BaseCompositeQueue.onFeedback() 的移除逻辑（✅ 推荐）

**问题**：`BaseCompositeQueue` 调用 `dataSource.remove()` 移除卡片，但这会从 buffer 中删除卡片。

**解决方案**：不要从 buffer 中删除卡片，而是标记为"已复习"，让 `getAll()` 过滤掉已复习的卡片。

但这需要修改 `IDataSource` 接口，增加"标记为已复习"的方法。

### 方案 5：修复 ProviderBackedQueueStrategy 的重新加载逻辑（✅ 最简单）

**问题**：重新加载队列会导致 `getDueCards()` 返回空数组。

**解决方案**：不要重新加载整个队列，而是只重新加载 **新增的卡片**。

```typescript
// ✅ 修复后
async onFeedback(currentItem, feedback) {
  if (feedback.action === 'rate') {
    await this.provider.reviewCard(cardId, rating, reviewed);
    
    // ✅ 不要重新加载整个队列
    // this.loaded = false;
    // await this.ensureLoaded();
    
    this.current = null;
  }
}
```

## 最终方案

**方案 5** 是最简单的解决方案，但会破坏 FinalDrill 队列的功能。

**方案 3** 是最合理的解决方案：

1. `RetrievalHybridDataSource.getAll()` 返回当前 buffer 中的卡片
2. `BaseCompositeQueue.onFeedback()` 根据卡片状态决定是否从 buffer 中移除
3. `ProviderBackedQueueStrategy` 重新加载队列时，`getAll()` 返回更新后的 buffer

## 实现步骤

### 步骤 1：修复 RetrievalHybridDataSource.getAll()

```typescript
async getAll(): Promise<QueueItem[]> {
  // 🆕 如果 buffer 已经加载，直接返回（不重新加载）
  // 这样可以保留 BaseCompositeQueue 的移除逻辑
  if (this._isBufferLoaded) {
    console.log('[RetrievalHybridDataSource] getAll: returning cached buffer', {
      riffCount: this.riffBuffer.length,
      localCount: this.localBuffer.length,
    });
    return [...this.riffBuffer, ...this.localBuffer];
  }

  // 首次加载：从源加载
  console.log('[RetrievalHybridDataSource] getAll: loading from sources');
  this.riffBuffer = await this.getFromSource('riff');
  // 本地 buffer 已经在构造函数中加载
  this._isBufferLoaded = true;

  return [...this.riffBuffer, ...this.localBuffer];
}
```

### 步骤 2：添加 _isBufferLoaded 标志

```typescript
class RetrievalHybridDataSource extends HybridDataSource {
  private _isBufferLoaded = false;  // 🆕 添加标志
  
  constructor(...) {
    super(...);
    this._loadLocalQueue();  // 加载本地队列
  }
  
  async remove(items: QueueItem[]): Promise<number> {
    // ... 移除逻辑
    
    // 🆕 移除后不需要重置标志，因为 buffer 仍然有效
    return removedCount;
  }
}
```

### 步骤 3：测试

1. 重新编译：`npm run build`
2. 在提取练习队列中测试评分 1
3. 验证卡片保留在队列中
4. 验证 FinalDrill 队列的 `rotateToEnd` 功能仍然正常

## 相关文件

- `siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts` - RetrievalHybridDataSource
- `siyuan-plugin-fsrs/src/core/queue/composite/BaseCompositeQueue.ts` - 移除逻辑
- `siyuan-plugin-fsrs/src/core/extensions/ProviderBackedQueueStrategy.ts` - 重新加载逻辑
- `siyuan/app/src/card/openCard.ts` - 思源的参考实现

## 相关文档

- `FIX_CARD_REMOVAL_LOGIC.md` - 卡片移除逻辑修复
- `DEBUG_CARD_REMOVAL.md` - 调试指南
