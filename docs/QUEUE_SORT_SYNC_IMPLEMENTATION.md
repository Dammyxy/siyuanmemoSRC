# 队列排序同步实现总结

## 问题描述

用户在浏览器中对队列进行排序后，复习界面看不到排序效果。这是因为浏览器和复习界面使用了不同的数据缓存。

## 根本原因

1. **浏览器和复习界面共享同一个队列实例**：通过 `UnifiedDataSourceManager` 的单例模式和 `QueueFactory` 的缓存机制，两者确实使用同一个队列实例。

2. **但 `UnifiedQueueStrategy` 有自己的卡片缓存**：
   - `UnifiedQueueStrategy` 在 `next()` 方法中缓存了卡片列表
   - 当浏览器排序队列时，`UnifiedQueueStrategy` 的缓存没有失效
   - 复习界面继续使用旧的缓存数据，看不到新的排序

## 解决方案

### 1. 队列排序时通知观察者

修改 `BaseReviewQueue.reorder()` 方法，在排序完成后通知所有观察者：

```typescript
public async reorder(orderedCards: FSRSCard[]): Promise<boolean> {
    try {
        console.log(`[${this.type}] Reordering ${orderedCards.length} cards`);
        
        // 将排序顺序存储在内存中
        this.customOrder = orderedCards.map(card => card.id);
        
        // 通知观察者队列已变更（触发复习界面刷新）
        this.manager.notifyObservers({
            type: 'queue-changed',
            queueType: this.type,
            timestamp: Date.now()
        });
        
        console.log(`[${this.type}] Reorder completed successfully (in-memory)`);
        return true;
    } catch (error) {
        console.error(`[${this.type}] Failed to reorder:`, error);
        return false;
    }
}
```

### 2. `UnifiedQueueStrategy` 响应队列变更事件

修改 `UnifiedQueueStrategy` 构造函数，注册观察者以响应队列变更：

```typescript
constructor(queueType: QueueType) {
    this.queueType = queueType;
    this.manager = UnifiedDataSourceManager.getInstance();
    this.queue = this.manager.getQueue(queueType);
    
    // 注册观察者以响应队列变更
    this.manager.registerObserver({
        onDataChanged: (event) => {
            // 当队列变更时，失效缓存
            if (event.type === 'queue-changed' && event.queueType === this.queueType) {
                console.log(`[UnifiedQueueStrategy] Queue changed, invalidating cache: ${this.queueType}`);
                this.invalidateCache();
            }
        }
    });
    
    console.log(`[UnifiedQueueStrategy] Created for queue: ${queueType}`);
}
```

## 工作流程

1. **用户在浏览器中排序**：
   - 浏览器调用 `queue.reorder(orderedCards)`
   - 队列更新 `customOrder` 属性
   - 队列通知观察者：`type: 'queue-changed'`

2. **`UnifiedQueueStrategy` 响应事件**：
   - 接收到 `queue-changed` 事件
   - 检查事件的 `queueType` 是否匹配
   - 调用 `invalidateCache()` 失效缓存

3. **复习界面获取下一张卡片**：
   - 调用 `reviewStrategy.next()`
   - 检测到缓存无效，重新加载卡片
   - 从队列获取卡片时，应用 `customOrder`
   - 返回排序后的卡片

## 测试验证

创建了两个测试文件来验证实现：

### 1. `QueueInstanceSharing.test.ts`

验证浏览器和复习界面共享同一个队列实例：

- ✅ 多次调用 `getQueue()` 返回同一个实例
- ✅ 浏览器和复习界面获取的是同一个队列
- ✅ 自定义排序在共享实例中保持
- ✅ `clearCustomOrder()` 清除排序

### 2. `BrowserReviewSortSync.test.ts`

验证排序同步机制：

- ✅ 队列排序时通知观察者
- ✅ `UnifiedQueueStrategy` 缓存在队列变更时失效
- ✅ 浏览器和复习界面共享队列实例
- ✅ 自定义排序在共享实例中保持

## 影响范围

### 修改的文件

1. **`src/queues/BaseReviewQueue.ts`**
   - 修改 `reorder()` 方法，添加观察者通知

2. **`src/strategies/UnifiedQueueStrategy.ts`**
   - 修改构造函数，注册观察者以响应队列变更

### 新增的测试文件

1. **`src/queues/__tests__/QueueInstanceSharing.test.ts`**
   - 验证队列实例共享机制

2. **`src/queues/__tests__/BrowserReviewSortSync.test.ts`**
   - 验证排序同步机制

## 支持的队列类型

所有队列类型都支持排序同步：

### 动态队列（临时排序）
- ✅ 检索练习队列（RetrievalPracticeQueue）
- ✅ 渐进学习队列（IncrementalLearningQueue）
- ✅ 过滤组队列（FilterGroupQueue）

### 静态队列（持久化排序）
- ✅ 最终训练队列（FinalDrillQueue）
- ✅ 神经漫游队列（NeuralRoamQueue）

## 用户体验

1. **浏览器排序**：
   - 用户在浏览器中点击列头或右键菜单排序
   - 排序立即应用到表格显示
   - 点击"应用排序到队列"按钮

2. **复习界面同步**：
   - 打开复习界面
   - 卡片按照浏览器中设置的排序显示
   - 无需手动刷新

3. **排序持久性**：
   - 动态队列：排序在内存中保持，刷新页面后恢复默认排序
   - 静态队列：排序持久化到 localStorage，刷新页面后保持

## 注意事项

1. **观察者模式**：
   - 使用观察者模式实现松耦合
   - 队列不需要知道谁在监听
   - 复习界面自动响应队列变更

2. **缓存失效**：
   - 队列变更时自动失效缓存
   - 下次访问时重新加载数据
   - 确保数据一致性

3. **性能考虑**：
   - 缓存失效不会立即重新加载
   - 只在下次访问时才加载
   - 避免不必要的数据加载

## 后续优化

1. **批量排序**：
   - 支持一次排序多个队列
   - 减少观察者通知次数

2. **排序预设**：
   - 保存常用的排序配置
   - 快速切换排序方式

3. **排序历史**：
   - 记录排序历史
   - 支持撤销/重做

## 总结

通过观察者模式和缓存失效机制，成功实现了浏览器和复习界面的排序同步。用户在浏览器中排序后，复习界面能够自动看到相同的排序效果，提供了一致的用户体验。
