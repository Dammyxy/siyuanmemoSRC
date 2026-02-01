# 修复：SchedulerRouter 未传递给 RetrievalPracticeQueue

## 问题描述

提取练习队列评分后，卡片状态没有更新，导致：
1. 新卡片（state: 0）评分 1 后，状态没有变成 Learning（state: 1）
2. 卡片被错误地移除或保留

## 根本原因

`RetrievalPracticeQueue` 没有收到 `SchedulerRouter`，无法使用路由器更新卡片状态。

### 日志证据

```
[RetrievalPracticeQueue] Scheduler called: {
  cardID: '20260201012222-79tmwat',
  grade: 1,
  hasRouter: false,  // ← 问题！
  hasStorage: true
}

[RetrievalPracticeQueue] No router/storage, using Riff API
[RetrievalPracticeQueue] Returning original card (no update): {
  cardID: '20260201012222-79tmwat',
  hasState: true,
  state: 3  // 状态没有更新
}
```

## 传递链路分析

```
index.ts (Plugin)
  ↓ this.schedulerRouter
ReviewDialogManager
  ↓ deps.schedulerRouter (❌ 缺失)
RetrievalPracticeProvider
  ↓ options.schedulerRouter (❌ 缺失)
RetrievalPracticeQueue
  ↓ options.schedulerRouter (❌ 缺失)
RiffScheduler
```

## 修复方案

### 1. ReviewDialogManagerDeps 接口

**文件**: `src/services/ReviewDialogManager.ts`

```typescript
export interface ReviewDialogManagerDeps {
  app: App;
  i18n: Record<string, string>;
  storage: StorageManager;
  scheduler: SchedulerEngineAdapter;
  schedulerRouter?: any;  // 🆕 添加 SchedulerRouter
  finalDrillQueue: FinalDrillQueue;
  filterGroupQueue: FilterGroupQueue;
  incrementalQueue: IncrementalLearningQueue;
  isInitialized: () => boolean;
}
```

### 2. ReviewDialogManager.openRetrievalPractice()

**文件**: `src/services/ReviewDialogManager.ts`

```typescript
async openRetrievalPractice(): Promise<void> {
  // ...
  const provider = new RetrievalPracticeProvider({ 
    storage: this.deps.storage, 
    scheduler: this.deps.scheduler,
    schedulerRouter: this.deps.schedulerRouter,  // 🆕 传递 SchedulerRouter
  });
  // ...
}
```

### 3. RetrievalPracticeProvider 构造函数

**文件**: `src/ui/review/v2/providers/RetrievalPracticeProvider.ts`

```typescript
constructor(options?: {
  deckId?: string;
  storage?: StorageManager;
  scheduler?: SchedulerEngineAdapter;
  schedulerRouter?: any;  // 🆕 添加 SchedulerRouter 参数
}) {
  this.deckId = options?.deckId || '';
  this.storage = options?.storage;
  this.queue = new RetrievalPracticeQueue({
    deckID: options?.deckId,
    storage: options?.storage,
    localScheduler: options?.scheduler,
    schedulerRouter: options?.schedulerRouter,  // 🆕 传递 SchedulerRouter
  });
}
```

### 4. index.ts 初始化

**文件**: `src/index.ts`

```typescript
this.reviewDialogManager = new ReviewDialogManager({
  app: this.app,
  i18n: this.i18n || {},
  storage: this.storage,
  scheduler: this.scheduler,
  schedulerRouter: this.schedulerRouter,  // 🆕 传递 SchedulerRouter
  finalDrillQueue: this.finalDrillQueue,
  filterGroupQueue: this.subsetQueue,
  incrementalQueue: this.incrementalQueue,
  isInitialized: () => this.isInitialized,
});
```

## 修复后的传递链路

```
index.ts (Plugin)
  ↓ this.schedulerRouter
ReviewDialogManager
  ↓ deps.schedulerRouter ✅
RetrievalPracticeProvider
  ↓ options.schedulerRouter ✅
RetrievalPracticeQueue
  ↓ options.schedulerRouter ✅
RiffScheduler
```

## 预期日志

修复后，应该看到：

```
[RetrievalPracticeQueue] Scheduler called: {
  cardID: '...',
  grade: 1,
  hasRouter: true,  // ✅ 修复！
  hasStorage: true
}

[RetrievalPracticeQueue] Storage lookup: {
  cardID: '...',
  found: true,
  cardState: 0  // New 状态
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
  state: 1,  // ✅ 状态已更新
  hasState: true
}

[BaseCompositeQueue] _shouldRemoveFromQueue: keeping card (New/Learning/Relearning) {
  cardID: '...',
  state: 1,  // Learning 状态
  rating: 1
}
```

## 测试步骤

1. 重新编译插件：`npm run build`
2. 重新加载插件
3. 打开提取练习队列
4. 评分 1（Again）
5. 检查控制台日志

### 预期结果

- `hasRouter: true` ✅
- `Used SchedulerRouter` ✅
- `state: 1` (Learning) ✅
- `keeping card (New/Learning/Relearning)` ✅
- 卡片保留在队列中 ✅

## 相关修复

这是卡片移除逻辑修复的关键部分：

1. **BaseCompositeQueue** - 添加 `_shouldRemoveFromQueue()` 方法
2. **RetrievalPracticeQueue** - 调度器返回更新后的卡片状态
3. **IncrementalLearningQueue** - 实现完整的保留/移除逻辑
4. **RiffDataSource** - 修复 `lastReview` 类型问题
5. **SchedulerRouter 传递** - 修复 SchedulerRouter 未传递问题（本次修复）

## 相关文件

- `siyuan-plugin-fsrs/src/index.ts` - 插件入口
- `siyuan-plugin-fsrs/src/services/ReviewDialogManager.ts` - 对话框管理器
- `siyuan-plugin-fsrs/src/ui/review/v2/providers/RetrievalPracticeProvider.ts` - Provider
- `siyuan-plugin-fsrs/src/core/queue/strategies/RetrievalPracticeQueue.ts` - 队列实现

## 相关文档

- `FIX_CARD_REMOVAL_LOGIC.md` - 卡片移除逻辑修复总览
- `FIX_RIFF_DATASOURCE_LASTREVIW_TYPE.md` - RiffDataSource 类型修复
- `DEBUG_CARD_REMOVAL.md` - 调试指南
- `.kiro/specs/fix-incremental-learning-new-card-issues/` - 修复规格文档

## 修复日期

2026-02-01
