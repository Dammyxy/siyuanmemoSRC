# 架构迁移指南

## 概述

本项目正在从旧的 Provider 架构迁移到新的统一数据源架构。

## 旧架构 vs 新架构

### 旧架构（已废弃）

```
ReviewView → ProviderBackedQueueStrategy → Provider → Queue (旧)
```

**废弃的文件：**
- `src/core/extensions/QueueProvider.ts` - Provider 接口
- `src/core/extensions/ProviderBackedQueueStrategy.ts` - Provider 适配器
- `src/core/extensions/providers/FSRSRetrievalProvider.ts` - 提取练习 Provider
- `src/ui/review/v2/providers/RetrievalPracticeProvider.ts` - 提取练习 Provider
- `src/ui/review/v2/providers/FinalDrillProvider.ts` - 最终冲刺 Provider
- `src/ui/review/v2/providers/IncrementalLearningProvider.ts` - 渐进学习 Provider
- `src/core/queue/strategies/RetrievalPracticeQueue.ts` - 旧队列实现

### 新架构（推荐）

```
ReviewView → UnifiedDataSourceManager → BaseReviewQueue
```

**新架构文件：**
- `src/managers/UnifiedDataSourceManager.ts` - 统一数据源管理器
- `src/queues/BaseReviewQueue.ts` - 队列基类
- `src/queues/RetrievalPracticeQueue.ts` - 提取练习队列
- `src/queues/FinalDrillQueue.ts` - 最终冲刺队列
- `src/queues/IncrementalLearningQueue.ts` - 渐进学习队列
- `src/queues/NeuralRoamQueue.ts` - 神经漫游队列

## 迁移步骤

### 1. 获取队列实例

**旧方式（废弃）：**
```typescript
const provider = await RetrievalPracticeProvider.create({
  storage: plugin.storage,
  scheduler: plugin.scheduler,
});
```

**新方式（推荐）：**
```typescript
const queue = plugin.unifiedDataSourceManager.getQueue(QueueType.RetrievalPractice);
```

### 2. 获取卡片

**旧方式：**
```typescript
const cards = await provider.getDueCards();
```

**新方式：**
```typescript
const cards = await queue.getAllCards();
```

### 3. 处理复习

**旧方式：**
```typescript
await provider.reviewCard(cardId, rating);
```

**新方式：**
```typescript
await queue.handleReview(cardId, rating);
```

### 4. 跳过卡片

**旧方式：**
```typescript
await provider.skipReviewCard(cardId);
```

**新方式：**
```typescript
await queue.skip(cardId);
```

### 5. 获取统计

**旧方式：**
```typescript
const stats = await provider.getStats();
// 返回: { total, due, new, reviewed, learning }
```

**新方式：**
```typescript
const stats = await queue.getStats();
// 返回: { total, due, new, learning, reviewed }
```

## 实际迁移示例

### TAB 模式恢复（已迁移）

**位置：** `src/index.ts` 的 Tab `init()` 方法

**旧代码：**
```typescript
provider = new RetrievalPracticeProvider({
  storage: plugin.storage,
  scheduler: plugin.scheduler,
});
```

**新代码：**
```typescript
const queue = plugin.unifiedDataSourceManager?.getQueue(QueueType.RetrievalPractice);
if (queue) {
  provider = {
    id: 'retrieval',
    displayName: plugin.i18n?.retrievalPractice || '提取练习',
    getDueCards: () => queue.getAllCards(),
    reviewCard: (cardId: string, rating: number) => queue.handleReview(cardId, rating),
    skipReviewCard: (cardId: string) => queue.skip(cardId),
    getStats: () => queue.getStats(),
  };
}
```

### 对话框模式（已迁移）

**位置：** `src/services/ReviewDialogManager.ts`

使用 `createUnifiedReviewDialog` 工厂函数：

```typescript
this.reviewDialog = createUnifiedReviewDialog({
  plugin: this.deps.plugin,
  queueType: QueueType.RetrievalPractice,
  title: this.deps.i18n?.retrievalPractice || '提取练习',
  onClose: () => {
    this.reviewDialog = null;
  }
});
```

## 队列类型

```typescript
enum QueueType {
  RetrievalPractice = 'retrieval-practice',
  FinalDrill = 'final-drill',
  IncrementalLearning = 'incremental-learning',
  NeuralRoam = 'neural-roam',
  FilterGroup = 'filter-group',
}
```

## 注意事项

1. **不要使用废弃的 Provider 层** - 直接使用 `UnifiedDataSourceManager.getQueue()`
2. **统一接口** - 所有队列都继承自 `BaseReviewQueue`，有统一的方法
3. **类型安全** - 新架构使用 TypeScript 类型系统确保类型安全
4. **单例模式** - `UnifiedDataSourceManager` 是单例，确保队列实例唯一

## 待迁移的代码

目前所有主要功能已迁移到新架构：
- ✅ 对话框模式
- ✅ TAB 模式
- ✅ 浏览器模式

旧 Provider 文件保留仅用于向后兼容，已标记为 `@deprecated`。

## 参考文档

- [统一数据源架构](./src/core/queue/datasource/README.md)
- [队列系统文档](./docs/xiuyuan-queue-integration.md)
- [多工作区支持](./MULTI_WORKSPACE_SUPPORT.md)
