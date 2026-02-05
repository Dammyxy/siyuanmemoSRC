# 统一数据源策略 (Unified Data Source Strategies)

本目录包含将统一数据源架构集成到复习界面的策略和适配器。

## 核心组件

### 1. UnifiedQueueStrategy

将 `IReviewQueue` 适配到 `IQueueStrategy` 接口，使其可以与 `useReviewSession` 无缝集成。

**功能**：
- 实现 `IQueueStrategy` 接口
- 内部使用 `UnifiedDataSourceManager` 和 `IReviewQueue`
- 自动触发观察者通知
- 提供统一的错误处理和日志记录

**工作原理**：
1. 初始化时从 `UnifiedDataSourceManager` 获取队列实例
2. 缓存卡片列表以提高性能
3. `next()` 方法返回当前批次的下一张卡片
4. `onFeedback()` 方法调用队列的 `handleReview()`，自动触发数据同步

### 2. UnifiedReviewAdapter

将 `FSRSCard` 转换为 `ReviewUIState`，用于 `useReviewSession`。

**功能**：
- 实现 `IAdapter` 接口
- 将卡片数据转换为 UI 状态
- 提供队列统计信息
- 配置 UI 按钮（评分、跳过等）

### 3. createUnifiedReviewDialog

便捷函数，用于创建使用统一数据源的复习对话框。

**功能**：
- 创建 `UnifiedQueueStrategy` 实例
- 创建 `UnifiedReviewAdapter` 实例
- 创建 Vue 对话框
- 自动集成到统一数据源架构

## 使用方法

### 方法 1：使用便捷函数（推荐）

```typescript
import { createUnifiedReviewDialog } from '@/strategies';
import { QueueType } from '@/types/unified-data-source';

// 在 ReviewService 中
async openUnifiedReviewDialog(queueType: QueueType = QueueType.RetrievalPractice) {
    this.plugin.reviewDialog = createUnifiedReviewDialog({
        plugin: this.plugin,
        queueType,
        title: '提取练习',
        onClose: () => {
            this.plugin.reviewDialog = null;
        }
    });
}
```

### 方法 2：手动创建（高级用法）

```typescript
import { UnifiedQueueStrategy, UnifiedReviewAdapter } from '@/strategies';
import { QueueType } from '@/types/unified-data-source';
import { createVueDialog } from '@/utils/dialog';
import ReviewView from '@/ui/review/v2/ReviewView.vue';

// 创建队列策略
const queue = new UnifiedQueueStrategy(QueueType.RetrievalPractice);

// 创建适配器
const adapter = new UnifiedReviewAdapter();

// 创建对话框
const dialog = createVueDialog({
    component: ReviewView,
    props: {
        app: plugin.app,
        i18n: plugin.i18n,
        queue: queue as any,
        adapter: adapter as any,
        plugin: plugin
    },
    // ... 其他配置
});
```

## 数据流

```
用户评分
    ↓
useReviewSession.grade()
    ↓
UnifiedQueueStrategy.onFeedback()
    ↓
IReviewQueue.handleReview()
    ↓
UnifiedDataSourceManager.updateCard()
    ↓
notifyObservers()
    ↓
SRSBrowserAdapter.onDataChanged()
    ↓
SRS 浏览器自动刷新 ✨
```

## 优势

### 1. 无需修改现有组件

- ✅ `useReviewSession` 保持不变
- ✅ `ReviewView.vue` 保持不变
- ✅ 向后兼容

### 2. 自动获得统一数据源的好处

- ✅ 自动数据同步（复习评分后 SRS 浏览器自动刷新）
- ✅ 统一的错误处理
- ✅ 统一的日志记录
- ✅ 观察者模式支持
- ✅ 缓存管理

### 3. 渐进式迁移

- ✅ 可以逐个队列迁移
- ✅ 旧队列和新队列可以共存
- ✅ 降低风险

## 示例：在插件中使用

```typescript
// 在 index.ts 或 PluginService.ts 中

import { createUnifiedReviewDialog, getQueueDisplayName } from '@/strategies';
import { QueueType } from '@/types/unified-data-source';

class FSRSPlugin {
    // ... 其他代码
    
    /**
     * 使用统一数据源打开复习对话框
     */
    async openUnifiedReviewDialog(queueType: QueueType = QueueType.RetrievalPractice) {
        if (!this.isInitialized) {
            await pushErrMsg('插件未初始化');
            return;
        }
        
        if (this.reviewDialog) {
            this.reviewDialog.destroy();
        }
        
        try {
            const title = getQueueDisplayName(queueType, this.i18n);
            
            this.reviewDialog = createUnifiedReviewDialog({
                plugin: this,
                queueType,
                title,
                onClose: () => {
                    this.reviewDialog = null;
                }
            });
        } catch (err) {
            console.error('Failed to open unified review dialog:', err);
            await pushErrMsg('加载失败');
        }
    }
    
    /**
     * 打开提取练习（使用统一数据源）
     */
    async openRetrievalPractice() {
        await this.openUnifiedReviewDialog(QueueType.RetrievalPractice);
    }
    
    /**
     * 打开最终训练（使用统一数据源）
     */
    async openFinalDrill() {
        await this.openUnifiedReviewDialog(QueueType.FinalDrill);
    }
}
```

## 测试

```typescript
import { UnifiedQueueStrategy } from '@/strategies';
import { QueueType } from '@/types/unified-data-source';

describe('UnifiedQueueStrategy', () => {
    it('should create strategy successfully', () => {
        const strategy = new UnifiedQueueStrategy(QueueType.RetrievalPractice);
        expect(strategy).toBeDefined();
    });
    
    it('should get next card', async () => {
        const strategy = new UnifiedQueueStrategy(QueueType.RetrievalPractice);
        const card = await strategy.next();
        expect(card).toBeDefined();
    });
    
    it('should handle feedback', async () => {
        const strategy = new UnifiedQueueStrategy(QueueType.RetrievalPractice);
        const card = await strategy.next();
        
        if (card) {
            await strategy.onFeedback(card, {
                action: 'rate',
                rating: 3
            });
        }
    });
});
```

## 注意事项

1. **类型安全**：由于 `FSRSCard` 和 `QueueItem` 的字段名不完全匹配，我们使用 `any` 类型来绕过类型检查。这是一个适配层，主要目的是功能集成。

2. **性能**：`UnifiedQueueStrategy` 会缓存卡片列表以提高性能。评分后会使缓存失效，下次 `next()` 会重新加载。

3. **并发**：如果多个地方同时使用同一个队列，需要注意并发问题。当前实现是单线程的，不支持并发访问。

4. **错误处理**：所有错误都会被捕获并记录，然后重新抛出。调用者应该处理这些错误并显示用户友好的错误消息。

## 相关文档

- [统一数据源架构规范](.kiro/specs/unified-data-source-architecture/)
- [统一数据源 UI 集成规范](.kiro/specs/unified-data-source-ui-integration/)
- [UnifiedDataSourceManager](../managers/UnifiedDataSourceManager.ts)
- [IReviewQueue](../types/unified-data-source.ts)
