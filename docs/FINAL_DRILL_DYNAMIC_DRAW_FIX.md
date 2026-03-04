# 刻意练习队列动态抽牌修复

## 问题描述

刻意练习队列（FinalDrillQueue）在评分 1/2/3 后不跳过当前卡片，导致用户一直看到同一张卡片。

### 日志分析

```
[UnifiedQueueStrategy] Processing feedback: {queueType: 'final-drill', cardId: '20230606070000-fapuv4b', action: 'rate', rating: 3}
[FinalDrillQueue] Card 20230606070000-fapuv4b reviewed with rating 3, kept in queue
[UnifiedQueueStrategy] Queue changed, invalidating cache: final-drill
[UnifiedQueueStrategy] Cache invalidated: final-drill
[UnifiedQueueStrategy] Reloading cards: final-drill
[UnifiedQueueStrategy] Cards reloaded: {queueType: 'final-drill', cardCount: 4, duration: '0ms'}
[UnifiedQueueStrategy] Next card: {queueType: 'final-drill', cardId: '20230606070000-fapuv4b', index: 0, total: 4}
```

问题：评分后重新加载队列，但 `next()` 返回的还是同一张卡片（index: 0）。

## 根本原因

**FinalDrillQueue 没有使用 DynamicDrawSequencer！**

根据设计文档（`.kiro/specs/unified-data-source-architecture/design.md`）：

> **FinalDrillQueue**:
> - 组件: DynamicDrawSequencer ✅, ConditionalScheduler（新建）, StorageDataSource ✅

但实际实现中，`FinalDrillQueue.getCards()` 只是按照 Map 的插入顺序返回卡片：

```typescript
// 旧实现
public async getCards(): Promise<FSRSCard[]> {
    const cards: FSRSCard[] = [];
    for (const entry of this.entries.values()) {
        const card = await this.manager.getCard(entry.cardId);
        cards.push(card);
    }
    return cards; // 总是相同的顺序！
}
```

这导致每次调用 `getCards()` 都返回相同顺序的卡片，所以 `UnifiedQueueStrategy` 每次都拿到第一张卡片。

## 解决方案

### 1. 在 FinalDrillQueue 中集成 DynamicDrawSequencer

```typescript
import { DynamicDrawSequencer } from '../core/queue/sequencers/DynamicDrawSequencer';

export class FinalDrillQueue extends BaseReviewQueue {
    private sequencer: DynamicDrawSequencer<FSRSCard> | null = null;
    
    public async getCards(): Promise<FSRSCard[]> {
        // ... 获取所有卡片 ...
        
        // 使用动态抽牌排序器打乱顺序
        if (cards.length > 0) {
            this.sequencer = new DynamicDrawSequencer<FSRSCard>({
                getAll: () => cards,
                strategy: 'random',
                removeAfterSelection: false
            });
            
            // 使用排序器重新排列卡片
            const shuffledCards: FSRSCard[] = [];
            for (let i = 0; i < cards.length; i++) {
                const card = await this.sequencer.next();
                if (card) {
                    shuffledCards.push(card);
                }
            }
            
            return shuffledCards;
        }
        
        return cards;
    }
}
```

### 2. UnifiedQueueStrategy 使用动态抽牌逻辑

```typescript
async next(): Promise<FSRSCard | null> {
    // 刻意练习队列：动态抽牌算法
    if (this.queueType === 'final-drill') {
        // 每次都重新加载队列（获取新的随机顺序）
        await this.reloadCards();
        
        // 返回第一张卡片（已经是随机的）
        const card = this.cachedCards[0];
        return card;
    }
    
    // 其他队列：顺序遍历
    // ...
}
```

## 工作原理

1. **评分前**：
   - FinalDrillQueue 有 4 张卡片：[A, B, C, D]
   - `getCards()` 使用 DynamicDrawSequencer 随机打乱：[C, A, D, B]
   - `UnifiedQueueStrategy.next()` 返回第一张：C

2. **评分 1/2/3 后**：
   - FinalDrillQueue 保留所有 4 张卡片：[A, B, C, D]
   - `UnifiedQueueStrategy.next()` 重新调用 `getCards()`
   - `getCards()` 再次随机打乱：[B, D, A, C]
   - 返回第一张：B（不同的卡片！）

3. **评分 4 后**：
   - FinalDrillQueue 移除卡片 B：[A, C, D]
   - `UnifiedQueueStrategy.next()` 重新调用 `getCards()`
   - `getCards()` 随机打乱：[D, A, C]
   - 返回第一张：D

## 修改文件

1. `siyuan-plugin-fsrs/src/queues/FinalDrillQueue.ts`
   - 导入 DynamicDrawSequencer
   - 添加 sequencer 字段
   - 修改 `getCards()` 方法：使用 DynamicDrawSequencer 打乱卡片顺序

2. `siyuan-plugin-fsrs/src/strategies/UnifiedQueueStrategy.ts`
   - 修改 `next()` 方法：为刻意练习队列实现动态抽牌
   - 修改 `onFeedback()` 方法：刻意练习队列不失效缓存

## 预期行为

修复后，刻意练习队列的行为：

1. 用户评分 1/2/3：卡片保留在队列中
2. 调用 `next()`：重新加载队列，**卡片顺序被随机打乱**，返回第一张（很可能是不同的卡片）
3. 用户评分 4：卡片从队列移除
4. 调用 `next()`：重新加载队列，返回第一张卡片

## DynamicDrawSequencer 配置

当前使用的配置：
- `strategy: 'random'` - 纯随机选择
- `removeAfterSelection: false` - 不移除卡片（因为我们只是用来排序）

未来可以扩展为：
- `strategy: 'random-weighted'` - 加权随机（根据难度）
- `getWeight: (card) => calculateWeight(card)` - 权重函数

## 测试建议

1. 手动测试：
   - 添加 4 张卡片到刻意练习队列
   - 评分 1/2/3，观察是否跳到不同的卡片
   - 多次评分，确认卡片顺序是随机的
   - 评分 4，观察卡片是否从队列移除

2. 单元测试：
   - 测试 DynamicDrawSequencer 的随机性
   - 测试评分后的队列状态
   - 测试卡片顺序的变化

## 相关文档

- `.kiro/specs/unified-data-source-architecture/design.md` - 统一数据源架构设计
- `siyuan-plugin-fsrs/src/core/queue/sequencers/DynamicDrawSequencer.ts` - 动态抽牌排序器
- `资料/implementation_plan.md` - DynamicDrawSequencer 实现计划

## 日期

2026-02-07
