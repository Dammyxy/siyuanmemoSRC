# 队列排序功能实现总结

## 概述

实现了一个统一的队列排序功能，支持所有队列类型（动态和静态）的排序操作。

## 设计理念

### 动态队列 vs 静态队列

**动态队列**（检索练习、渐进学习、过滤组）：
- 自动获取到期卡片，顺序由算法决定（到期日期、优先级等）
- 支持**临时排序覆盖**：用户可以在浏览器中排序，影响复习顺序
- 排序存储在**内存中**，不持久化
- 当队列刷新（重新获取卡片）时，恢复默认排序

**静态队列**（最终训练、神经漫游）：
- 仅包含手动管理的卡片
- 支持**持久化排序**：用户排序后永久改变队列顺序
- 排序存储在 **localStorage** 中，应用重启后保持

## 核心实现

### 1. IReviewQueue 接口

```typescript
export interface IReviewQueue {
    // ... 其他方法
    
    /**
     * 重新排序队列
     * 
     * @param orderedCards 按新顺序排列的卡片数组
     * @returns true 表示重排序成功
     */
    reorder(orderedCards: FSRSCard[]): Promise<boolean>;
    
    /**
     * 清除自定义排序
     * 
     * 恢复到默认排序
     */
    clearCustomOrder(): void;
}
```

### 2. BaseReviewQueue 基类

提供默认的排序实现：

```typescript
export abstract class BaseReviewQueue implements IReviewQueue {
    // 自定义排序顺序（卡片 ID 数组）
    protected customOrder: string[] | null = null;
    
    /**
     * 默认 reorder 实现：存储在内存中
     */
    public async reorder(orderedCards: FSRSCard[]): Promise<boolean> {
        this.customOrder = orderedCards.map(card => card.id);
        return true;
    }
    
    /**
     * 清除自定义排序
     */
    public clearCustomOrder(): void {
        this.customOrder = null;
    }
    
    /**
     * 应用自定义排序到卡片数组
     */
    protected applyCustomOrder(cards: FSRSCard[]): FSRSCard[] {
        if (!this.customOrder) return cards;
        
        // 按照 customOrder 重新排列卡片
        // ...
    }
}
```

### 3. 动态队列实现

**RetrievalPracticeQueue** 示例：

```typescript
public async getCards(): Promise<FSRSCard[]> {
    // 1. 获取到期卡片
    const dueCards = await this.manager.getCards({
        cardType: 'item',
        dueDate: { lte: new Date(now) }
    });
    
    // 2. 获取手动添加的卡片
    const manualCards = await this.getManuallyAddedCards();
    
    // 3. 合并并去重
    const allCards = this.mergeAndDeduplicate(dueCards, manualCards);
    
    // 4. 按默认规则排序（到期日期、优先级）
    const sortedCards = this.sortByDueDateAndPriority(allCards);
    
    // 5. 应用自定义排序（如果存在）
    return this.applyCustomOrder(sortedCards);
}
```

### 4. 静态队列实现

**FinalDrillQueue** 示例：

```typescript
public async reorder(orderedCards: FSRSCard[]): Promise<boolean> {
    // 创建新的 Map 以保持顺序
    const newEntries = new Map<string, FinalDrillEntry>();
    
    // 按照 orderedCards 的顺序重新添加条目
    for (const card of orderedCards) {
        const entry = this.entries.get(card.id);
        if (entry) {
            newEntries.set(card.id, entry);
        }
    }
    
    // 更新 entries
    this.entries = newEntries;
    
    // 持久化新顺序到 localStorage
    await this.persistEntries();
    
    return true;
}
```

### 5. 浏览器集成

**useSorting.ts** 自动检测队列类型：

```typescript
async function handleApplySortToQueue() {
    const queue = getQueueById(queueId);
    
    // 获取浏览器中显示的卡片顺序
    const orderedCards = getDisplayedCards();
    
    // 检查是否为新队列系统
    if (typeof queue.getType === 'function') {
        // 新队列系统：直接传递 FSRSCard[]
        await queue.reorder(orderedCards);
    } else {
        // 旧队列系统：转换为 QueueItem 格式
        const queueItems = convertToQueueItems(orderedCards);
        await queue.reorder(queueItems);
    }
}
```

**SRSBrowser.vue** 优先使用新队列系统：

```typescript
function getQueueById(id: string) {
    // 优先从 UnifiedDataSourceManager 获取队列实例
    if (browserAdapter.value) {
        const queue = manager.getQueue(queueType);
        if (queue) return queue;
    }
    
    // 降级到旧队列系统
    return legacyQueue;
}
```

## 使用流程

### 用户操作流程

1. 用户在浏览器中对队列卡片进行排序（点击列头或右键菜单）
2. 点击"应用排序到队列"按钮
3. 系统调用队列的 `reorder()` 方法
4. 队列更新内部顺序（动态队列：内存，静态队列：持久化）
5. 复习界面自动使用新顺序

### 排序生命周期

**动态队列**：
- 排序后：`customOrder` 存储在内存中
- 复习时：按 `customOrder` 顺序展示卡片
- 刷新后：`customOrder` 清空，恢复默认排序

**静态队列**：
- 排序后：顺序持久化到 localStorage
- 复习时：按持久化顺序展示卡片
- 刷新后：保持持久化顺序

## 测试覆盖

### 测试用例

1. **动态队列排序**
   - ✅ RetrievalPracticeQueue 支持排序
   - ✅ IncrementalLearningQueue 支持排序
   - ✅ FilterGroupQueue 支持排序
   - ✅ 自定义排序影响 getCards() 返回顺序
   - ✅ clearCustomOrder 恢复默认排序

2. **静态队列排序**
   - ✅ FinalDrillQueue 支持排序
   - ✅ NeuralRoamQueue 支持排序

3. **持久化**
   - ✅ FinalDrillQueue 排序跨重启保持

### 测试结果

```
✓ src/queues/__tests__/QueueReorder.test.ts (8 tests)
  ✓ Queue Reorder Functionality (8)
    ✓ Dynamic Queues (5)
      ✓ RetrievalPracticeQueue should support reorder
      ✓ IncrementalLearningQueue should support reorder
      ✓ FilterGroupQueue should support reorder
      ✓ RetrievalPracticeQueue custom order should affect getCards()
      ✓ clearCustomOrder should restore default sorting
    ✓ Static Queues (2)
      ✓ FinalDrillQueue should support reorder
      ✓ NeuralRoamQueue should support reorder
    ✓ Reorder Persistence (1)
      ✓ FinalDrillQueue reorder should persist across restarts

Test Files  1 passed (1)
     Tests  8 passed (8)
```

## 优势

1. **统一接口**：所有队列都有 `reorder()` 方法，不需要特殊处理
2. **灵活性**：动态队列支持临时排序，静态队列支持持久化排序
3. **类型安全**：使用 TypeScript 接口确保编译时检查
4. **向后兼容**：同时支持新旧队列系统
5. **可扩展**：未来添加新队列类型时，自动继承排序功能
6. **用户友好**：排序操作简单直观，符合用户预期

## 未来改进

1. **排序策略**：支持多种排序策略（按到期日期、优先级、难度等）
2. **排序历史**：记录排序历史，支持撤销/重做
3. **批量操作**：支持批量应用排序到多个队列
4. **排序模板**：保存常用排序模板，快速应用

## 相关文件

- `src/types/unified-data-source.ts` - IReviewQueue 接口定义
- `src/queues/BaseReviewQueue.ts` - 基类实现
- `src/queues/RetrievalPracticeQueue.ts` - 动态队列示例
- `src/queues/FinalDrillQueue.ts` - 静态队列示例
- `src/queues/NeuralRoamQueue.ts` - 静态队列示例
- `src/ui/browser/composables/useSorting.ts` - 浏览器排序逻辑
- `src/ui/browser/SRSBrowser.vue` - 浏览器集成
- `src/queues/__tests__/QueueReorder.test.ts` - 测试用例
