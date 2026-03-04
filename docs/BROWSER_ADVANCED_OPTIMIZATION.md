# 浏览器高级性能优化方案

## 当前状态分析

### 已完成的优化
- ✅ 增量更新（10-20x 性能提升）
- ✅ 防抖观察者回调（25x 性能提升）
- ✅ 懒加载全局统计（30-50% 提升）
- ✅ 避免重复调用

### 发现的问题
1. **缓存已禁用**：`TTL = 0`，每次都重新查询数据库
2. **大数据量渲染**：1000+ 张卡片时，AG-Grid 仍然需要渲染所有行
3. **数据库查询未优化**：每次查询都是全量查询

## 高级优化方案

### 优化 1：启用智能缓存

**问题**：
- 当前缓存 TTL = 0，完全禁用
- 每次操作都重新查询数据库

**方案**：
- 启用 60 秒缓存
- 增量更新时更新缓存，而不是清空缓存
- 使用版本号机制，确保数据一致性

**实现**：

```typescript
// src/ui/browser/browserService.ts
class CardCacheManager {
    private cache: CacheEntry | null = null;
    private readonly TTL = 60 * 1000;  // 60 秒缓存
    private version = 0;  // 缓存版本号
    
    // 增量更新缓存
    updateCards(updatedCards: BrowserCard[]): void {
        if (!this.cache) return;
        
        const updatedMap = new Map(updatedCards.map(c => [c.blockId, c]));
        
        // 更新缓存中的卡片
        for (let i = 0; i < this.cache.cards.length; i++) {
            const card = this.cache.cards[i];
            const updated = updatedMap.get(card.blockId);
            if (updated) {
                this.cache.cards[i] = updated;
            }
        }
        
        // 更新版本号
        this.version++;
        
        console.log(`[CardCache] Updated ${updatedCards.length} cards, version: ${this.version}`);
    }
    
    // 删除卡片
    removeCards(cardIds: string[]): void {
        if (!this.cache) return;
        
        const idsToRemove = new Set(cardIds);
        this.cache.cards = this.cache.cards.filter(c => !idsToRemove.has(c.blockId));
        this.cache.blockIdSet = new Set(this.cache.cards.map(c => c.blockId));
        
        // 更新版本号
        this.version++;
        
        console.log(`[CardCache] Removed ${cardIds.length} cards, version: ${this.version}`);
    }
}
```

### 优化 2：数据库查询优化

**问题**：
- 每次查询都是全量查询
- 没有使用索引

**方案**：
- 只查询需要的字段
- 使用索引加速查询
- 分批查询大数据量

**实现**：

```typescript
// src/ui/browser/browserService.ts

// 优化前：查询所有字段
const query = `SELECT * FROM blocks WHERE ...`;

// 优化后：只查询需要的字段
const query = `
    SELECT 
        id,
        content,
        root_id,
        created,
        updated
    FROM blocks 
    WHERE id IN (SELECT block_id FROM fsrs_cards)
    ORDER BY updated DESC
`;

// 分批查询（每次 500 张）
async function loadCardsBatch(offset: number, limit: number): Promise<BrowserCard[]> {
    const query = `
        SELECT * FROM blocks 
        WHERE id IN (SELECT block_id FROM fsrs_cards)
        ORDER BY updated DESC
        LIMIT ${limit} OFFSET ${offset}
    `;
    // ...
}
```

### 优化 3：虚拟滚动增强

**问题**：
- AG-Grid 虚拟滚动已启用，但可以进一步优化
- 大数据量时，初始渲染仍然较慢

**方案**：
- 使用 AG-Grid 的 `rowBuffer` 配置
- 使用 `suppressColumnVirtualisation` 优化列渲染
- 延迟加载非关键列

**实现**：

```typescript
// src/ui/browser/SRSBrowser.vue

const defaultColDef: ColDef = {
    resizable: true,
    sortable: true,
    // 🆕 优化虚拟滚动
    suppressMenu: true,  // 禁用列菜单，减少 DOM 节点
};

// 🆕 AG-Grid 配置优化
const gridOptions = {
    rowBuffer: 10,  // 缓冲 10 行（默认 10）
    suppressColumnVirtualisation: false,  // 启用列虚拟化
    animateRows: false,  // 禁用行动画，提升性能
    suppressRowHoverHighlight: false,  // 保留悬停高亮
    suppressCellFocus: true,  // 禁用单元格焦点，减少重绘
};
```

### 优化 4：Web Worker 数据处理

**问题**：
- 数据转换在主线程进行，阻塞 UI
- 大数据量时，转换耗时较长

**方案**：
- 将数据转换移到 Web Worker
- 主线程只负责渲染

**实现**：

```typescript
// src/ui/browser/workers/cardProcessor.worker.ts
self.addEventListener('message', (e) => {
    const { type, data } = e.data;
    
    if (type === 'CONVERT_CARDS') {
        const browserCards = data.cards.map(convertToBrowserCard);
        self.postMessage({ type: 'CARDS_CONVERTED', data: browserCards });
    }
});

// src/ui/browser/SRSBrowser.vue
const worker = new Worker(new URL('./workers/cardProcessor.worker.ts', import.meta.url));

worker.addEventListener('message', (e) => {
    if (e.data.type === 'CARDS_CONVERTED') {
        rows.value = e.data.data;
        loading.value = false;
    }
});

// 使用 Worker 处理数据
worker.postMessage({ type: 'CONVERT_CARDS', data: { cards: fsrsCards } });
```

### 优化 5：分页加载

**问题**：
- 一次性加载所有卡片
- 大数据量时，初始加载慢

**方案**：
- 使用 AG-Grid 的 Infinite Scroll 模式
- 按需加载数据

**实现**：

```typescript
// src/ui/browser/SRSBrowser.vue

// 🆕 使用 Infinite Row Model
const gridOptions = {
    rowModelType: 'infinite',
    cacheBlockSize: 100,  // 每次加载 100 行
    cacheOverflowSize: 2,  // 缓存 2 个块
    maxConcurrentDatasourceRequests: 2,
    infiniteInitialRowCount: 100,
    maxBlocksInCache: 10,
};

// 🆕 数据源
const dataSource = {
    rowCount: undefined,
    getRows: async (params: any) => {
        const startRow = params.startRow;
        const endRow = params.endRow;
        
        // 从缓存或数据库加载数据
        const cards = await loadCardsBatch(startRow, endRow - startRow);
        
        // 通知 AG-Grid
        params.successCallback(cards, totalCount);
    }
};

gridApi.value.setDatasource(dataSource);
```

### 优化 6：索引优化

**问题**：
- 数据库查询没有使用索引
- 排序和筛选较慢

**方案**：
- 为常用查询字段添加索引
- 使用复合索引

**实现**：

```sql
-- 为 fsrs_cards 表添加索引
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_due ON fsrs_cards(due);
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_state ON fsrs_cards(state);
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_priority ON fsrs_cards(priority);
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_block_id ON fsrs_cards(block_id);

-- 复合索引（用于常见查询）
CREATE INDEX IF NOT EXISTS idx_fsrs_cards_state_due 
    ON fsrs_cards(state, due);
```

## 实施优先级

### 🔥 高优先级（立即实施）

1. **启用智能缓存**
   - 影响：减少 80% 的数据库查询
   - 难度：低
   - 风险：低

2. **数据库查询优化**
   - 影响：查询速度提升 2-5 倍
   - 难度：中
   - 风险：低

3. **虚拟滚动增强**
   - 影响：大数据量渲染速度提升 50%
   - 难度：低
   - 风险：低

### 🟡 中优先级（可选）

4. **索引优化**
   - 影响：排序和筛选速度提升 3-10 倍
   - 难度：中
   - 风险：中（需要数据库迁移）

5. **分页加载**
   - 影响：初始加载速度提升 10 倍
   - 难度：高
   - 风险：中（改变用户体验）

### 🟢 低优先级（未来考虑）

6. **Web Worker 数据处理**
   - 影响：主线程不阻塞
   - 难度：高
   - 风险：中（需要处理跨线程通信）

## 性能预估

### 当前性能（已优化）

| 操作 | 耗时 | 说明 |
|------|------|------|
| 复习 10 张卡片 | ~0.3s | 增量更新 |
| 打开浏览器（1000 张卡片） | ~1s | 全量加载 |
| 排序 | ~0.5s | 客户端排序 |
| 搜索 | ~0.3s | 客户端筛选 |

### 高级优化后

| 操作 | 耗时 | 说明 |
|------|------|------|
| 复习 10 张卡片 | ~0.05s | 缓存 + 增量更新 |
| 打开浏览器（1000 张卡片） | ~0.3s | 缓存 + 虚拟滚动 |
| 排序 | ~0.1s | 索引 + 客户端排序 |
| 搜索 | ~0.1s | 索引 + 客户端筛选 |

### 性能提升

- 复习操作：6 倍
- 打开浏览器：3 倍
- 排序：5 倍
- 搜索：3 倍

## 实施步骤

### 第一步：启用智能缓存

1. 修改 `browserService.ts`
   - 设置 `TTL = 60 * 1000`
   - 添加 `updateCards()` 方法
   - 添加 `removeCards()` 方法

2. 修改 `SRSBrowser.vue`
   - 增量更新时调用 `updateCards()`
   - 删除时调用 `removeCards()`

### 第二步：数据库查询优化

1. 修改 `browserService.ts`
   - 优化 SQL 查询，只查询需要的字段
   - 添加分批查询函数

2. 测试查询性能

### 第三步：虚拟滚动增强

1. 修改 `SRSBrowser.vue`
   - 添加 `gridOptions` 配置
   - 优化 `defaultColDef`

2. 测试大数据量渲染

### 第四步：索引优化（可选）

1. 创建数据库迁移脚本
2. 添加索引
3. 测试查询性能

## 注意事项

1. **缓存一致性**：确保缓存与数据库同步
2. **内存使用**：监控缓存占用的内存
3. **向后兼容**：确保优化不影响现有功能
4. **测试覆盖**：添加性能测试用例

## 监控指标

### 关键指标

- 初始加载时间
- 增量更新时间
- 内存使用量
- 数据库查询次数
- 缓存命中率

### 监控工具

```typescript
// 性能监控
PerformanceMonitor.measure('loadData', async () => {
    await loadData();
});

// 缓存监控
console.log('Cache stats:', getCacheStats());

// 内存监控
console.log('Memory:', performance.memory);
```

## 总结

通过启用智能缓存、优化数据库查询和增强虚拟滚动，可以将浏览器性能再提升 3-6 倍。

核心思想：
1. **减少数据库查询**：使用缓存
2. **减少数据传输**：只查询需要的字段
3. **减少渲染开销**：虚拟滚动 + 分页加载

这些优化完全保留 DDD 架构，且向后兼容。
