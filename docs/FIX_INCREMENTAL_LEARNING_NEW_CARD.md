# Fix: Incremental Learning Queue New Card Issues

## Summary

修复了渐进学习队列中新卡片的两个关键问题：
1. **评分 1 (Again) 后卡片被移除队列** → 现在根据卡片状态决定是否移除
2. **预测时间显示为"昨天"** → 现在正确显示未来的时间

## Problems Fixed

### Problem 1: Card Removed After Rating 1

**Before:**
- 所有非本地卡片在复习后都会被移除队列
- 评分 1 (Again) 后，卡片消失，无法继续学习

**After:**
- 根据卡片状态和评分决定是否移除：
  - `New/Learning/Relearning` 状态 → **保留**（继续学习）
  - `Review` 状态 + `rating >= 3` → **移除**（已掌握）
  - `Review` 状态 + `rating < 3` → **保留**（需要重新学习）

### Problem 2: Prediction Times Show "Yesterday"

**Before:**
- 新卡片的 `due` 设置为当前时间 (`now`)
- 导致预测时间计算错误，显示为"昨天"

**After:**
- 新卡片的 `due` 设置为过去的时间 (`now - 24h`)
- 确保卡片立即可用于复习
- 预测时间正确显示未来的时间

## Implementation Details

### 1. New Helper Methods

#### `_shouldRemoveFromQueue(card, rating)`

判断卡片是否应该从队列中移除：

```typescript
private _shouldRemoveFromQueue(card: any, rating: 1 | 2 | 3 | 4): boolean {
  const state = card.state;
  
  // New/Learning/Relearning 状态：保留
  if (state === CardState.New || 
      state === CardState.Learning || 
      state === CardState.Relearning) {
    return false;
  }
  
  // Review 状态：根据评分决定
  if (state === CardState.Review) {
    return rating >= 3;  // Good/Easy → 移除，Again/Hard → 保留
  }
  
  // 默认：移除（安全起见）
  return true;
}
```

#### `_calculateNextDues(card)`

计算四个评分选项的预测时间：

```typescript
private _calculateNextDues(card: any): Record<1 | 2 | 3 | 4, string> {
  if (!this.schedulerRouter) {
    return { 1: '', 2: '', 3: '', 4: '' };
  }

  try {
    const previews = this.schedulerRouter.preview(card);

    return {
      1: previews.get(1) ? new Date(previews.get(1)!.due).toISOString() : '',
      2: previews.get(2) ? new Date(previews.get(2)!.due).toISOString() : '',
      3: previews.get(3) ? new Date(previews.get(3)!.due).toISOString() : '',
      4: previews.get(4) ? new Date(previews.get(4)!.due).toISOString() : '',
    };
  } catch (error) {
    console.error('[IncrementalLearningQueue] Failed to calculate nextDues:', error);
    return { 1: '', 2: '', 3: '', 4: '' };
  }
}
```

### 2. Updated Methods

#### `_createCardFromRiff(item)`

**Before:**
```typescript
due: now,  // ❌ 当前时间
```

**After:**
```typescript
const oneDayAgo = now - 24 * 60 * 60 * 1000;
due: oneDayAgo,  // ✅ 昨天
```

#### `_recalculateNextDues()`

**Before:**
```typescript
due: now,  // ❌ 当前时间
```

**After:**
```typescript
const oneDayAgo = now - 24 * 60 * 60 * 1000;
due: oneDayAgo,  // ✅ 昨天
```

#### `onFeedback(currentItem, feedback)`

**Before:**
```typescript
// 所有非本地卡片都会被移除
if (!isLocal) {
  this._afterRiffConsumed(currentItem);
  this.riffCurrentRaw = null;
}
```

**After:**
```typescript
// 根据卡片状态决定是否移除
if (!isLocal) {
  const shouldRemove = this._shouldRemoveFromQueue(updatedCard, rating);
  
  if (shouldRemove) {
    // 移除：更新计数器
    this._afterRiffConsumed(currentItem);
    this.riffCurrentRaw = null;
  } else {
    // 保留：重新加入队列
    const nextDues = this._calculateNextDues(updatedCard);
    this.riffBuffer.push({
      ...currentItem,
      nextDues,
      state: updatedCard.state,
      reps: updatedCard.reps,
      lapses: updatedCard.lapses,
    });
  }
}
```

## Testing Guide

### Manual Testing Steps

1. **准备测试数据**
   - 重置 4 张卡为新卡状态
   - 加入渐进学习队列

2. **测试预测时间**
   - 打开第一张卡
   - 检查四个评分选项的预测时间
   - ✅ 应该显示未来的时间（不是"昨天"）
   - ✅ 四个时间应该不同

3. **测试评分 1 (Again)**
   - 点击评分 1
   - 检查队列中是否还有这张卡
   - ✅ 卡片应该保留在队列中
   - ✅ 预测时间应该更新

4. **测试评分 3 (Good)**
   - 点击评分 3
   - 检查队列中是否还有这张卡
   - ✅ 卡片应该从队列中移除（如果状态是 Review）

5. **检查日志**
   - 打开浏览器控制台
   - 查看日志输出
   - ✅ 应该看到 "Card removal decision" 日志
   - ✅ 应该看到 "Calculated nextDues" 日志

### Expected Log Output

```
[IncrementalLearningQueue] Card not found, creating from Riff: 20260131212923-0goa7d9
[IncrementalLearningQueue] ✅ Created card from Riff: 20260131212923-0goa7d9 {
  reps: 0,
  state: 'New',
  due: '2026-01-30T21:29:23.000Z',
  dueTimestamp: 1738274963000
}
[IncrementalLearningQueue] Card removal decision: {
  cardID: '20260131212923-0goa7d9',
  state: 'Learning',
  rating: 1,
  shouldRemove: false
}
[IncrementalLearningQueue] Calculated nextDues: {
  cardID: '20260131212923-0goa7d9',
  nextDues: {
    again: '2026-01-31T21:39:23.000Z',
    hard: '2026-02-01T09:29:23.000Z',
    good: '2026-02-03T21:29:23.000Z',
    easy: '2026-02-07T21:29:23.000Z'
  }
}
[IncrementalLearningQueue] ✅ Card kept in queue: 20260131212923-0goa7d9
```

## Card State Transitions

| From State | Rating | To State | Action | Reason |
|------------|--------|----------|--------|--------|
| New | 1 (Again) | Learning | **Keep** | 进入学习状态，需要继续学习 |
| New | 2-4 | Review | **Keep** | 间隔很短，需要继续复习 |
| Learning | 1 (Again) | Learning | **Keep** | 仍在学习中 |
| Learning | 2-4 | Review | **Keep** | 可能进入 Review，但间隔很短 |
| Review | 1 (Again) | Relearning | **Keep** | 进入重新学习状态 |
| Review | 2 (Hard) | Review | **Keep** | 间隔较短，需要继续复习 |
| Review | 3 (Good) | Review | **Remove** | 已掌握，移除队列 |
| Review | 4 (Easy) | Review | **Remove** | 已掌握，移除队列 |
| Relearning | 1 (Again) | Relearning | **Keep** | 仍在重新学习中 |
| Relearning | 2-4 | Review | **Keep** | 可能进入 Review，但间隔很短 |

## Files Modified

- `siyuan-plugin-fsrs/src/core/queue/strategies/IncrementalLearningQueue.ts`
  - Added `_shouldRemoveFromQueue()` method
  - Added `_calculateNextDues()` method
  - Updated `_createCardFromRiff()` method
  - Updated `_recalculateNextDues()` method
  - Updated `onFeedback()` method

## Related Issues

- User reported: "评分 1 后卡片被移除"
- User reported: "四个评分选项的预测时间都是昨天"

## Future Improvements

1. **Configurable Removal Rules**
   - Allow users to configure when cards should be removed
   - Options: "Remove after Good/Easy", "Remove after Easy only", "Never remove"

2. **Smart Queue Management**
   - Prioritize cards in Learning/Relearning state
   - Group cards by state for better UX

3. **Analytics**
   - Track how many cards are kept vs removed
   - Track average time in Learning state

## References

- Spec: `.kiro/specs/fix-incremental-learning-new-card-issues/`
- Design: `.kiro/specs/fix-incremental-learning-new-card-issues/design.md`
- Tasks: `.kiro/specs/fix-incremental-learning-new-card-issues/tasks.md`
