# 修复 Riff 卡片同步问题

## 问题描述

**现象**：渐进学习队列中，Riff 卡片的四个评分选项显示相同的时间

**根本原因**：Riff 卡片没有被同步到本地存储

### 问题分析

1. **设计意图**（来自 `design.md`）：
   - Riff 卡片应该在复习时被同步到本地存储
   - 本地存储是唯一的数据源，Riff 只是数据提供者
   - SchedulerRouter 需要 FSRSCard 才能预测 nextDues

2. **当前实现问题**：
   ```typescript
   // IncrementalLearningQueue.onFeedback()
   const fsrsCard = this.storage.getCard(cardID);
   if (fsrsCard) {
     // 使用 SchedulerRouter
   } else {
     // ❌ 问题：直接调用 Riff API，卡片永远不会被同步
     await this.api.reviewRiffCard(deckID, cardID, rating);
   }
   ```

3. **临时解决方案的问题**：
   - `_recalculateNextDues()` 创建了默认卡片
   - 但这只是在加载时创建，不是在复习时同步
   - 日志显示：`Card not found in storage, using Riff API: 20260131212923-0goa7d9`

---

## 解决方案

### 方案 1：在 onFeedback 时同步卡片（推荐）

**原理**：当 Riff 卡片第一次被复习时，从 Riff API 获取完整数据，创建 FSRSCard 并保存

**实现位置**：`IncrementalLearningQueue.onFeedback()`

```typescript
if (feedback.action === 'rate') {
  const rating = feedback.rating;
  if (!rating) return;

  if (this.schedulerRouter && this.storage) {
    let fsrsCard = this.storage.getCard(cardID);
    
    // 🆕 如果卡片不存在，从 Riff 数据创建
    if (!fsrsCard) {
      fsrsCard = await this._createCardFromRiff(currentItem);
      if (!fsrsCard) {
        // 如果创建失败，降级到 Riff API
        await this.api.reviewRiffCard(deckID, cardID, rating);
        return;
      }
    }

    // 使用 SchedulerRouter 进行复习
    const updatedCard = await this.schedulerRouter.route(fsrsCard, rating);

    // 可选：同步到 Riff
    if (!isLocal && this.config?.enableRiffSync) {
      await this.api.reviewRiffCard(deckID, cardID, rating);
    }
  }
}
```

**新增方法**：
```typescript
/**
 * 从 Riff 数据创建 FSRSCard
 * 
 * @param item QueueItem（来自 Riff API）
 * @returns FSRSCard 或 null（如果创建失败）
 */
private async _createCardFromRiff(item: QueueItem): Promise<FSRSCard | null> {
  try {
    const now = Date.now();
    
    // 从 QueueItem 提取数据
    const fsrsCard: FSRSCard = {
      id: item.cardID,
      blockId: item.blockID,
      due: now,  // 默认为当前时间
      stability: 0,  // 新卡片
      difficulty: 5,  // 默认难度
      reps: item.reps ?? 0,
      lapses: item.lapses ?? 0,
      state: item.state ?? 0,
      lastReview: item.lastReview ?? 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: item.priority ?? 50,
      type: 'item',  // 默认为 item，后续可以通过 detectCardType 更新
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
    };
    
    // 保存到本地存储
    this.storage!.setCard(fsrsCard);
    await this.storage!.saveCards();
    
    console.log('[IncrementalLearningQueue] ✅ Created card from Riff:', item.cardID);
    
    return fsrsCard;
  } catch (error) {
    console.error('[IncrementalLearningQueue] Failed to create card from Riff:', error);
    return null;
  }
}
```

---

### 方案 2：在加载时批量同步（备选）

**原理**：在 `_ensureRiffLoaded()` 时，批量创建所有缺失的卡片

**优点**：
- 一次性同步所有卡片
- 减少复习时的延迟

**缺点**：
- 加载时间更长
- 可能创建不必要的卡片（用户可能不会复习所有卡片）

**实现**：保留当前的 `_recalculateNextDues()` 方法，但需要确保：
1. 创建的卡片被正确保存
2. 日志输出更清晰

---

## 实施步骤

### Step 1: 修改 `onFeedback()` 方法

在 `IncrementalLearningQueue.onFeedback()` 中添加卡片创建逻辑：

```typescript
if (this.schedulerRouter && this.storage) {
  let fsrsCard = this.storage.getCard(cardID);
  
  // 🆕 如果卡片不存在，从 Riff 数据创建
  if (!fsrsCard) {
    console.log('[IncrementalLearningQueue] Card not found, creating from Riff:', cardID);
    fsrsCard = await this._createCardFromRiff(currentItem);
    if (!fsrsCard) {
      console.warn('[IncrementalLearningQueue] Failed to create card, using Riff API:', cardID);
      await this.api.reviewRiffCard(deckID, cardID, rating);
      if (!isLocal) {
        this._afterRiffConsumed(currentItem);
        this.riffCurrentRaw = null;
      }
      this.reviewedCount++;
      return;
    }
  }

  // 使用 SchedulerRouter 进行复习
  const updatedCard = await this.schedulerRouter.route(fsrsCard, rating);

  // 可选：同步到 Riff
  if (!isLocal && this.config?.enableRiffSync) {
    await this.api.reviewRiffCard(deckID, cardID, rating);
    console.log('[IncrementalLearningQueue] ✅ Synced to Riff:', cardID);
  }

  console.log('[IncrementalLearningQueue] ✅ Used SchedulerRouter:', {
    cardID,
    isLocal,
    cardType: updatedCard.type,
    schedulerType: updatedCard.schedulerType,
    syncedToRiff: !isLocal && this.config?.enableRiffSync,
  });
}
```

### Step 2: 添加 `_createCardFromRiff()` 方法

在 `IncrementalLearningQueue` 类中添加新方法（见上文）

### Step 3: 移除临时解决方案

可以选择保留或移除 `_recalculateNextDues()` 中的默认卡片创建逻辑：

**选项 A：保留**（推荐）
- 在加载时创建默认卡片，提供更好的用户体验
- 在复习时更新卡片数据

**选项 B：移除**
- 只在复习时创建卡片
- 减少不必要的卡片创建

### Step 4: 测试

1. **清空本地存储**：删除 `cards.msgpack`
2. **加载渐进学习队列**：检查日志
3. **复习 Riff 卡片**：检查是否创建了 FSRSCard
4. **检查 nextDues**：四个选项应该显示不同的时间

---

## 预期效果

### 修复前

```
[IncrementalLearningQueue] Card not found in storage, using Riff API: 20260131212923-0goa7d9
[IncrementalLearningQueue] nextDues: {
  1: "2026-02-01T12:00:00.000Z",
  2: "2026-02-01T12:00:00.000Z",
  3: "2026-02-01T12:00:00.000Z",
  4: "2026-02-01T12:00:00.000Z"
}
```

### 修复后

```
[IncrementalLearningQueue] Card not found, creating from Riff: 20260131212923-0goa7d9
[IncrementalLearningQueue] ✅ Created card from Riff: 20260131212923-0goa7d9
[IncrementalLearningQueue] ✅ Used SchedulerRouter: {
  cardID: "20260131212923-0goa7d9",
  isLocal: false,
  cardType: "item",
  schedulerType: "sm-15",
  syncedToRiff: false
}
[IncrementalLearningQueue] nextDues: {
  1: "2026-02-01T12:00:00.000Z",  // Again: 1 minute
  2: "2026-02-01T12:10:00.000Z",  // Hard: 10 minutes
  3: "2026-02-01T13:00:00.000Z",  // Good: 1 hour
  4: "2026-02-02T12:00:00.000Z"   // Easy: 1 day
}
```

---

## 相关文件

- `siyuan-plugin-fsrs/src/core/queue/strategies/IncrementalLearningQueue.ts`
- `siyuan-plugin-fsrs/src/core/storage/manager.ts`
- `siyuan-plugin-fsrs/src/core/scheduler/SchedulerRouter.ts`
- `.kiro/specs/riff-data-source-decoupling/design.md`

---

## 总结

**问题**：Riff 卡片没有被同步到本地存储，导致 nextDues 预测失败

**解决方案**：在 `onFeedback()` 时，如果卡片不存在，从 Riff 数据创建 FSRSCard

**关键点**：
1. 在复习时同步卡片（而不是只在加载时）
2. 使用 QueueItem 的数据创建 FSRSCard
3. 保存到本地存储后再使用 SchedulerRouter

**下一步**：实施修改并测试
