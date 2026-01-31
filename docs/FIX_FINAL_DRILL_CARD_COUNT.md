# 修复刻意练习卡片数量显示不一致问题

## 问题描述

用户报告：刻意练习复习界面显示的闪卡数量和浏览器里队列显示的闪卡数量不一样。

## 根本原因

刻意练习队列的特殊逻辑导致数量计算错误：

### 刻意练习的逻辑
- **评分 >= 4**：从队列移除（完成）
- **评分 < 4**：旋转到队尾（继续练习）

### 原来的计算方式
```typescript
getProgress(): { answered: number; correct: number; total: number; durationMs: number } {
  const remaining = this.queue.getAllItems().length;
  const total = this.progress.answered + remaining;  // ❌ 错误！
  return { answered: this.progress.answered, correct: this.progress.correct, total, durationMs: this.progress.durationMs };
}
```

### 问题分析
1. **浏览器显示**：`queue.getAllItems().length` = 实际队列中的卡片数量（例如：7 张）
2. **复习界面显示**：`total = answered + remaining`

当用户评分 < 4 时：
- 卡片被旋转到队尾，`remaining` 保持不变（仍然是 7）
- 但 `answered` 增加了 1
- 所以 `total = answered + remaining` 会变成 8、9、10...越来越大！

### 示例
假设队列有 7 张卡片：

| 操作 | answered | remaining | total (错误) | 实际队列大小 |
|------|----------|-----------|--------------|--------------|
| 开始 | 0 | 7 | 7 | 7 |
| 评分 2（旋转） | 1 | 7 | 8 ❌ | 7 |
| 评分 3（旋转） | 2 | 7 | 9 ❌ | 7 |
| 评分 4（移除） | 3 | 6 | 9 ❌ | 6 |
| 评分 1（旋转） | 4 | 6 | 10 ❌ | 6 |

可以看到，`total` 越来越大，但实际队列大小只有 6-7 张。

## 解决方案

### 核心思路
刻意练习的 `total` 应该是**初始队列大小**，而不是动态计算的 `answered + remaining`。

### 实现方式
1. 在 `ProgressSnapshot` 中添加 `initialTotal` 字段
2. 在开始复习时记录初始队列大小
3. 使用 `initialTotal` 作为 `total` 的值

### 修改的代码

#### 1. 添加 `initialTotal` 字段
```typescript
type ProgressSnapshot = {
  inProgress: boolean;
  answered: number;
  correct: number;
  startedAt: number;
  durationMs: number;
  updatedAt: number;
  initialTotal: number;  // ✅ 新增：记录初始队列大小
};
```

#### 2. 初始化时加载 `initialTotal`
```typescript
async init(): Promise<void> {
  if (!this.progressAdapter) return;
  const snap = await this.progressAdapter.load();
  if (!snap) return;
  // ... 其他字段
  const initialTotal = Math.max(0, Math.floor(Number((snap as any).initialTotal) || 0));
  this.progress = { inProgress, answered, correct, startedAt, durationMs, updatedAt, initialTotal };
  // ...
}
```

#### 3. 开始复习时记录 `initialTotal`
```typescript
// 继续复习
if (id === 'resume-continue') {
  this.resumePromptVisible = false;
  this.ensureStarted();
  this.progress.inProgress = true;
  // ✅ 如果 initialTotal 为 0，说明是第一次开始，记录初始队列大小
  if (this.progress.initialTotal === 0) {
    this.progress.initialTotal = this.progress.answered + this.queue.getAllItems().length;
  }
  await this.saveProgress();
  return;
}

// 重新开始
if (id === 'resume-start-over') {
  this.resumePromptVisible = false;
  const currentQueueSize = this.queue.getAllItems().length;
  this.progress = {
    inProgress: true,
    answered: 0,
    correct: 0,
    startedAt: Date.now(),
    durationMs: 0,
    updatedAt: Date.now(),
    initialTotal: currentQueueSize,  // ✅ 记录初始队列大小
  };
  this.lastTickAt = Date.now();
  await this.saveProgress();
  return;
}
```

#### 4. 第一次评分时记录 `initialTotal`
```typescript
this.ensureStarted();
this.progress.inProgress = true;

// ✅ 如果 initialTotal 为 0，说明是第一次开始，记录初始队列大小
if (this.progress.initialTotal === 0) {
  this.progress.initialTotal = this.progress.answered + this.queue.getAllItems().length;
}

await this.api.reviewRiffCard(deckID, cardID, rating).catch(async () => {
  await pushErrMsg(this.t('drillFailed', '机械练习启动失败'));
});
```

#### 5. 使用 `initialTotal` 计算 `total`
```typescript
getProgress(): { answered: number; correct: number; total: number; durationMs: number } {
  const remaining = this.queue.getAllItems().length;
  // ✅ 修复：使用 initialTotal 作为总数
  // 刻意练习中，评分 < 4 的卡片会旋转到队尾，所以 total 应该是初始队列大小
  const total = this.progress.initialTotal || (this.progress.answered + remaining);
  return { answered: this.progress.answered, correct: this.progress.correct, total, durationMs: this.progress.durationMs };
}
```

## 修复后的效果

假设队列有 7 张卡片：

| 操作 | answered | remaining | total (正确) | 实际队列大小 |
|------|----------|-----------|--------------|--------------|
| 开始 | 0 | 7 | 7 ✅ | 7 |
| 评分 2（旋转） | 1 | 7 | 7 ✅ | 7 |
| 评分 3（旋转） | 2 | 7 | 7 ✅ | 7 |
| 评分 4（移除） | 3 | 6 | 7 ✅ | 6 |
| 评分 1（旋转） | 4 | 6 | 7 ✅ | 6 |

现在 `total` 始终是 7（初始队列大小），与浏览器显示的数量一致！

## 向后兼容性

对于旧的进度数据（没有 `initialTotal` 字段）：
- 如果 `initialTotal === 0`，则在第一次操作时自动计算并记录
- 降级到原来的计算方式：`answered + remaining`

这样可以确保旧数据也能正常工作。

## 测试建议

1. **新建队列测试**
   - 添加 7 张卡片到刻意练习队列
   - 浏览器显示：7 张
   - 开始复习，界面显示：0/7
   - 评分 2（旋转），界面显示：1/7 ✅
   - 评分 3（旋转），界面显示：2/7 ✅
   - 评分 4（移除），界面显示：3/7 ✅

2. **继续复习测试**
   - 中途退出复习
   - 重新打开，选择"继续"
   - 数量应该保持一致

3. **重新开始测试**
   - 中途退出复习
   - 重新打开，选择"重新开始"
   - 数量应该重置为当前队列大小

## 相关文件

- `siyuan-plugin-fsrs/src/ui/review/v2/sessions/FinalDrillV2Session.ts`

## 总结

这个修复解决了刻意练习队列中卡片数量显示不一致的问题。核心思路是：
- **浏览器显示**：实时队列大小（`queue.getAllItems().length`）
- **复习界面显示**：初始队列大小（`initialTotal`）

这样两者就能保持一致了！
