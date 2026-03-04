# 渐进学习队列排序修复

## 问题描述

用户报告：在浏览器中对渐进学习队列应用排序后，排序操作成功完成，但浏览器重新加载数据后，卡片顺序没有改变。

## 问题日志分析

```
[incremental-learning] Reordering 37 cards
[incremental-learning] Reorder completed successfully (in-memory)
[SRSBrowserAdapter] Handling queue-changed event: incremental-learning
[SRSBrowser] Data changed event received: {type: 'queue-changed', queueType: 'incremental-learning'}
[SRSBrowserAdapter] Fetching rows for queue: incremental-learning
[SRSBrowserAdapter] Fetched rows successfully: {queueType: 'incremental-learning', cardCount: 37}
```

从日志可以看出：
1. ✅ 排序操作成功完成
2. ✅ 观察者事件正确触发
3. ✅ 浏览器收到事件并重新加载数据
4. ❌ **问题**：重新加载的数据没有应用自定义排序

## 根本原因

`IncrementalLearningQueue.getCards()` 和 `FilterGroupQueue.getCards()` 方法没有调用 `applyCustomOrder()` 方法来应用自定义排序。

### 代码分析

**BaseReviewQueue** 提供了以下方法：
- `reorder(orderedCards: FSRSCard[]): Promise<boolean>` - 存储自定义排序到 `this.customOrder`
- `applyCustomOrder(cards: FSRSCard[]): FSRSCard[]` - 应用自定义排序到卡片数组

**问题代码**（修复前）：

```typescript
// IncrementalLearningQueue.ts
public async getCards(): Promise<FSRSCard[]> {
    // ... 获取卡片 ...
    const sortedCards = this.sortByDueDateAndPriority(allCards);
    return sortedCards;  // ❌ 没有应用自定义排序
}

// FilterGroupQueue.ts
public async getCards(): Promise<FSRSCard[]> {
    // ... 获取卡片 ...
    const sortedCards = this.sortByDueDateAndPriority(allCards);
    return sortedCards;  // ❌ 没有应用自定义排序
}
```

**对比 RetrievalPracticeQueue**（正确实现）：

```typescript
// RetrievalPracticeQueue.ts
public async getCards(): Promise<FSRSCard[]> {
    // ... 获取卡片 ...
    const sortedCards = this.sortByDueDateAndPriority(allCards);
    return this.applyCustomOrder(sortedCards);  // ✅ 应用自定义排序
}
```

## 解决方案

### 修改 1: IncrementalLearningQueue.ts

```typescript
public async getCards(): Promise<FSRSCard[]> {
    try {
        const now = Date.now();
        
        // 获取所有到期的卡片（项目和主题）
        const dueCards = await this.manager.getCards({
            dueDate: { lte: new Date(now) }
        });
        
        // 获取手动添加的卡片
        const manualCards = await this.getManuallyAddedCards();
        
        // 合并并去重
        const allCards = this.mergeAndDeduplicate(dueCards, manualCards);
        
        // 按到期日期和优先级排序
        const sortedCards = this.sortByDueDateAndPriority(allCards);
        
        // ✅ 应用自定义排序（如果存在）
        return this.applyCustomOrder(sortedCards);
    } catch (error) {
        console.error('[IncrementalLearningQueue] Failed to get cards:', error);
        throw error;
    }
}
```

### 修改 2: FilterGroupQueue.ts

```typescript
public async getCards(): Promise<FSRSCard[]> {
    try {
        // 根据过滤条件获取卡片
        const filteredCards = await this.manager.getCards(this.filterCriteria);
        
        // 获取手动添加的卡片
        const manualCards = await this.getManuallyAddedCards();
        
        // 合并并去重
        const allCards = this.mergeAndDeduplicate(filteredCards, manualCards);
        
        // 按到期日期和优先级排序
        const sortedCards = this.sortByDueDateAndPriority(allCards);
        
        // ✅ 应用自定义排序（如果存在）
        return this.applyCustomOrder(sortedCards);
    } catch (error) {
        console.error('[FilterGroupQueue] Failed to get cards:', error);
        throw error;
    }
}
```

## 测试验证

运行测试套件验证修复：

```bash
npm test -- src/queues/__tests__/QueueReorder.test.ts --run
```

**测试结果**: ✅ 8/8 通过

- ✅ RetrievalPracticeQueue 排序
- ✅ IncrementalLearningQueue 排序
- ✅ FilterGroupQueue 排序
- ✅ 自定义排序影响 getCards() 结果
- ✅ 清除自定义排序恢复默认顺序
- ✅ FinalDrillQueue 排序（持久化）
- ✅ NeuralRoamQueue 排序（持久化）
- ✅ 排序持久化跨重启

## 预期行为（修复后）

1. **浏览器排序**
   - 用户在浏览器中点击列头排序
   - 排序操作成功完成
   - 浏览器显示排序后的卡片顺序

2. **排序同步**
   - 排序操作触发 `queue-changed` 事件
   - 浏览器收到事件并重新加载数据
   - `getCards()` 方法应用自定义排序
   - 浏览器显示与排序一致的卡片顺序

3. **复习界面同步**
   - 打开复习界面
   - 复习界面使用相同的队列实例
   - 卡片按照自定义排序顺序显示

## 相关文件

- `src/queues/IncrementalLearningQueue.ts` - 渐进学习队列实现
- `src/queues/FilterGroupQueue.ts` - 过滤组队列实现
- `src/queues/BaseReviewQueue.ts` - 队列基类（提供 applyCustomOrder 方法）
- `src/queues/__tests__/QueueReorder.test.ts` - 排序功能测试

## 总结

问题的根源是 `IncrementalLearningQueue` 和 `FilterGroupQueue` 的 `getCards()` 方法没有调用 `applyCustomOrder()` 来应用自定义排序。修复后，这两个队列的排序功能与 `RetrievalPracticeQueue` 保持一致，所有动态队列都正确支持自定义排序。

**关键要点**：
- 所有继承自 `BaseReviewQueue` 的队列都应该在 `getCards()` 方法的最后调用 `applyCustomOrder()`
- 这确保了自定义排序能够正确应用到返回的卡片数组
- 排序功能对所有动态队列（RetrievalPractice, IncrementalLearning, FilterGroup）都有效
