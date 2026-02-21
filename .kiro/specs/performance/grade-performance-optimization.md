# 评分性能优化方案

## 问题描述

评分后下一张卡片加载有明显延迟（约 200-500ms），影响复习体验。

## 根本原因

评分操作触发了一系列同步操作：

```
grade() → onFeedback() → handleReview() → handleReviewWithScheduler()
  ├─ getCard() (数据库查询)
  ├─ schedulerRouter.route() (FSRS 计算)
  ├─ updateCard() (数据库写入)
  ├─ removeCard() (队列操作)
  ├─ notifyObservers() (观察者通知 - 同步)
  └─ next() (加载下一张卡片)
     ├─ invalidateCache() (缓存失效)
     ├─ loadCards() (重新查询数据库)
     └─ updateState() (UI 更新)
        ├─ toUIState()
        │  └─ getStats() (查询队列统计)
        └─ fetchAuxiliaryData()
```

## 性能瓶颈分析

### 1. 数据库操作（最大瓶颈）
- `getCard()` - 同步读取当前卡片
- `updateCard()` - 同步写入更新后的卡片
- `loadCards()` - 重新查询整个队列
- `getStats()` - 查询队列统计

### 2. 观察者通知（次要瓶颈）
- `notifyObservers()` 是同步的
- 可能触发多个观察者的同步操作
- 每个观察者可能执行额外的数据库操作

### 3. 缓存失效（次要瓶颈）
- 每次评分后调用 `invalidateCache()`
- 下次 `next()` 需要重新从数据库加载
- 无法利用预加载的数据

### 4. UI 状态更新（次要瓶颈）
- `updateState()` 等待所有数据加载完成
- `toUIState()` 需要查询队列统计
- 无法使用乐观更新

## 优化方案

### 方案 1：异步化观察者通知（快速实现）

**目标**：将观察者通知改为异步，不阻塞评分流程

**实现**：
```typescript
// BaseReviewQueue.ts
protected async handleReviewWithScheduler(cardId: string, rating: number): Promise<void> {
    // ... 现有逻辑 ...
    
    // 6. 异步通知观察者（不等待）
    void this.manager.notifyObservers({
        type: 'card-updated',
        cardIds: [cardId],
        timestamp: Date.now(),
    });
}
```

**优点**：
- 实现简单，只需修改一行代码
- 立即减少 50-100ms 延迟
- 不影响现有功能

**缺点**：
- 观察者可能在下一张卡片加载后才执行
- 可能导致数据不一致（如果观察者依赖同步执行）

**预计效果**：减少 50-100ms 延迟

---

### 方案 2：预加载下一张卡片（中等实现）

**目标**：在评分的同时预加载下一张卡片

**实现**：
```typescript
// useReviewSession.ts
const grade = async (rating: number): Promise<void> {
    try {
        const feedback: QueueFeedback = { 
            action: 'rate', 
            rating: Math.max(1, Math.min(4, Math.floor(rating))) as 1 | 2 | 3 | 4 
        };
        
        // 🆕 并行执行：评分 + 预加载下一张
        const [_, nextItem] = await Promise.all([
            queue.onFeedback(currentItem.value, feedback),
            queue.next() // 预加载下一张
        ]);
        
        currentItem.value = nextItem;
        context.value.showAnswer = false;
        await updateState();
    } catch (error) {
        console.error('[SiYuanMemo][ReviewSession] 加载下一张卡片失败:', error);
        currentItem.value = null;
        await updateState();
    }
};
```

**优点**：
- 评分和加载并行执行
- 减少用户感知的延迟
- 不改变现有架构

**缺点**：
- 需要确保 `next()` 在 `onFeedback()` 之后执行
- 可能导致数据竞争（如果队列状态未及时更新）

**预计效果**：减少 100-200ms 延迟

---

### 方案 3：乐观更新 UI（中等实现）

**目标**：立即更新 UI，后台异步保存数据

**实现**：
```typescript
// useReviewSession.ts
const grade = async (rating: number): Promise<void> {
    try {
        const feedback: QueueFeedback = { 
            action: 'rate', 
            rating: Math.max(1, Math.min(4, Math.floor(rating))) as 1 | 2 | 3 | 4 
        };
        
        // 🆕 乐观更新：立即显示下一张卡片
        const optimisticNextItem = await queue.peek(); // 预览下一张（不移除）
        currentItem.value = optimisticNextItem;
        context.value.showAnswer = false;
        await updateState();
        
        // 🆕 后台异步保存评分
        void queue.onFeedback(currentItem.value, feedback).then(() => {
            // 评分完成后，确认下一张卡片
            return queue.next();
        }).then((confirmedNextItem) => {
            // 如果下一张卡片与预览不同，更新 UI
            if (confirmedNextItem?.id !== optimisticNextItem?.id) {
                currentItem.value = confirmedNextItem;
                void updateState();
            }
        });
    } catch (error) {
        console.error('[SiYuanMemo][ReviewSession] 加载下一张卡片失败:', error);
        currentItem.value = null;
        await updateState();
    }
};
```

**优点**：
- 用户感知延迟接近 0
- 提供最佳用户体验
- 评分操作在后台异步执行

**缺点**：
- 需要实现 `peek()` 方法
- 可能出现预览与实际不一致的情况
- 需要处理评分失败的回滚

**预计效果**：减少 200-400ms 延迟（用户感知）

---

### 方案 4：批量数据库操作（复杂实现）

**目标**：减少数据库操作次数

**实现**：
```typescript
// BaseReviewQueue.ts
protected async handleReviewWithScheduler(cardId: string, rating: number): Promise<void> {
    try {
        // 🆕 使用事务批量操作
        await this.manager.transaction(async (tx) => {
            // 1. 获取卡片
            const card = await tx.getCard(cardId);
            
            // 2. 调度卡片
            const schedulerRouter = this.getSchedulerRouter();
            const updatedCard = await schedulerRouter.route(card, rating);
            
            // 3. 更新卡片
            await tx.updateCard(updatedCard);
            
            // 4. 移除或保留卡片
            const shouldRemove = this.shouldRemoveFromQueue(updatedCard);
            if (shouldRemove) {
                await tx.removeCard(cardId);
            }
        });
        
        // 5. 异步通知观察者
        void this.manager.notifyObservers({
            type: 'card-updated',
            cardIds: [cardId],
            timestamp: Date.now(),
        });
    } catch (error) {
        console.error(`[${this.type}] Failed to handle review:`, error);
        throw error;
    }
}
```

**优点**：
- 减少数据库往返次数
- 提高数据一致性
- 减少锁竞争

**缺点**：
- 需要实现事务支持
- 改动较大，风险较高
- 需要测试事务回滚

**预计效果**：减少 100-200ms 延迟

---

### 方案 5：智能缓存策略（复杂实现）

**目标**：避免每次评分后都失效缓存

**实现**：
```typescript
// UnifiedQueueStrategy.ts
async onFeedback(currentItem: FSRSCard | null, feedback: QueueFeedback): Promise<void> {
    if (!currentItem) return;
    
    try {
        if (feedback.action === 'rate' && feedback.rating) {
            await this.queue.handleReview(currentItem.id, feedback.rating);
            
            // 🆕 智能缓存失效：只在必要时失效
            if (this.shouldInvalidateCache(currentItem, feedback.rating)) {
                this.invalidateCache();
            } else {
                // 🆕 增量更新缓存
                this.updateCacheAfterReview(currentItem, feedback.rating);
            }
        }
    } catch (error) {
        console.error('Failed to process feedback:', error);
        throw error;
    }
}

private shouldInvalidateCache(card: FSRSCard, rating: number): boolean {
    // 评分 < 3 时需要失效缓存（卡片可能重新进入队列）
    if (rating < 3) return true;
    
    // 其他情况不需要失效缓存
    return false;
}

private updateCacheAfterReview(card: FSRSCard, rating: number): void {
    // 从缓存中移除已评分的卡片
    if (this.cachedCards) {
        this.cachedCards = this.cachedCards.filter(c => c.id !== card.id);
    }
}
```

**优点**：
- 避免不必要的数据库查询
- 保持缓存有效性
- 提高后续 `next()` 的性能

**缺点**：
- 需要实现复杂的缓存更新逻辑
- 可能导致缓存不一致
- 需要大量测试

**预计效果**：减少 100-300ms 延迟

---

## 推荐实施顺序

### 阶段 1：快速优化（立即实施）
1. **方案 1：异步化观察者通知**
   - 风险低，收益明显
   - 预计减少 50-100ms 延迟

### 阶段 2：中期优化（1-2 天）
2. **方案 2：预加载下一张卡片**
   - 实现简单，效果显著
   - 预计减少 100-200ms 延迟

3. **方案 5：智能缓存策略**
   - 避免不必要的缓存失效
   - 预计减少 100-300ms 延迟

### 阶段 3：长期优化（1 周）
4. **方案 4：批量数据库操作**
   - 需要实现事务支持
   - 预计减少 100-200ms 延迟

5. **方案 3：乐观更新 UI**
   - 提供最佳用户体验
   - 需要处理边缘情况

---

## 预期效果

- **阶段 1**：减少 50-100ms 延迟
- **阶段 2**：减少 200-500ms 延迟
- **阶段 3**：减少 300-700ms 延迟

**总计**：将评分后的延迟从 200-500ms 降低到 50-100ms 以下。

---

## 监控指标

实施优化后，需要监控以下指标：

1. **评分延迟**：从点击评分按钮到显示下一张卡片的时间
2. **数据库操作次数**：每次评分触发的数据库查询/写入次数
3. **缓存命中率**：`next()` 使用缓存的比例
4. **观察者执行时间**：观察者通知的总耗时
5. **用户感知延迟**：用户主观感受的延迟时间

---

## 风险评估

### 方案 1（低风险）
- 观察者可能依赖同步执行
- 需要测试观察者的异步行为

### 方案 2（中风险）
- 可能出现数据竞争
- 需要确保 `next()` 在 `onFeedback()` 之后执行

### 方案 3（高风险）
- 预览与实际可能不一致
- 需要处理评分失败的回滚

### 方案 4（中风险）
- 需要实现事务支持
- 需要测试事务回滚

### 方案 5（中风险）
- 缓存更新逻辑复杂
- 可能导致缓存不一致

---

## 实施计划

### ✅ 第 1 天：快速优化（已完成 2024-02-21）
- [x] 实施方案 1：异步化观察者通知
  - 修改文件：`src/core/queue/domain/BaseReviewQueue.ts`
  - 将 `notifyObservers()` 改为异步执行（使用 `void` 关键字）
  - 预计减少 50-100ms 延迟
- [x] 实施方案 2：预加载下一张卡片
  - 修改文件：`src/ui/review/v2/useReviewSession.ts`
  - 使用 `Promise.all()` 并行执行评分和加载
  - 预计减少 100-200ms 延迟

**预期效果**：减少 150-300ms 延迟

### 第 2-3 天：中期优化
- [ ] 实施方案 2：预加载下一张卡片
- [ ] 实施方案 5：智能缓存策略
- [ ] 测试数据一致性
- [ ] 监控缓存命中率

### 第 4-7 天：长期优化
- [ ] 实施方案 4：批量数据库操作
- [ ] 实施方案 3：乐观更新 UI
- [ ] 全面测试
- [ ] 性能基准测试

---

## 参考资料

- [性能优化计划](./performance-optimization-plan.md)
- [观察者集成](./observer-integration.md)
- [动态队列保护](./dynamic-queue-protection.md)
