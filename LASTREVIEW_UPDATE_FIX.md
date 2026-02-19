# 上次复习时间更新修复

## 问题描述

用户反馈在复习卡片后，"上次复习"字段没有更新。从日志可以看到：
- 卡片评分成功：`[UnifiedQueueStrategy] Processing feedback: {action: 'rate', rating: 3}`
- 数据保存成功：`[SiyuanMemo] Saved 42 cards (msgpack)`
- 但"上次复习"字段仍然显示旧值或无效值

## 问题根源

在动态队列（RetrievalPracticeQueue、IncrementalLearningQueue、FilterGroupQueue）的 `handleReview` 方法中，只更新了 `due` 字段，但没有更新以下字段：

- `lastReview` - 上次复习时间
- `reps` - 复习次数
- `lapses` - 遗忘次数（评分 < 3 时）
- `updatedAt` - 更新时间戳

这导致虽然卡片被保存了，但复习记录没有被正确记录。

## 修复方案

### 1. RetrievalPracticeQueue

**文件**: `src/queues/RetrievalPracticeQueue.ts`

在 `handleReview` 方法中添加字段更新：

```typescript
public async handleReview(cardId: string, rating: number): Promise<void> {
    try {
        const card = await this.manager.getCard(cardId);
        const now = Date.now();
        
        if (rating >= 3) {
            // 记住了
            card.due = this.calculateNextDueDate(card, rating);
            card.lastReview = now;  // 🔧 修复
            card.reps = (card.reps || 0) + 1;  // 🔧 修复
            card.updatedAt = now;  // 🔧 修复
            
            await this.manager.updateCard(card);
            await this.removeCard(cardId);
        } else {
            // 忘记了
            const newDueDate = this.calculateNextDueDateForLowRating(card, rating);
            card.due = newDueDate;
            card.lastReview = now;  // 🔧 修复
            card.reps = (card.reps || 0) + 1;  // 🔧 修复
            card.lapses = (card.lapses || 0) + 1;  // 🔧 修复
            card.updatedAt = now;  // 🔧 修复
            
            await this.manager.updateCard(card);
            // ... 其他逻辑
        }
    } catch (error) {
        console.error('[RetrievalPracticeQueue] Failed to handle review:', error);
        throw error;
    }
}
```

### 2. IncrementalLearningQueue

**文件**: `src/queues/IncrementalLearningQueue.ts`

应用相同的修复：

```typescript
public async handleReview(cardId: string, rating: number): Promise<void> {
    try {
        const card = await this.manager.getCard(cardId);
        const now = Date.now();
        
        if (rating >= 3) {
            card.due = this.calculateNextDueDate(card, rating);
            card.lastReview = now;  // 🔧 修复
            card.reps = (card.reps || 0) + 1;  // 🔧 修复
            card.updatedAt = now;  // 🔧 修复
            
            await this.manager.updateCard(card);
            await this.removeCard(cardId);
        } else {
            const newDueDate = this.calculateNextDueDateForLowRating(card, rating);
            card.due = newDueDate;
            card.lastReview = now;  // 🔧 修复
            card.reps = (card.reps || 0) + 1;  // 🔧 修复
            card.lapses = (card.lapses || 0) + 1;  // 🔧 修复
            card.updatedAt = now;  // 🔧 修复
            
            await this.manager.updateCard(card);
            // ... 其他逻辑
        }
    } catch (error) {
        console.error('[IncrementalLearningQueue] Failed to handle review:', error);
        throw error;
    }
}
```

### 3. FilterGroupQueue

**文件**: `src/queues/FilterGroupQueue.ts`

应用相同的修复。

## 为什么之前没有更新这些字段？

这些队列使用的是**简化的调度逻辑**，而不是完整的 FSRS 算法：

1. **RetrievalPracticeQueue**: 检索练习队列，使用简单的间隔倍增（Good: x2, Easy: x4）
2. **IncrementalLearningQueue**: 渐进学习队列，使用 SM-15 算法
3. **FilterGroupQueue**: 过滤组队列，使用简单的间隔倍增

这些队列的 `calculateNextDueDate` 方法只计算并返回新的 `due` 时间，不像完整的 FSRS 调度器那样返回包含所有字段的新卡片对象。

## 对比：完整的 FSRS 调度器

完整的 FSRS 调度器（如 `SimpleFSRSScheduler`）会在 `review` 方法中返回一个包含所有更新字段的新卡片对象：

```typescript
review(card: FSRSCard, rating: Rating): FSRSCard {
    const nowMs = Date.now();
    // ... 计算逻辑
    return {
        ...card,
        due: fuzzedDue,
        stability: newStability,
        difficulty: newDifficulty,
        reps: newReps,
        lapses: newLapses,
        state: newState,
        lastReview: nowMs,  // ✅ 自动更新
        updatedAt: nowMs,   // ✅ 自动更新
        // ... 其他字段
    };
}
```

但简化队列需要手动更新这些字段。

## 修复效果

修复后，复习卡片时会正确更新：

- ✅ `lastReview` - 显示正确的复习时间
- ✅ `reps` - 复习次数递增
- ✅ `lapses` - 遗忘次数递增（评分 < 3 时）
- ✅ `updatedAt` - 更新时间戳
- ✅ UI 中"上次复习"字段显示正确

## 测试验证

1. 重新编译插件：`npm run build`
2. 重启思源笔记
3. 打开复习对话框
4. 复习一张卡片
5. 打开 SRS 编辑器查看卡片数据
6. 验证"上次复习"字段已更新为当前时间

## 相关文件

- `src/queues/RetrievalPracticeQueue.ts` - 检索练习队列
- `src/queues/IncrementalLearningQueue.ts` - 渐进学习队列
- `src/queues/FilterGroupQueue.ts` - 过滤组队列
- `src/strategies/UnifiedQueueStrategy.ts` - 统一队列策略（调用 handleReview）

## 注意事项

1. **FinalDrillQueue 和 NeuralRoamQueue 不受影响**：这两个静态队列不修改卡片的调度数据，所以不需要更新 `lastReview`
2. **向后兼容**：使用 `(card.reps || 0) + 1` 确保即使字段为 undefined 也能正确处理
3. **时间戳一致性**：所有时间戳使用 `Date.now()` 确保一致性
