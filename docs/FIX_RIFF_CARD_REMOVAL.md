# 修复：Riff 卡片移除逻辑

## 问题描述

Riff 卡片（没有 `state` 字段）评分 1-2 后被错误地移除。

## 日志证据

```
[RetrievalPracticeQueue] Storage lookup: {
  cardID: '20231121195959-n30kcj9',
  found: false,  // ← Riff 卡片，Storage 中没有
  cardState: undefined
}

[RetrievalPracticeQueue] No local card, using Riff API

[RetrievalPracticeQueue] Returning original card (no update): {
  cardID: '20231121195959-n30kcj9',
  hasState: false,  // ← 没有 state 字段
  state: undefined
}

[BaseCompositeQueue] _shouldRemoveFromQueue: no state field, removing  // ← 错误！
```

## 根本原因

`BaseCompositeQueue._shouldRemoveFromQueue()` 对没有 `state` 字段的卡片默认移除，但这对 Riff 卡片是错误的：

1. **Riff 卡片**没有 `state` 字段（由 Riff API 管理状态）
2. 评分 1-2 后，卡片应该保留（继续学习）
3. 评分 3-4 后，卡片应该移除（已掌握）

## 修复方案

修改 `_shouldRemoveFromQueue()` 逻辑，对没有 `state` 字段的卡片根据评分决定：

```typescript
// 🆕 如果卡片没有 state 字段（Riff 卡片），根据评分决定
if (!('state' in item)) {
  const shouldRemove = rating >= 3;
  console.log('[BaseCompositeQueue] _shouldRemoveFromQueue: no state field (Riff card)', {
    cardID: item.cardID,
    rating,
    shouldRemove,
  });
  return shouldRemove;  // Good/Easy → 移除，Again/Hard → 保留
}
```

## 卡片类型对比

### 本地卡片（有 state 字段）

- 由 SchedulerRouter 管理状态
- 有完整的 FSRS 状态（New, Learning, Review, Relearning）
- 根据状态和评分决定是否移除

### Riff 卡片（没有 state 字段）

- 由 Riff API 管理状态
- 没有 `state` 字段
- 根据评分决定是否移除：
  - rating >= 3 → 移除（已掌握）
  - rating < 3 → 保留（继续学习）

## 为什么 Riff 卡片没有 state 字段？

1. **Riff 卡片来自 Riff API**，不是本地存储
2. **Storage 中找不到**（`found: false`）
3. **调度器降级到 Riff API**，没有更新卡片状态
4. **返回原始卡片**，没有 `state` 字段

## 修复后的行为

### 评分 1-2（Again/Hard）

```
[BaseCompositeQueue] _shouldRemoveFromQueue: no state field (Riff card) {
  cardID: '...',
  rating: 1,
  shouldRemove: false  // ✅ 保留
}
```

- 卡片保留在队列中
- Riff API 更新 `due` 时间
- 下次加载队列时，卡片可能不出现（如果不到期）

### 评分 3-4（Good/Easy）

```
[BaseCompositeQueue] _shouldRemoveFromQueue: no state field (Riff card) {
  cardID: '...',
  rating: 3,
  shouldRemove: true  // ✅ 移除
}
```

- 卡片从队列中移除
- 调用 `removeRiffCards()` 从 Riff 中删除
- 卡片不再出现在队列中

## 测试步骤

1. 重新编译：`npm run build`
2. 重新加载插件
3. 打开提取练习队列
4. 找一张 Riff 卡片（Storage 中没有的）
5. 评分 1（Again）
6. 观察控制台日志

### 预期日志

```
[RetrievalPracticeQueue] Storage lookup: {found: false}
[RetrievalPracticeQueue] No local card, using Riff API
[RetrievalPracticeQueue] Returning original card (no update): {hasState: false}
[BaseCompositeQueue] _shouldRemoveFromQueue: no state field (Riff card) {
  rating: 1,
  shouldRemove: false  // ✅ 保留
}
```

## 相关修复

这是卡片移除逻辑修复的一部分：

1. **BaseCompositeQueue** - 添加 `_shouldRemoveFromQueue()` 方法
2. **RetrievalPracticeQueue** - 调度器返回更新后的卡片状态
3. **IncrementalLearningQueue** - 实现完整的保留/移除逻辑
4. **RiffDataSource** - 修复 `lastReview` 类型问题
5. **SchedulerRouter 传递** - 修复 SchedulerRouter 未传递问题
6. **Riff 卡片移除逻辑** - 修复 Riff 卡片移除逻辑（本次修复）

## 相关文件

- `siyuan-plugin-fsrs/src/core/queue/composite/BaseCompositeQueue.ts` - 修复位置

## 相关文档

- `FIX_CARD_REMOVAL_LOGIC.md` - 卡片移除逻辑修复总览
- `FIX_SCHEDULER_ROUTER_PASSING.md` - SchedulerRouter 传递修复
- `DEBUG_CARD_REMOVAL.md` - 调试指南

## 修复日期

2026-02-01
