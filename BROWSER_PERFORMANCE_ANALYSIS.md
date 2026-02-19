# 浏览器和神经漫游性能分析

## 🔍 性能瓶颈分析

### 1. browserService.ts 的性能问题

#### 问题 1：批量查询中的循环操作
```typescript
// 当前实现：循环 + 多次数组操作
for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
    const batchIds = blockIds.slice(i, i + BATCH_SIZE);
    const batchCards = fsrsCards.slice(i, i + BATCH_SIZE);
    
    const { attrsMap, rootIdMap, tagsMap, contentMap } = await fetchBlockInfoBatched(batchIds);
    
    const batchBrowserCards: BrowserCard[] = batchCards.map((card) => {
        // 多次 Map.get() 调用
        const customAttrs = attrsMap.get(card.blockId) || {};
        const browserCard = transformFSRSCard(card, customAttrs);
        browserCard.rootId = rootIdMap.get(card.blockId) || browserCard.rootId || '';
        browserCard.tags = tagsMap.get(card.blockId) || [];
        // ...
    });
    
    cards.push(...batchBrowserCards);
}
```

**性能影响：**
- 每批次都要创建新数组
- 多次 `.map()` 和 `.get()` 调用
- 频繁的数组扩展操作

#### 问题 2：transformFSRSCard 中的重复计算
```typescript
function transformFSRSCard(card: FSRSCard, customAttrs: Record<string, string>): BrowserCard {
    const now = Date.now();
    const MS_PER_DAY = 86400000;
    
    // 每次都创建新的 Date 对象
    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    
    // 多次字符串格式化
    const dueFormatted = formatDueDate(dueDate);
    const lastReviewFormatted = lastReviewDate ? formatHistoryDate(lastReviewDate) : '';
    const firstReviewFormatted = lastReviewDate ? formatHistoryDate(lastReviewDate) : '';
}
```

**性能影响：**
- 重复创建 Date 对象
- 重复调用格式化函数
- 不必要的字符串操作

#### 问题 3：loadQueueCards 中的多次数组遍历
```typescript
// 第一次遍历：map
let cards: BrowserCard[] = ids
    .map(id => cardMap.get(id))
    .filter(Boolean)
    .map(card => {
        // 转换逻辑
    });

// 第二次遍历：filter（在 applyParsedQuery 中）
cards = applyParsedQuery(cards, parsed);

// 第三次遍历：map + filter
const byBlockId = new Map(cards.map((c) => [c.blockId, c]));
return ids.map((id) => byBlockId.get(id)).filter(Boolean) as BrowserCard[];
```

**性能影响：**
- 3-4 次完整数组遍历
- 可以合并为 1-2 次

### 2. ConceptNeuralQueue.ts 的性能问题

#### 问题 1：频繁的 Set/Array 转换
```typescript
// 多次转换 Set <-> Array
const unvisitedSeeds = Array.from(this.seeds.entries())
    .filter(([id, _]) => !this.visitedBlocks.has(id))
    .map(([id, state]) => ({ id, ...state }));

// 另一处
const unvisitedSeeds = Array.from(this.seeds.keys()).filter(
    id => !this.visitedBlocks.has(id)
);
```

**性能影响：**
- 每次调用都要转换数据结构
- 可以缓存未访问种子列表

#### 问题 2：递归调用 getNextCard
```typescript
async getNextCard(): Promise<QueueItem | null> {
    // ...
    if (!blockData) {
        this.visitedBlocks.add(selected.id);
        return this.getNextCard(); // 递归调用
    }
    // ...
    return this.getNextCard(); // 递归调用
}
```

**性能影响：**
- 可能导致深层递归
- 栈溢出风险（虽然概率低）

## 🎯 优化方案

### 优化 1：减少 browserService 中的数组遍历

**目标：** 将 3-4 次遍历减少到 1-2 次

**方案：**
```typescript
// 合并多次遍历为一次
const cards: BrowserCard[] = [];
const cardMap = new Map(allCards.map(c => [c.blockId, c]));

for (const id of ids) {
    const card = cardMap.get(id);
    if (!card) continue;
    
    const customAttrs = attrsMap.get(card.blockId) || {};
    const browserCard = transformFSRSCard(card, customAttrs);
    browserCard.rootId = rootIdMap.get(card.blockId) || browserCard.rootId || '';
    browserCard.tags = tagsMap.get(card.blockId) || [];
    
    // 直接在循环中应用筛选条件
    if (matchesParsedQuery(browserCard, parsed)) {
        cards.push(browserCard);
    }
}
```

**预期收益：** 性能提升 30-50%

### 优化 2：优化 transformFSRSCard

**目标：** 减少重复计算和对象创建

**方案：**
```typescript
// 缓存常用的格式化结果
const dateCache = new Map<number, string>();

function formatDateCached(timestamp: number): string {
    let cached = dateCache.get(timestamp);
    if (!cached) {
        cached = formatDueDate(new Date(timestamp));
        dateCache.set(timestamp, cached);
        
        // 限制缓存大小
        if (dateCache.size > 1000) {
            const firstKey = dateCache.keys().next().value;
            dateCache.delete(firstKey);
        }
    }
    return cached;
}
```

**预期收益：** 性能提升 20-30%

### 优化 3：使用 while 循环替代递归

**目标：** 避免递归调用的开销

**方案：**
```typescript
async getNextCard(): Promise<QueueItem | null> {
    while (true) {
        // 原来的逻辑
        // 将 return this.getNextCard() 改为 continue
        
        if (!blockData) {
            this.visitedBlocks.add(selected.id);
            continue; // 替代递归
        }
        
        return queueItem; // 成功返回
    }
}
```

**预期收益：** 性能提升 10-15%，避免栈溢出

### 优化 4：缓存未访问种子列表

**目标：** 减少 Set/Array 转换

**方案：**
```typescript
export class ConceptNeuralQueue {
    private unvisitedSeedsCache: string[] | null = null;
    
    private getUnvisitedSeeds(): string[] {
        if (!this.unvisitedSeedsCache) {
            this.unvisitedSeedsCache = Array.from(this.seeds.keys())
                .filter(id => !this.visitedBlocks.has(id));
        }
        return this.unvisitedSeedsCache;
    }
    
    // 在修改 visitedBlocks 或 seeds 时清除缓存
    private invalidateCache(): void {
        this.unvisitedSeedsCache = null;
    }
}
```

**预期收益：** 性能提升 15-20%

## 📊 优化优先级

### 高优先级（立即执行）

1. ✅ **优化 loadQueueCards 的数组遍历**
   - 时间：15 分钟
   - 收益：30-50%
   - 风险：低

2. ✅ **使用 while 循环替代递归**
   - 时间：10 分钟
   - 收益：10-15%
   - 风险：极低

### 中优先级（本周内）

3. **优化 transformFSRSCard**
   - 时间：30 分钟
   - 收益：20-30%
   - 风险：低

4. **缓存未访问种子列表**
   - 时间：20 分钟
   - 收益：15-20%
   - 风险：低

## 🚀 实施计划

### 第一步：优化 loadQueueCards（15 分钟）
- 合并多次数组遍历
- 减少中间数组创建

### 第二步：优化 ConceptNeuralQueue（10 分钟）
- 将递归改为 while 循环
- 减少不必要的日志输出

### 总耗时：25 分钟
### 预期总收益：性能提升 40-65%

## ✅ 验证方法

1. 打开 SRS 浏览器，加载大量卡片（500+ 张）
2. 测试神经漫游队列，添加多个种子
3. 观察响应速度和流畅度
4. 检查控制台是否有错误

## 📝 注意事项

1. **不使用缓存**：避免之前的缓存问题
2. **保持功能一致**：只优化性能，不改变逻辑
3. **渐进式优化**：一次优化一个点，测试后再继续
4. **保留日志**：开发环境保留关键日志，便于调试
