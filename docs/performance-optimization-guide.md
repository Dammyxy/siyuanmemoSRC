# 性能优化实战指南

## 1. 异步操作优化

### 问题：循环中的 await

**❌ 错误示例：**
```typescript
// 串行执行，慢
const cards = [];
for (const id of cardIds) {
  const card = await fetchCard(id);
  cards.push(card);
}
```

**✅ 优化方案 1：Promise.all（适合少量数据）**
```typescript
// 并行执行，快
const cards = await Promise.all(
  cardIds.map(id => fetchCard(id))
);
```

**✅ 优化方案 2：并发控制（适合大量数据）**
```typescript
import { parallelMap } from '@/utils/asyncHelpers';

// 最多同时执行 10 个请求
const cards = await parallelMap(
  cardIds,
  async (id) => await fetchCard(id),
  10
);
```

**✅ 优化方案 3：批量查询（最优）**
```typescript
import { batchProcess } from '@/utils/asyncHelpers';

// 每次查询 50 个
const cards = await batchProcess(
  cardIds,
  async (batch) => await fetchCardsByIds(batch),
  50
);
```

### 问题：数组方法中的 await

**❌ 错误示例：**
```typescript
// filter 不支持异步
const conceptCards = cardIds.filter(async (id) => {
  return await isConceptCard(id); // 不会等待！
});
```

**✅ 优化方案：**
```typescript
import { parallelFilter } from '@/utils/asyncHelpers';

const conceptCards = await parallelFilter(
  cardIds,
  async (id) => await isConceptCard(id),
  10 // 并发数
);
```

## 2. SQL 查询优化

### 问题：SELECT *

**❌ 错误示例：**
```typescript
const rows = await sql(`SELECT * FROM blocks WHERE id IN (${ids})`);
```

**✅ 优化方案：**
```typescript
// 只查询需要的字段
const rows = await sql(`
  SELECT id, content, type 
  FROM blocks 
  WHERE id IN (${ids})
`);
```

### 问题：循环查询

**❌ 错误示例：**
```typescript
const blocks = [];
for (const id of blockIds) {
  const rows = await sql(`SELECT * FROM blocks WHERE id = '${id}'`);
  blocks.push(...rows);
}
```

**✅ 优化方案：**
```typescript
import { buildInClause, batchSQLQuery } from '@/utils/sqlOptimizer';

// 批量查询
const blocks = await batchSQLQuery(
  blockIds,
  async (batch) => {
    const inClause = buildInClause(batch);
    return await sql(`
      SELECT id, content, type 
      FROM blocks 
      WHERE id IN (${inClause})
    `);
  },
  200 // 每批 200 个
);
```

### 问题：N+1 查询

**❌ 错误示例：**
```typescript
// 先查询卡片
const cards = await sql(`SELECT * FROM cards`);

// 再循环查询每个卡片的属性（N+1 问题）
for (const card of cards) {
  const attrs = await sql(`
    SELECT * FROM attributes 
    WHERE block_id = '${card.id}'
  `);
  card.attributes = attrs;
}
```

**✅ 优化方案：**
```typescript
// 使用 JOIN 一次查询
const rows = await sql(`
  SELECT 
    c.*,
    a.name as attr_name,
    a.value as attr_value
  FROM cards c
  LEFT JOIN attributes a ON c.id = a.block_id
`);

// 或者批量查询属性
const cardIds = cards.map(c => c.id);
const inClause = buildInClause(cardIds);
const attrs = await sql(`
  SELECT block_id, name, value 
  FROM attributes 
  WHERE block_id IN (${inClause})
`);

// 组装数据
const attrMap = new Map();
for (const attr of attrs) {
  if (!attrMap.has(attr.block_id)) {
    attrMap.set(attr.block_id, []);
  }
  attrMap.get(attr.block_id).push(attr);
}

for (const card of cards) {
  card.attributes = attrMap.get(card.id) || [];
}
```

### 使用 SQL 构建器

```typescript
import { SQLBuilder } from '@/utils/sqlOptimizer';

const query = new SQLBuilder()
  .select(['id', 'content', 'type'])
  .from('blocks')
  .where('type', 'concept')
  .whereIn('id', blockIds)
  .innerJoin('attributes a', 'a.block_id = blocks.id')
  .orderBy('created', 'DESC')
  .limit(100)
  .build();

const results = await sql(query);
```

## 3. 缓存优化

### 查询结果缓存

```typescript
import { withCache } from '@/utils/queryCache';

// 包装查询函数
const getCachedCard = withCache(
  async (cardId: string) => {
    return await fetchCard(cardId);
  },
  { 
    ttl: 5000,      // 5秒过期
    maxSize: 100,   // 最多缓存 100 个
    keyGenerator: (id) => `card:${id}` // 自定义缓存键
  }
);

// 使用
const card = await getCachedCard('card-id');
```

### LRU 缓存

```typescript
import { LRUCache } from '@/utils/queryCache';

class CardService {
  private cache = new LRUCache<string, Card>(100);

  async getCard(id: string): Promise<Card> {
    // 检查缓存
    const cached = this.cache.get(id);
    if (cached) return cached;

    // 查询数据
    const card = await fetchCard(id);
    
    // 缓存结果
    this.cache.set(id, card);
    
    return card;
  }
}
```

## 4. 事件处理优化

### 防抖（Debounce）

适用场景：搜索输入、窗口大小调整

```typescript
import { debounce } from '@/utils/debounce';

// 搜索输入防抖
const handleSearch = debounce((query: string) => {
  performSearch(query);
}, 300); // 300ms 后执行

// 在 Vue 中使用
const searchInput = ref('');
watch(searchInput, handleSearch);
```

### 节流（Throttle）

适用场景：滚动事件、鼠标移动

```typescript
import { throttle } from '@/utils/debounce';

// 滚动事件节流
const handleScroll = throttle(() => {
  updateScrollPosition();
}, 100); // 每 100ms 最多执行一次

window.addEventListener('scroll', handleScroll);
```

### RAF 节流

适用场景：UI 更新、动画

```typescript
import { rafThrottle } from '@/utils/debounce';

// UI 更新使用 RAF
const updatePosition = rafThrottle(() => {
  element.style.transform = `translateX(${x}px)`;
});

// 高频调用
onMouseMove((e) => {
  x = e.clientX;
  updatePosition();
});
```

## 5. Vue 组件优化

### v-memo

```vue
<template>
  <!-- 只在 card.id 或 card.due 变化时重新渲染 -->
  <div v-memo="[card.id, card.due]">
    <CardItem :card="card" />
  </div>
</template>
```

### v-once

```vue
<template>
  <!-- 静态内容只渲染一次 -->
  <div v-once>
    <h1>{{ staticTitle }}</h1>
    <p>{{ staticDescription }}</p>
  </div>
</template>
```

### 组件懒加载

```typescript
import { defineAsyncComponent } from 'vue';

// 路由级别懒加载
const ReviewDialog = defineAsyncComponent(() =>
  import('@/ui/review/ReviewDialog.vue')
);

// 条件渲染懒加载
const HeavyComponent = defineAsyncComponent({
  loader: () => import('./HeavyComponent.vue'),
  delay: 200,        // 延迟显示 loading
  timeout: 3000,     // 超时时间
  errorComponent: ErrorComponent,
  loadingComponent: LoadingComponent
});
```

### 计算属性缓存

```vue
<script setup lang="ts">
import { computed } from 'vue';

// ❌ 方法每次都会重新计算
const getFilteredCards = () => {
  return cards.value.filter(c => c.due < Date.now());
};

// ✅ 计算属性会缓存结果
const filteredCards = computed(() => {
  return cards.value.filter(c => c.due < Date.now());
});
</script>
```

## 6. 内存管理

### 清理事件监听器

```typescript
import { onBeforeUnmount } from 'vue';

// Vue 组件
onBeforeUnmount(() => {
  // 清理事件监听器
  eventBus.off('card-updated', handleCardUpdate);
  
  // 清理定时器
  clearInterval(intervalId);
  clearTimeout(timeoutId);
  
  // 清理 WebSocket
  ws?.close();
  
  // 清理 DOM 事件
  element.removeEventListener('click', handleClick);
});
```

### 使用 WeakMap

```typescript
// ❌ 使用 Map 可能导致内存泄漏
const cache = new Map<object, any>();

// ✅ 使用 WeakMap 自动清理
const cache = new WeakMap<object, any>();

function getCachedData(key: object) {
  if (!cache.has(key)) {
    cache.set(key, computeExpensiveData(key));
  }
  return cache.get(key);
}
```

## 7. 性能监控

### 添加性能监控

```typescript
import { PerformanceMonitor } from '@/utils/performance';

// 异步操作
const result = await PerformanceMonitor.measure('load-cards', async () => {
  return await loadCards();
});

// 同步操作
const data = PerformanceMonitor.measureSync('parse-data', () => {
  return parseData(rawData);
});

// 查看性能报告
PerformanceMonitor.printReport();

// 查看内存使用
PerformanceMonitor.logMemoryUsage();
```

### 性能预算

```typescript
import { checkBudget, PERFORMANCE_BUDGETS } from '@/utils/performanceBudget';

async function loadCards() {
  const start = performance.now();
  
  const cards = await fetchCards();
  
  const duration = performance.now() - start;
  checkBudget('db:query:batch', duration);
  
  return cards;
}
```

## 8. 实战案例

### 案例 1：优化概念卡邻居查询

**优化前：**
```typescript
// 串行查询，慢
const backlinks = await fetchBacklinks(conceptId);
const outgoingLinks = await fetchOutgoingLinks(conceptId);
const descriptors = await fetchDescriptors(conceptId);
```

**优化后：**
```typescript
// 并行查询，快 3 倍
const [backlinks, outgoingLinks, descriptors] = await Promise.all([
  fetchBacklinks(conceptId),
  fetchOutgoingLinks(conceptId),
  fetchDescriptors(conceptId),
]);
```

### 案例 2：优化批量卡片加载

**优化前：**
```typescript
// 循环查询，慢
const cards = [];
for (const id of cardIds) {
  const card = await fetchCard(id);
  cards.push(card);
}
```

**优化后：**
```typescript
// 批量查询，快 10 倍以上
import { batchSQLQuery, buildInClause } from '@/utils/sqlOptimizer';

const cards = await batchSQLQuery(
  cardIds,
  async (batch) => {
    const inClause = buildInClause(batch);
    return await sql(`
      SELECT id, content, type, due 
      FROM cards 
      WHERE id IN (${inClause})
    `);
  },
  200
);
```

### 案例 3：优化搜索功能

**优化前：**
```typescript
// 每次输入都查询
const handleInput = async (query: string) => {
  const results = await search(query);
  updateResults(results);
};
```

**优化后：**
```typescript
import { debounce } from '@/utils/debounce';
import { withCache } from '@/utils/queryCache';

// 添加缓存
const cachedSearch = withCache(
  async (query: string) => await search(query),
  { ttl: 30000, maxSize: 50 }
);

// 添加防抖
const handleInput = debounce(async (query: string) => {
  const results = await cachedSearch(query);
  updateResults(results);
}, 300);
```

## 9. 性能检查清单

### 代码审查

- [ ] 没有循环中的 await
- [ ] 没有数组方法中的 await
- [ ] SQL 查询使用了具体字段而不是 SELECT *
- [ ] 批量操作使用了批量查询
- [ ] 高频事件使用了防抖或节流
- [ ] 组件卸载时清理了资源

### 性能测试

- [ ] 首次加载时间 < 2s
- [ ] 卡片渲染时间 < 16ms
- [ ] 数据库查询时间 < 100ms
- [ ] 内存使用稳定，无持续增长

### 监控

- [ ] 添加了性能监控
- [ ] 设置了性能预算
- [ ] 定期查看性能报告

## 10. 工具和资源

### 性能分析工具

- Chrome DevTools Performance
- Chrome DevTools Memory
- Vue DevTools Performance

### 相关文档

- [性能优化方案](../PERFORMANCE_OPTIMIZATION_PLAN.md)
- [性能优化总结](../PERFORMANCE_OPTIMIZATION_SUMMARY.md)
- [优化执行指南](../scripts/optimize-performance.md)
