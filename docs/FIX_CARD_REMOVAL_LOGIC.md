# 修复：卡片移除逻辑

## 问题描述

所有队列在复习后都会无条件移除卡片，导致学习中的卡片（Learning/Relearning）无法继续复习。

## 根本原因

**BaseCompositeQueue** 的 `onFeedback()` 方法在评分后无条件移除卡片：

```typescript
// ❌ 问题代码
async onFeedback(currentItem, feedback) {
  if (feedback.action === 'rate') {
    await this.scheduler.schedule(item, rating);
    
    // 无条件移除
    if (this.dataSource.remove) {
      await this.dataSource.remove([item]);
    }
  }
}
```

## 影响范围

所有继承 BaseCompositeQueue 的队列都受影响：
1. **提取练习队列（RetrievalPracticeQueue）** ✅ 已修复
2. **渐进学习队列（IncrementalLearningQueue）** ✅ 已修复（独立实现）

## 修复方案

### 1. 修复 BaseCompositeQueue

添加 `_shouldRemoveFromQueue()` 方法，根据卡片状态决定是否移除：

```typescript
/**
 * 判断卡片是否应该从队列中移除
 * 
 * 规则：
 * - New/Learning/Relearning 状态：保留（继续学习）
 * - Review 状态 + rating >= 3：移除（已掌握）
 * - Review 状态 + rating < 3：保留（需要重新学习）
 */
protected _shouldRemoveFromQueue(item: any, rating?: number): boolean {
  if (!rating) return true;
  if (!('state' in item)) return true;  // 向后兼容
  
  const state = item.state;
  
  // New/Learning/Relearning：保留
  if (state === 0 || state === 1 || state === 3) {
    return false;
  }
  
  // Review：根据评分决定
  if (state === 2) {
    return rating >= 3;  // Good/Easy → 移除，Again/Hard → 保留
  }
  
  return true;  // 默认移除
}
```

### 2. 更新 onFeedback() 方法

```typescript
async onFeedback(currentItem, feedback) {
  if (feedback.action === 'rate') {
    await this.scheduler.schedule(item, rating);
    
    // ✅ 根据卡片状态决定是否移除
    const shouldRemove = this._shouldRemoveFromQueue(item, rating);
    
    if (shouldRemove) {
      if (this.dataSource.remove) {
        await this.dataSource.remove([item]);
      }
    }
  }
}
```

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

## 向后兼容性

- 如果卡片没有 `state` 字段，默认移除（保持原有行为）
- 如果没有评分，默认移除
- 不影响其他队列类型（终极攻克队列等）

## 测试建议

1. **测试新卡片**
   - 评分 1 → 卡片应该保留在队列中
   - 评分 2-4 → 卡片应该保留在队列中（间隔很短）

2. **测试学习中的卡片**
   - 评分 1 → 卡片应该保留
   - 评分 2-4 → 卡片应该保留

3. **测试复习卡片**
   - 评分 1 → 卡片应该保留（进入 Relearning）
   - 评分 2 → 卡片应该保留（间隔较短）
   - 评分 3-4 → 卡片应该移除（已掌握）

## 额外修复：RiffDataSource lastReview 类型问题

### 问题
`RiffDataSource.mergeLocalNextDues()` 方法中，`lastReview` 字段可能是 `Date` 对象或 `number` 类型，直接调用 `.getTime()` 会导致类型错误。

### 错误信息
```
TypeError: _a3.getTime is not a function
```

### 修复方案
安全处理 `lastReview` 字段：

```typescript
// ✅ 修复后
let lastReviewTime: number | undefined;
if (localCard.lastReview) {
  lastReviewTime = typeof localCard.lastReview === 'number' 
    ? localCard.lastReview 
    : localCard.lastReview.getTime?.();
}

return {
  ...item,
  lastReview: lastReviewTime,
};
```

## 相关文件

- `siyuan-plugin-fsrs/src/core/queue/composite/BaseCompositeQueue.ts` - 基础队列类
- `siyuan-plugin-fsrs/src/core/queue/strategies/IncrementalLearningQueue.ts` - 渐进学习队列
- `siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts` - 提取练习队列
- `siyuan-plugin-fsrs/src/core/queue/datasource/RiffDataSource.ts` - Riff 数据源（lastReview 类型修复）

## 相关文档

- `FIX_INCREMENTAL_LEARNING_NEW_CARD.md` - 渐进学习队列的完整修复文档
- `.kiro/specs/fix-incremental-learning-new-card-issues/` - 修复规格文档
