# 修复：RiffDataSource lastReview 类型错误

## 问题描述

在提取练习队列和渐进学习队列中，评分后出现类型错误：

```
TypeError: _a3.getTime is not a function
```

错误发生在 `RiffDataSource.mergeLocalNextDues()` 方法中。

## 根本原因

`FSRSCard.lastReview` 字段可能是以下两种类型之一：
1. `Date` 对象（有 `.getTime()` 方法）
2. `number` 类型（时间戳，没有 `.getTime()` 方法）

代码直接调用 `localCard.lastReview?.getTime()` 导致类型错误：

```typescript
// ❌ 问题代码
return {
  ...item,
  lastReview: localCard.lastReview?.getTime(),  // 如果是 number，会报错
};
```

## 修复方案

添加类型检查，安全处理 `lastReview` 字段：

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

## 额外修复：SchedulerRouter 未传递

### 问题
`RetrievalPracticeQueue` 没有收到 `SchedulerRouter`，导致无法更新卡片状态。

### 日志证据
```
[RetrievalPracticeQueue] Scheduler called: {
  cardID: '...',
  grade: 1,
  hasRouter: false,  // ← 问题！
  hasStorage: true
}

[RetrievalPracticeQueue] No router/storage, using Riff API
[RetrievalPracticeQueue] Returning original card (no update)
```

### 修复方案

1. **ReviewDialogManagerDeps** (`src/services/ReviewDialogManager.ts`)
   - 添加 `schedulerRouter?: any` 参数

2. **ReviewDialogManager.openRetrievalPractice()** (`src/services/ReviewDialogManager.ts`)
   - 传递 `schedulerRouter` 给 `RetrievalPracticeProvider`

3. **RetrievalPracticeProvider** (`src/ui/review/v2/providers/RetrievalPracticeProvider.ts`)
   - 添加 `schedulerRouter?: any` 参数
   - 传递给 `RetrievalPracticeQueue`

4. **index.ts**
   - 传递 `schedulerRouter` 给 `ReviewDialogManager`

### 修复后的日志
```
[RetrievalPracticeQueue] Scheduler called: {
  cardID: '...',
  grade: 1,
  hasRouter: true,  // ✅ 修复！
  hasStorage: true
}

[RetrievalPracticeQueue] ✅ Used SchedulerRouter: {
  cardID: '...',
  state: 1,  // Learning 状态
  oldState: 0  // New 状态
}

[BaseCompositeQueue] _shouldRemoveFromQueue: keeping card (New/Learning/Relearning)
```

## 修复位置

**文件**: 
- `siyuan-plugin-fsrs/src/core/queue/datasource/RiffDataSource.ts` - lastReview 类型修复
- `siyuan-plugin-fsrs/src/services/ReviewDialogManager.ts` - 添加 schedulerRouter 参数
- `siyuan-plugin-fsrs/src/ui/review/v2/providers/RetrievalPracticeProvider.ts` - 传递 schedulerRouter
- `siyuan-plugin-fsrs/src/index.ts` - 传递 schedulerRouter 给 ReviewDialogManager

## 测试建议

1. **提取练习队列**
   - 评分 1 → 卡片应该保留，不应该报错
   - 评分 3-4 → 卡片应该移除，不应该报错

2. **渐进学习队列**
   - 评分 1 → 卡片应该保留，不应该报错
   - 评分 3-4 → 卡片应该移除，不应该报错

3. **验证 lastReview 字段**
   - 检查控制台日志，确认 `lastReview` 字段正确合并
   - 验证预测时间显示正确（未来时间，不是"昨天"）

4. **验证 SchedulerRouter**
   - 检查控制台日志，确认 `hasRouter: true`
   - 验证卡片状态正确更新（New → Learning）

## 相关修复

这个修复是卡片移除逻辑修复的一部分：

1. **BaseCompositeQueue** - 添加 `_shouldRemoveFromQueue()` 方法
2. **RetrievalPracticeQueue** - 修改调度器返回更新后的卡片状态
3. **IncrementalLearningQueue** - 实现完整的保留/移除逻辑
4. **RiffDataSource** - 修复 `lastReview` 类型问题
5. **SchedulerRouter 传递** - 修复 SchedulerRouter 未传递问题（本次修复）

## 相关文件

- `siyuan-plugin-fsrs/src/core/queue/datasource/RiffDataSource.ts` - 修复位置
- `siyuan-plugin-fsrs/src/core/queue/composite/BaseCompositeQueue.ts` - 基础队列类
- `siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts` - 提取练习队列
- `siyuan-plugin-fsrs/src/core/queue/strategies/IncrementalLearningQueue.ts` - 渐进学习队列
- `siyuan-plugin-fsrs/src/services/ReviewDialogManager.ts` - 对话框管理器
- `siyuan-plugin-fsrs/src/ui/review/v2/providers/RetrievalPracticeProvider.ts` - Provider
- `siyuan-plugin-fsrs/src/index.ts` - 插件入口

## 相关文档

- `FIX_CARD_REMOVAL_LOGIC.md` - 卡片移除逻辑修复总览
- `FIX_INCREMENTAL_LEARNING_NEW_CARD.md` - 渐进学习队列完整修复
- `.kiro/specs/fix-incremental-learning-new-card-issues/` - 修复规格文档
- `DEBUG_CARD_REMOVAL.md` - 调试指南

## 修复日期

2026-02-01
