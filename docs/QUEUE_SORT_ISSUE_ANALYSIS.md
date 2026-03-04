# 队列排序不同步问题分析

## ✅ 问题已解决

**修改时间**: 2026-02-05

**解决方案**: 将复习界面迁移到统一数据源架构，使用 `createUnifiedReviewDialog()` 函数。

**修改文件**:
- `src/services/ReviewDialogManager.ts` - 修改 `openRetrievalPractice()` 方法使用统一数据源

**测试验证**:
- ✅ `src/queues/__tests__/QueueReorder.test.ts` - 8个测试全部通过
- ✅ `src/services/__tests__/ReviewDialogManager.UnifiedDataSource.test.ts` - 4个测试全部通过

**现在的行为**:
- 浏览器和复习界面共享同一个 `RetrievalPracticeQueue` 实例
- 在浏览器中应用的排序会立即同步到复习界面
- 复习界面显示的卡片顺序与浏览器中的顺序一致

---

## 问题描述

用户在浏览器中应用排序后，每次打开复习界面看到的卡片顺序都不一样，排序没有生效。

## 根本原因

通过分析日志发现，**浏览器和复习界面使用了完全不同的队列系统**：

### 浏览器使用的队列系统（新系统）

```
[SRSBrowser] Using UnifiedDataSourceManager for queue: retrieval
[SRSBrowserAdapter] Initializing queue view: retrieval-practice
[retrieval-practice] Reordering 6 cards
[retrieval-practice] Reorder completed successfully (in-memory)
```

- 使用 `UnifiedDataSourceManager.getQueue(QueueType.RetrievalPractice)`
- 排序应用到 `RetrievalPracticeQueue` 实例
- 排序存储在 `customOrder` 属性中

### 复习界面使用的队列系统（旧系统）

```
[ProviderBackedQueueStrategy] Loading cards from provider: retrieval
[RetrievalPracticeProvider] getDueCards START
[RetrievalHybridDataSource] getAll result: {riffCount: 5, dueLocalCount: 4, totalDue: 9}
[SortedSequencer] Inserted item at index 0 {cardID: '20230606070034-y8im2xp'...}
```

- 使用 `ProviderBackedQueueStrategy` + `RetrievalPracticeProvider`
- 使用 `SortedSequencer` 进行排序（基于到期时间和优先级）
- **完全不知道浏览器中的自定义排序**

## 问题示意图

```
浏览器                                复习界面
  ↓                                     ↓
UnifiedDataSourceManager          ProviderBackedQueueStrategy
  ↓                                     ↓
RetrievalPracticeQueue           RetrievalPracticeProvider
  ↓                                     ↓
customOrder: [card-3, card-2, card-1]  SortedSequencer (按到期时间排序)
  ↓                                     ↓
显示: card-3, card-2, card-1         显示: card-1, card-2, card-3 (随机)
```

**它们是两个完全独立的队列实例！**

## 为什么每次打开复习界面卡片顺序都不一样？

因为 `SortedSequencer` 使用的排序逻辑是：

1. 按到期时间排序（毫秒级精度）
2. 如果到期时间相同，按插入顺序排序

由于卡片的到期时间非常接近（都是"今天到期"），而插入顺序每次可能不同（取决于数据源返回顺序），所以每次打开复习界面看到的顺序都不一样。

## 解决方案

### 方案 1：迁移复习界面到新队列系统（推荐）

修改插件代码，让复习界面使用 `createUnifiedReviewDialog()` 函数：

```typescript
// 旧代码（需要替换）
// 使用 ProviderBackedQueueStrategy

// 新代码
import { createUnifiedReviewDialog } from '@/strategies/createUnifiedReviewDialog';
import { QueueType } from '@/types/unified-data-source';

// 创建复习对话框
const dialog = createUnifiedReviewDialog({
    plugin: this,
    queueType: QueueType.RetrievalPractice,
    title: '提取练习',
    onClose: () => {
        this.reviewDialog = null;
    }
});
```

**优点**：
- ✅ 浏览器和复习界面共享同一个队列实例
- ✅ 排序自动同步
- ✅ 使用统一的数据源架构
- ✅ 代码更简洁

**缺点**：
- ⚠️ 需要修改插件主代码
- ⚠️ 需要测试确保功能正常

### 方案 2：让旧队列系统支持自定义排序（不推荐）

修改 `ProviderBackedQueueStrategy` 和 `SortedSequencer`，让它们也能读取 `UnifiedDataSourceManager` 的排序设置。

**优点**：
- ✅ 不需要大规模重构

**缺点**：
- ❌ 增加代码复杂度
- ❌ 维护两套队列系统
- ❌ 违反统一数据源架构的设计原则

## 推荐实施步骤

### 第一步：找到复习对话框的创建位置

搜索插件代码中创建复习对话框的位置，通常在：
- `src/index.ts` 的 `onload()` 方法中
- 或者某个菜单点击事件处理函数中

关键字：
- `openReviewDialog`
- `ProviderBackedQueueStrategy`
- `RetrievalPracticeProvider`
- `createVueDialog` + `ReviewView`

### 第二步：替换为 createUnifiedReviewDialog

```typescript
// 导入新函数
import { createUnifiedReviewDialog } from '@/strategies/createUnifiedReviewDialog';
import { QueueType } from '@/types/unified-data-source';

// 替换旧的对话框创建代码
this.openReviewDialog = () => {
    if (this.reviewDialog) {
        return; // 已经打开
    }
    
    this.reviewDialog = createUnifiedReviewDialog({
        plugin: this,
        queueType: QueueType.RetrievalPractice,
        title: this.i18n.retrievalPractice || '提取练习',
        onClose: () => {
            this.reviewDialog = null;
        }
    });
};
```

### 第三步：测试验证

1. **测试浏览器排序**：
   - 打开浏览器，选择检索练习队列
   - 应用自定义排序
   - 验证浏览器中的卡片顺序

2. **测试复习界面同步**：
   - 打开复习界面
   - 验证第一张卡片是否与浏览器中的第一张卡片相同
   - 多次打开复习界面，验证顺序是否一致

3. **测试复习功能**：
   - 对卡片进行评分
   - 验证评分后的行为是否正常
   - 验证队列统计是否正确

### 第四步：清理旧代码（可选）

如果所有队列都迁移到新系统，可以考虑删除旧的队列系统代码：
- `ProviderBackedQueueStrategy`
- `RetrievalPracticeProvider`
- `SortedSequencer`（如果不再使用）

## 临时解决方案

如果暂时无法修改插件代码，可以告诉用户：

1. **浏览器的排序功能目前只影响浏览器显示**
   - 排序后可以在浏览器中查看卡片
   - 但不会影响复习界面的顺序

2. **复习界面的顺序由系统自动决定**
   - 按到期时间和优先级排序
   - 如果需要特定顺序，可以调整卡片的优先级

3. **等待插件更新**
   - 插件将在未来版本中统一队列系统
   - 届时排序功能将在所有界面中生效

## 总结

问题的根源是浏览器和复习界面使用了不同的队列系统。要解决这个问题，需要将复习界面迁移到使用 `createUnifiedReviewDialog()` 函数，这样就能共享同一个队列实例，排序自然就能同步了。

我已经实现了队列排序同步的基础设施（观察者模式、缓存失效机制），现在只需要让复习界面使用新的队列系统即可。
