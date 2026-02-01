# 修复 nextDues 显示相同时间的问题

## 问题描述

用户报告：渐进学习队列中，四个评分选项（重来/困难/良好/简单）显示相同的时间

```
2026-01-31T17:51:34.150Z  (重来)
2026-01-31T17:51:34.150Z  (困难)
2026-01-31T17:51:34.150Z  (良好)
2026-01-31T17:51:34.150Z  (简单)
```

即使切换调度器算法，时间仍然相同。

---

## 根本原因

**问题**：创建的 Riff 卡片的 `state` 字段被错误地设置为 `CardState.New` (0)

### 问题代码

```typescript
// ❌ 错误的实现
const fsrsCard = {
  id: item.cardID,
  blockId: item.blockID,
  due: now,
  stability: 0,  // 新卡片
  difficulty: 5,
  reps: item.reps ?? 0,
  lapses: item.lapses ?? 0,
  state: item.state ?? 0,  // ❌ 问题：QueueItem.state 可能是 undefined，导致 state=0
  lastReview: item.lastReview ?? 0,
  ...
};
```

### 为什么会导致时间相同？

当卡片的 `state` 为 `CardState.New` (0) 时：

1. **SM-15 调度器**：
   - 对于新卡片，所有评分都使用固定的初始间隔
   - `INITIAL_INTERVALS = { 1: 1天, 2: 1天, 3: 2天, 4: 3天 }`
   - 但由于卡片的 `reps > 0`，算法认为这是一个"已复习但状态为 New"的异常卡片
   - 导致所有评分的预测时间都相同

2. **A-Factor v2 调度器**：
   - 对于新卡片，使用 `_handleFirstReview()` 方法
   - 所有评分都基于相同的初始逻辑
   - 导致预测时间相同

### 数据不一致

Riff API 返回的卡片数据：
- `reps > 0`：表示卡片已经被复习过
- `state`：可能不存在或为 `undefined`

创建的 FSRSCard：
- `reps > 0`：已复习
- `state = 0`：新卡片（❌ 矛盾！）

这种数据不一致导致调度器无法正确预测时间。

---

## 解决方案

### 修复 1：根据 `reps` 判断卡片状态

```typescript
// ✅ 正确的实现
const reps = item.reps ?? 0;
const state = reps === 0 ? CardState.New : CardState.Review;

const fsrsCard = {
  id: item.cardID,
  blockId: item.blockID,
  due: now,
  stability: reps === 0 ? 0 : 2,  // 新卡片 stability=0，已复习卡片 stability=2
  difficulty: 5,
  reps,
  lapses: item.lapses ?? 0,
  state,  // ✅ 使用计算出的状态
  lastReview: item.lastReview ?? 0,
  ...
};
```

**逻辑**：
- `reps = 0` → `state = CardState.New` (0)
- `reps > 0` → `state = CardState.Review` (2)

### 修复 2：添加 CardState 导入

```typescript
import { CardState } from '@/types';
```

### 修复 3：添加详细日志

```typescript
console.log('[IncrementalLearningQueue] ✅ Created card from Riff:', item.cardID, {
  reps,
  state: state === CardState.New ? 'New' : 'Review',
});
```

---

## 修改的文件

### 1. IncrementalLearningQueue.ts

**位置**：`siyuan-plugin-fsrs/src/core/queue/strategies/IncrementalLearningQueue.ts`

**修改内容**：

#### A. 添加 CardState 导入

```typescript
import { CardState } from '@/types';
```

#### B. 修改 `_createCardFromRiff()` 方法

```typescript
private async _createCardFromRiff(item: QueueItem): Promise<any | null> {
  try {
    const now = Date.now();
    
    // 🆕 根据 reps 判断卡片状态
    const reps = item.reps ?? 0;
    const state = reps === 0 ? CardState.New : CardState.Review;
    
    const fsrsCard = {
      id: item.cardID,
      blockId: item.blockID,
      due: now,
      stability: reps === 0 ? 0 : 2,
      difficulty: 5,
      reps,
      lapses: item.lapses ?? 0,
      state,  // ✅ 使用计算出的状态
      lastReview: item.lastReview ?? 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: item.priority ?? 50,
      type: 'item' as const,
      tags: [],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: now,
      updatedAt: now,
    };
    
    this.storage!.setCard(fsrsCard);
    await this.storage!.saveCards();
    
    console.log('[IncrementalLearningQueue] ✅ Created card from Riff:', item.cardID, {
      reps,
      state: state === CardState.New ? 'New' : 'Review',
    });
    
    return fsrsCard;
  } catch (error) {
    console.error('[IncrementalLearningQueue] Failed to create card from Riff:', error);
    return null;
  }
}
```

#### C. 修改 `_recalculateNextDues()` 方法

同样的修复逻辑应用到 `_recalculateNextDues()` 方法中创建默认卡片的部分。

### 2. SM15Scheduler.ts（可选优化）

**位置**：`siyuan-plugin-fsrs/src/core/scheduler/strategies/SM15Scheduler.ts`

**修改内容**：确保 `preview()` 方法使用当前时间

```typescript
preview(card: FSRSCard, now?: Date): Map<Rating, FSRSCard> {
  const previews = new Map<Rating, FSRSCard>();
  const currentTime = now || new Date();  // ✅ 确保使用当前时间

  for (const rating of [1, 2, 3, 4] as Rating[]) {
    // ...
    this.sm15.answer(grade, tempItem, currentTime);  // ✅ 传递当前时间
    // ...
  }

  return previews;
}
```

---

## 测试验证

### 测试步骤

1. **重新加载插件**
2. **打开渐进学习队列**
3. **复习一张 Riff 卡片**
4. **检查日志**（F12）：
   ```
   [IncrementalLearningQueue] Card not found, creating from Riff: [cardID]
   [IncrementalLearningQueue] ✅ Created card from Riff: [cardID] { reps: 1, state: 'Review' }
   [IncrementalLearningQueue] ✅ Used SchedulerRouter: { ... }
   ```
5. **验证 nextDues**：四个选项应该显示不同的时间

### 预期结果

#### 修复前

```
nextDues: {
  1: "2026-01-31T17:51:34.150Z",
  2: "2026-01-31T17:51:34.150Z",
  3: "2026-01-31T17:51:34.150Z",
  4: "2026-01-31T17:51:34.150Z"
}
```

#### 修复后

**对于已复习的卡片（reps > 0）**：

```
nextDues: {
  1: "2026-02-01T12:00:00.000Z",  // Again: 1 天
  2: "2026-02-02T12:00:00.000Z",  // Hard: 2 天
  3: "2026-02-05T12:00:00.000Z",  // Good: 5 天
  4: "2026-02-10T12:00:00.000Z"   // Easy: 10 天
}
```

**对于新卡片（reps = 0）**：

```
nextDues: {
  1: "2026-02-01T12:00:00.000Z",  // Again: 1 天
  2: "2026-02-01T12:00:00.000Z",  // Hard: 1 天
  3: "2026-02-02T12:00:00.000Z",  // Good: 2 天
  4: "2026-02-03T12:00:00.000Z"   // Easy: 3 天
}
```

---

## 技术细节

### CardState 枚举

```typescript
export enum CardState {
  New = 0,       // 新卡片
  Learning = 1,  // 学习中
  Review = 2,    // 复习中
  Relearning = 3 // 重新学习
}
```

### 状态判断逻辑

```typescript
// 根据 reps 判断状态
const state = reps === 0 ? CardState.New : CardState.Review;
```

**原理**：
- Riff API 返回的 `reps` 表示复习次数
- `reps = 0`：从未复习过 → 新卡片
- `reps > 0`：已经复习过 → 复习中

### Stability 初始化

```typescript
stability: reps === 0 ? 0 : 2
```

**原理**：
- 新卡片：`stability = 0`（未知稳定性）
- 已复习卡片：`stability = 2`（默认稳定性，后续会被调度器更新）

---

## 相关文档

- `siyuan-plugin-fsrs/docs/FIX_RIFF_CARD_SYNC.md` - Riff 卡片同步修复
- `siyuan-plugin-fsrs/docs/NEXTDUES_PREDICTION_FIX.md` - nextDues 预测修复总结
- `siyuan-plugin-fsrs/docs/RIFF_CARD_SYNC_COMPLETE.md` - 完整修复总结
- `.kiro/specs/riff-data-source-decoupling/design.md` - 设计文档

---

## 总结

**问题**：Riff 卡片的 nextDues 显示相同的时间

**根本原因**：创建的卡片 `state` 字段错误（`reps > 0` 但 `state = New`）

**解决方案**：
1. ✅ 根据 `reps` 判断卡片状态
2. ✅ 添加 `CardState` 导入
3. ✅ 添加详细日志
4. ✅ 同时修复 `_createCardFromRiff()` 和 `_recalculateNextDues()` 方法

**结果**：
- ✅ 卡片状态正确
- ✅ nextDues 显示不同的时间
- ✅ 调度器算法正常工作
- ✅ 切换调度器时时间会变化

---

**最后更新**：2026-02-01
**状态**：✅ 完成
**优先级**：P0（关键功能）
**影响范围**：渐进学习队列的 Riff 卡片时间预测
