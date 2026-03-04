# 渐进学习队列排序不一致问题

## 问题描述

用户反馈：渐进学习的复习队列排序跟浏览器里队列视图的排序不一样。

## 根本原因

项目中存在**两个不同的 IncrementalLearningQueue 实现**：

### 1. 旧实现（复习界面使用）
**位置**: `src/core/queue/strategies/IncrementalLearningQueue.ts`

**排序逻辑** (`next()` 方法):
```typescript
if (this.sortingStrategy) {
  const sorted = this.sortingStrategy.sort(allItems);
  selectedItem = sorted[0] || null;
} else {
  // 否则按优先级排序
  allItems.sort((a, b) => (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY));
  selectedItem = allItems[0];
}
```

**特点**:
- 使用 `SchedulerSortingStrategy` 进行算法排序
- 或者按优先级排序
- **不支持自定义排序（customOrder）**

### 2. 新实现（浏览器使用）
**位置**: `src/queues/IncrementalLearningQueue.ts`

**排序逻辑** (`getCards()` 方法):
```typescript
// 按到期日期和优先级排序
const sortedCards = this.sortByDueDateAndPriority(allCards);

// 应用自定义排序（如果存在）
return this.applyCustomOrder(sortedCards);
```

**特点**:
- 继承自 `BaseReviewQueue`
- 支持 `customOrder`（用户拖拽排序）
- 使用统一数据源架构

## 问题示意图

```
浏览器队列视图                    复习界面
      ↓                              ↓
UnifiedDataSourceManager      旧的 IncrementalLearningQueue
      ↓                              ↓
新的 IncrementalLearningQueue  SchedulerSortingStrategy
      ↓                              ↓
getCards() + customOrder       next() + 算法排序
      ↓                              ↓
显示: [card-3, card-2, card-1]  显示: [card-1, card-2, card-3]
(用户拖拽的顺序)                (算法计算的顺序)
```

## 为什么会有两个实现？

这是架构演进的结果：

1. **旧架构** (`src/core/queue/strategies/`):
   - 基于 `IQueueStrategy` 接口
   - 使用 `ProviderBackedQueueStrategy` 模式
   - 与 Riff API 紧密耦合

2. **新架构** (`src/queues/`):
   - 基于 `IReviewQueue` 接口
   - 使用统一数据源管理器
   - 支持观察者模式和自定义排序

## 解决方案

### 方案 1：迁移复习界面到新架构（推荐）

修改复习界面使用新的队列实现：

```typescript
// 找到创建复习对话框的代码
// 通常在 src/services/ReviewDialogManager.ts 或类似文件中

// 旧代码（需要替换）
const queue = new IncrementalLearningQueue({
  deckID: this.deckID,
  storage: this.storage,
  schedulerRouter: this.schedulerRouter,
  // ...
});

// 新代码
import { createUnifiedReviewDialog } from '@/strategies/createUnifiedReviewDialog';
import { QueueType } from '@/types/unified-data-source';

const dialog = createUnifiedReviewDialog({
  plugin: this,
  queueType: QueueType.IncrementalLearning,
  title: '渐进学习',
  onClose: () => {
    // 清理逻辑
  }
});
```

**优点**:
- ✅ 浏览器和复习界面共享同一个队列实例
- ✅ 排序自动同步
- ✅ 使用统一的数据源架构
- ✅ 支持观察者模式，数据变化自动刷新

**缺点**:
- ⚠️ 需要修改插件主代码
- ⚠️ 需要测试确保功能正常

### 方案 2：让旧实现支持 customOrder（不推荐）

修改 `src/core/queue/strategies/IncrementalLearningQueue.ts`，添加对 `customOrder` 的支持。

**优点**:
- ✅ 改动较小

**缺点**:
- ❌ 维护两套队列系统
- ❌ 增加代码复杂度
- ❌ 违反统一数据源架构的设计原则
- ❌ 浏览器和复习界面仍然是不同的队列实例

## 实施步骤

### 第一步：定位复习对话框创建位置

搜索关键字：
- `IncrementalLearningQueue` (旧实现的导入)
- `openIncrementalLearning`
- `createVueDialog` + `ReviewView`

可能的文件位置：
- `src/services/ReviewDialogManager.ts`
- `src/index.ts`
- `src/ui/review/` 下的某个文件

### 第二步：检查是否已有统一数据源管理器

确认插件是否已经初始化了 `UnifiedDataSourceManager`：

```typescript
// 查找类似这样的代码
this.unifiedDataSourceManager = new UnifiedDataSourceManager({
  plugin: this,
  // ...
});
```

如果没有，需要先初始化。

### 第三步：替换为统一复习对话框

```typescript
import { createUnifiedReviewDialog } from '@/strategies/createUnifiedReviewDialog';
import { QueueType } from '@/types/unified-data-source';

// 替换旧的对话框创建代码
this.openIncrementalLearning = () => {
  if (this.incrementalLearningDialog) {
    return; // 已经打开
  }
  
  this.incrementalLearningDialog = createUnifiedReviewDialog({
    plugin: this,
    queueType: QueueType.IncrementalLearning,
    title: this.i18n.incrementalLearning || '渐进学习',
    onClose: () => {
      this.incrementalLearningDialog = null;
    }
  });
};
```

### 第四步：测试验证

1. **测试浏览器排序**:
   - 打开浏览器，选择渐进学习队列
   - 拖拽卡片改变顺序
   - 验证浏览器中的卡片顺序

2. **测试复习界面同步**:
   - 打开渐进学习复习界面
   - 验证第一张卡片是否与浏览器中的第一张卡片相同
   - 多次打开复习界面，验证顺序是否一致

3. **测试复习功能**:
   - 对卡片进行评分（1-4）
   - 验证评分后的行为是否正常
   - 验证队列统计是否正确

## 临时解决方案

如果暂时无法修改代码，告诉用户：

1. **浏览器的排序功能目前只影响浏览器显示**
   - 排序后可以在浏览器中查看卡片
   - 但不会影响复习界面的顺序

2. **复习界面的顺序由算法自动决定**
   - 按调度算法排序（如果有 `sortingStrategy`）
   - 或按优先级排序
   - 如果需要特定顺序，可以调整卡片的优先级

3. **等待插件更新**
   - 插件将在未来版本中统一队列系统
   - 届时排序功能将在所有界面中生效

## 相关文档

- `QUEUE_SORT_ISSUE_ANALYSIS.md` - 检索练习队列的类似问题分析
- `.kiro/specs/unified-data-source-architecture/` - 统一数据源架构规范
- `src/strategies/README.md` - 统一复习对话框使用指南

## 总结

问题的根源是渐进学习队列有两个不同的实现，浏览器使用新架构（支持自定义排序），复习界面使用旧架构（不支持自定义排序）。

要解决这个问题，需要将复习界面迁移到使用 `createUnifiedReviewDialog()` 函数，这样就能共享同一个队列实例，排序自然就能同步了。

这与检索练习队列遇到的问题完全相同，解决方案也是一样的。
