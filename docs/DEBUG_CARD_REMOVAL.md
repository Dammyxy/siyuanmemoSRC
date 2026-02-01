# 调试：卡片移除逻辑

## 问题描述

提取练习队列和渐进学习队列在评分 1 后，卡片被移除而不是保留。

## 调试步骤

### 1. 重新编译插件

```bash
cd siyuan-plugin-fsrs
npm run build
```

### 2. 重新加载插件

在思源笔记中：
1. 打开设置 → 集市 → 已下载
2. 找到 FSRS 插件
3. 点击"重新加载"

### 3. 打开控制台

按 `F12` 或 `Ctrl+Shift+I` 打开开发者工具。

### 4. 测试提取练习队列

1. 打开提取练习队列
2. 评分 1（Again）
3. 观察控制台日志

### 预期日志输出

#### 调度器日志

```
[RetrievalPracticeQueue] Scheduler called: {
  cardID: '...',
  grade: 1,
  hasRouter: true,
  hasStorage: true
}

[RetrievalPracticeQueue] Storage lookup: {
  cardID: '...',
  found: true,
  cardState: 0  // 或其他状态
}

[RetrievalPracticeQueue] ✅ Used SchedulerRouter: {
  cardID: '...',
  cardType: 'item',
  schedulerType: 'fsrs',
  state: 1,  // Learning 状态
  oldState: 0  // New 状态
}

[RetrievalPracticeQueue] Returning updated card: {
  cardID: '...',
  state: 1,
  hasState: true
}
```

#### 移除判断日志

```
[BaseCompositeQueue] _shouldRemoveFromQueue: keeping card (New/Learning/Relearning) {
  cardID: '...',
  state: 1,  // Learning 状态
  rating: 1
}
```

### 可能的问题场景

#### 场景 1：没有 state 字段

```
[BaseCompositeQueue] _shouldRemoveFromQueue: no state field, removing {
  cardID: '...',
  hasState: false,
  itemKeys: ['cardID', 'blockID', 'deckID', ...]
}
```

**原因**：调度器没有返回更新后的卡片状态。

**解决方案**：检查调度器是否正确返回了 `state` 字段。

#### 场景 2：没有使用 SchedulerRouter

```
[RetrievalPracticeQueue] No router/storage, using Riff API

[RetrievalPracticeQueue] Returning original card (no update): {
  cardID: '...',
  hasState: false,
  state: undefined
}
```

**原因**：SchedulerRouter 或 Storage 未初始化。

**解决方案**：检查插件初始化代码，确保 SchedulerRouter 和 Storage 正确传递给队列。

#### 场景 3：Storage 中没有卡片

```
[RetrievalPracticeQueue] Storage lookup: {
  cardID: '...',
  found: false,
  cardState: undefined
}

[RetrievalPracticeQueue] No local card, using Riff API
```

**原因**：卡片未保存到本地存储。

**解决方案**：检查卡片是否正确保存到 Storage。

## 测试用例

### 测试 1：新卡片评分 1

1. 创建一个新卡片（state = 0）
2. 添加到提取练习队列
3. 评分 1（Again）
4. **预期**：卡片保留在队列中，state 变为 1（Learning）

### 测试 2：学习中卡片评分 1

1. 使用一个学习中的卡片（state = 1）
2. 评分 1（Again）
3. **预期**：卡片保留在队列中，state 仍为 1（Learning）

### 测试 3：复习卡片评分 1

1. 使用一个复习卡片（state = 2）
2. 评分 1（Again）
3. **预期**：卡片保留在队列中，state 变为 3（Relearning）

### 测试 4：复习卡片评分 3

1. 使用一个复习卡片（state = 2）
2. 评分 3（Good）
3. **预期**：卡片从队列中移除

## 相关文件

- `siyuan-plugin-fsrs/src/core/queue/composite/BaseCompositeQueue.ts` - 移除判断逻辑
- `siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts` - 调度器实现
- `siyuan-plugin-fsrs/src/core/queue/strategies/IncrementalLearningQueue.ts` - 渐进学习队列

## 相关文档

- `FIX_CARD_REMOVAL_LOGIC.md` - 修复总览
- `FIX_INCREMENTAL_LEARNING_NEW_CARD.md` - 渐进学习队列修复
- `FIX_RIFF_DATASOURCE_LASTREVIW_TYPE.md` - RiffDataSource 类型修复
