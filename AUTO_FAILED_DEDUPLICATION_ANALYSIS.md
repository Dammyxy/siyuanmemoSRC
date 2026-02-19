# 自动失败卡片去重机制分析

## 问题描述

用户询问：动态队列复习后评分小于3的闪卡会自动掉入【最终训练】队列，这个机制还在吗？是不是没做去重？

## 机制现状

### 1. 机制还在 ✅

这个机制在以下三个动态队列中都存在：

#### RetrievalPracticeQueue（检索练习）
```typescript
// src/queues/RetrievalPracticeQueue.ts:265
if (rating < 3) {
    const finalDrillQueue = this.manager.getQueue(QueueType.FinalDrill);
    await finalDrillQueue.addCard(cardId, 'auto-failed');
}
```

#### IncrementalLearningQueue（渐进学习）
```typescript
// src/queues/IncrementalLearningQueue.ts:235
if (rating < 3) {
    const finalDrillQueue = this.manager.getQueue(QueueType.FinalDrill);
    await finalDrillQueue.addCard(cardId, 'auto-failed');
}
```

#### FilterGroupQueue（过滤组）
```typescript
// src/queues/FilterGroupQueue.ts:238
if (rating < 3) {
    const finalDrillQueue = this.manager.getQueue(QueueType.FinalDrill);
    await finalDrillQueue.addCard(cardId, 'auto-failed');
}
```

### 2. 去重逻辑分析

`FinalDrillQueue.addCard()` 的去重实现：

```typescript
// src/queues/FinalDrillQueue.ts:185
public async addCard(card: FSRSCard | QueueItem | string, source: 'manual' | 'auto-failed' = 'manual'): Promise<void> {
    const cardId = resolveCardId(card);
    
    // 检查是否已存在
    const existing = this.entries.get(cardId);
    if (existing && existing.source === 'manual') {
        // 手动添加的卡片不覆盖
        console.log(`[FinalDrillQueue] Card ${cardId} already exists as manual, skipping`);
        return;
    }
    
    // 添加或更新条目
    this.entries.set(cardId, {
        cardId,
        source,
        timestamp: Date.now()  // ⚠️ 更新时间戳
    });
    
    await this.persistEntries();
}
```

## 去重行为分析

### 当前行为

| 场景 | 已存在类型 | 新添加类型 | 行为 | 时间戳 |
|------|-----------|-----------|------|--------|
| 1 | 无 | `manual` | ✅ 添加 | 新时间戳 |
| 2 | 无 | `auto-failed` | ✅ 添加 | 新时间戳 |
| 3 | `manual` | `manual` | ❌ 跳过 | 保持原时间戳 |
| 4 | `manual` | `auto-failed` | ❌ 跳过 | 保持原时间戳 |
| 5 | `auto-failed` | `manual` | ✅ 覆盖 | 新时间戳 |
| 6 | `auto-failed` | `auto-failed` | ✅ 覆盖 | **新时间戳** ⚠️ |

### 问题场景

**场景6** 存在潜在问题：

```
Day 0: 用户对卡片A评分2 → 添加到最终训练（auto-failed，时间戳 T0）
Day 2: 用户对卡片A评分1 → 更新时间戳为 T2
Day 3: 自动清理检查 → 卡片A的时间戳是 T2，不满足3天条件，不清理
Day 5: 自动清理检查 → 卡片A的时间戳是 T2，满足3天条件，清理
```

**结果**：每次失败都会重置3天清理倒计时。

## 是否是 Bug？

这取决于产品设计意图：

### 方案A：当前行为（重置倒计时）

**逻辑**：每次失败都说明用户还没掌握，应该重置清理倒计时。

**优点**：
- 确保用户有足够时间练习失败的卡片
- 频繁失败的卡片会保留更久

**缺点**：
- 如果用户一直失败，卡片可能永远不会被自动清理
- 可能导致最终训练队列积累过多卡片

### 方案B：保留最早时间戳（不重置）

**逻辑**：无论失败多少次，都从第一次失败开始计算3天。

**优点**：
- 确保自动失败的卡片在3天后一定被清理
- 防止队列无限增长

**缺点**：
- 可能在用户还没充分练习时就清理了
- 不够灵活

### 方案C：混合策略

**逻辑**：
- 手动添加的卡片：永不自动清理
- 自动失败的卡片：
  - 如果已存在且是 `auto-failed`，**不更新时间戳**
  - 如果已存在且是 `manual`，不覆盖

**优点**：
- 平衡了两种需求
- 手动添加的卡片优先级更高
- 自动失败的卡片有明确的清理时间

**缺点**：
- 逻辑稍微复杂一点

## 建议修复

### 推荐方案C（混合策略）

修改 `FinalDrillQueue.addCard()` 方法：

```typescript
public async addCard(card: FSRSCard | QueueItem | string, source: 'manual' | 'auto-failed' = 'manual'): Promise<void> {
    try {
        const cardId = resolveCardId(card);
        
        // 检查是否已存在
        const existing = this.entries.get(cardId);
        
        if (existing) {
            // 如果已存在
            if (existing.source === 'manual') {
                // 手动添加的卡片不覆盖
                console.log(`[FinalDrillQueue] Card ${cardId} already exists as manual, skipping`);
                return;
            }
            
            if (existing.source === 'auto-failed' && source === 'auto-failed') {
                // 🆕 自动失败的卡片重复添加，不更新时间戳
                console.log(`[FinalDrillQueue] Card ${cardId} already exists as auto-failed, keeping original timestamp`);
                return;
            }
            
            // 其他情况：auto-failed → manual，允许覆盖
        }
        
        // 添加或更新条目
        this.entries.set(cardId, {
            cardId,
            source,
            timestamp: Date.now()
        });
        
        // 持久化
        await this.persistEntries();
        
        // 触发观察者通知
        this.manager.notifyObservers({
            type: 'queue-changed',
            queueType: this.getType(),
            timestamp: Date.now()
        });
        
        console.log(`[FinalDrillQueue] Card ${cardId} added with source ${source}`);
    } catch (error) {
        console.error('[FinalDrillQueue] Failed to add card:', error);
        throw error;
    }
}
```

### 修改后的行为

| 场景 | 已存在类型 | 新添加类型 | 行为 | 时间戳 |
|------|-----------|-----------|------|--------|
| 1 | 无 | `manual` | ✅ 添加 | 新时间戳 |
| 2 | 无 | `auto-failed` | ✅ 添加 | 新时间戳 |
| 3 | `manual` | `manual` | ❌ 跳过 | 保持原时间戳 |
| 4 | `manual` | `auto-failed` | ❌ 跳过 | 保持原时间戳 |
| 5 | `auto-failed` | `manual` | ✅ 覆盖 | 新时间戳 |
| 6 | `auto-failed` | `auto-failed` | ❌ 跳过 | **保持原时间戳** ✅ |

## 测试用例

需要添加测试验证：

```typescript
describe('FinalDrillQueue - Auto-failed deduplication', () => {
    it('should not update timestamp when adding duplicate auto-failed card', async () => {
        const queue = new FinalDrillQueue(manager);
        
        // 第一次添加
        await queue.addCard('card-1', 'auto-failed');
        const entry1 = queue.entries.get('card-1');
        const timestamp1 = entry1.timestamp;
        
        // 等待一段时间
        await sleep(100);
        
        // 第二次添加（重复）
        await queue.addCard('card-1', 'auto-failed');
        const entry2 = queue.entries.get('card-1');
        const timestamp2 = entry2.timestamp;
        
        // 验证时间戳没有变化
        expect(timestamp2).toBe(timestamp1);
    });
    
    it('should allow manual to override auto-failed', async () => {
        const queue = new FinalDrillQueue(manager);
        
        // 先添加 auto-failed
        await queue.addCard('card-1', 'auto-failed');
        const entry1 = queue.entries.get('card-1');
        expect(entry1.source).toBe('auto-failed');
        
        // 再添加 manual
        await queue.addCard('card-1', 'manual');
        const entry2 = queue.entries.get('card-1');
        expect(entry2.source).toBe('manual');
    });
});
```

## 总结

1. ✅ **机制还在**：评分 < 3 会自动添加到最终训练队列
2. ⚠️ **去重有问题**：重复的 `auto-failed` 会更新时间戳，导致清理时间被延后
3. 💡 **建议修复**：重复的 `auto-failed` 应该保留原时间戳，不更新
4. 📝 **需要测试**：添加测试用例验证去重行为

这个修复可以确保自动失败的卡片在3天后一定被清理，同时保留手动添加卡片的优先级。
