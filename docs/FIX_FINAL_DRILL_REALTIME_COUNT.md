# 修复刻意练习实时显示剩余卡片数量

## 问题描述

用户反馈：复习的时候，没有动态显示还剩多少张卡片。一直点评分 4，点完了后才改动剩下卡片的数量。

## 根本原因

`FinalDrillAdapter` 在构建 UI 状态时，使用的是 `progress.total`（初始总数），而不是实时的剩余卡片数量。

### 原来的代码
```typescript
const total = Math.max(0, Number(progress.total) || 0);
const answered = Math.max(0, Number(progress.answered) || 0);
const current = item ? Math.min(total || answered + 1, answered + 1) : total;

// ...

stats: {
  current,
  total,  // ❌ 使用的是初始总数，不会实时更新
  label: t(this.i18n, 'queueDeliberate', '最终冲刺'),
  queueName: 'final-drill',
  newCards: total,  // ❌ 也是初始总数
  reviewCards: 0,
}
```

### 问题分析
假设队列有 7 张卡片：
- 开始：显示 `1/7`
- 评分 4（移除）：仍然显示 `2/7` ❌ 应该显示 `2/6`
- 评分 4（移除）：仍然显示 `3/7` ❌ 应该显示 `3/5`
- ...直到全部完成才变成 `7/0`

用户看到的是 `current/total`（当前进度/初始总数），而不是 `current/remaining`（当前进度/剩余卡片）。

## 解决方案

### 核心思路
使用 `queue.getAllItems().length` 获取**实时剩余卡片数量**，而不是 `progress.total`（初始总数）。

### 修改的代码

#### 1. 获取实时剩余卡片数量
```typescript
// ✅ 修复：使用实时剩余卡片数量，而不是 total
const remaining = typeof queue?.getAllItems === 'function'
  ? queue.getAllItems().length
  : 0;
const answered = Math.max(0, Number(progress.answered) || 0);
const current = item ? answered + 1 : answered;
```

#### 2. 在 stats 中使用 remaining
```typescript
stats: {
  current,
  total: remaining,  // ✅ 修复：显示剩余卡片数量
  label: t(this.i18n, 'queueDeliberate', '最终冲刺'),
  queueName: 'final-drill',
  newCards: remaining,  // ✅ 修复：显示剩余卡片数量
  reviewCards: 0,
}
```

#### 3. drillStats 仍使用 progress.total
```typescript
drillStats: {
  correct: Math.max(0, Number(progress.correct) || 0),
  total: Math.max(0, Number(progress.total) || 0),  // ✅ 使用 progress.total（初始总数）
  duration: toSeconds(Number(progress.durationMs) || 0),
}
```

注意：`drillStats` 中的 `total` 仍然使用 `progress.total`（初始总数），因为这是用于统计的，表示"总共练习了多少张卡片"。

## 修复后的效果

假设队列有 7 张卡片：

| 操作 | 显示 | 说明 |
|------|------|------|
| 开始 | `1/7` | 第 1 张，剩余 7 张 |
| 评分 4（移除） | `2/6` ✅ | 第 2 张，剩余 6 张 |
| 评分 4（移除） | `3/5` ✅ | 第 3 张，剩余 5 张 |
| 评分 2（旋转） | `4/5` ✅ | 第 4 张，剩余 5 张（卡片旋转到队尾） |
| 评分 4（移除） | `5/4` ✅ | 第 5 张，剩余 4 张 |
| ... | ... | ... |
| 完成 | `0/0` | 全部完成 |

现在用户可以实时看到剩余卡片数量的变化了！

## 两个 total 的区别

### 1. `stats.total`（UI 显示）
- **含义**：剩余卡片数量
- **来源**：`queue.getAllItems().length`
- **用途**：显示在复习界面顶部，告诉用户还剩多少张卡片
- **实时更新**：每次评分后都会更新

### 2. `drillStats.total`（统计数据）
- **含义**：初始总数
- **来源**：`progress.total`（在开始复习时记录）
- **用途**：用于统计，表示"总共练习了多少张卡片"
- **不会更新**：始终是初始队列大小

### 示例
假设队列有 7 张卡片，用户评分了 5 次（3 次评分 4，2 次评分 < 4）：
- `stats.total` = 2（剩余 2 张）
- `drillStats.total` = 7（初始总数）
- `drillStats.correct` = 3（评分 >= 3 的次数）
- `progress.answered` = 5（总共评分了 5 次）

## 相关文件

- `siyuan-plugin-fsrs/src/ui/review/v2/adapters/FinalDrillAdapter.ts`

## 总结

这个修复让刻意练习的复习界面能够实时显示剩余卡片数量：
- **UI 显示**：`current/remaining`（当前进度/剩余卡片）
- **统计数据**：`answered/total`（已答题数/初始总数）

现在用户可以清楚地看到每次评分后剩余卡片数量的变化了！
