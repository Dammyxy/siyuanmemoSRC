# 插件性能优化方案

## 概述
本文档提供了 SiyuanMemo 插件的全面性能优化方案，涵盖构建优化、运行时优化、内存管理和代码质量提升。

## 1. 构建优化

### 1.1 Vite 配置优化（保持单文件打包）

**当前配置：**
- ✅ 已配置单文件打包（`inlineDynamicImports: true`）
- ✅ 已禁用代码分割（`manualChunks: undefined`）
- 这是思源插件的标准配置，保持不变

**生产环境优化：**

```typescript
// vite.config.ts 优化建议（仅针对生产环境压缩）
export default defineConfig({
  build: {
    // 生产环境启用压缩
    minify: !isWatch ? 'terser' : false,
    terserOptions: !isWatch ? {
      compress: {
        drop_console: true,      // 移除 console.log
        drop_debugger: true,     // 移除 debugger
        pure_funcs: [            // 移除特定函数调用
          'console.log',
          'console.debug',
          'console.info'
        ]
      },
      format: {
        comments: false          // 移除注释
      }
    } : undefined,
    
    // 保持现有配置
    rollupOptions: {
      output: {
        manualChunks: undefined,      // 不分割代码
        inlineDynamicImports: true,   // 内联动态导入
      }
    }
  }
})
```

### 1.2 依赖审查

**建议：**
- 审查并移除未使用的依赖
- 检查依赖版本，使用最新稳定版
- 避免引入过大的第三方库

## 2. 运行时性能优化

### 2.1 移除生产环境 Console 日志

**当前问题：**
- 代码中存在大量 `console.log`、`console.debug` 调用
- 影响运行时性能，特别是在循环和高频调用中

**优化方案：**

创建生产环境日志包装器：

```typescript
// src/utils/logger.ts 增强版
export class Logger {
  private static isDev = process.env.NODE_ENV === 'development';
  
  static log(...args: any[]) {
    if (this.isDev) console.log(...args);
  }
  
  static debug(...args: any[]) {
    if (this.isDev) console.debug(...args);
  }
  
  static warn(...args: any[]) {
    console.warn(...args); // 警告始终显示
  }
  
  static error(...args: any[]) {
    console.error(...args); // 错误始终显示
  }
  
  // 性能监控专用
  static perf(label: string, fn: () => void) {
    if (!this.isDev) return fn();
    
    const start = performance.now();
    fn();
    const duration = performance.now() - start;
    console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
  }
}
```

### 2.2 数据库查询优化

**优化建议：**

1. **批量查询优化**
```typescript
// 使用现有的 batchQuery 工具
import { batchQuery } from '@/utils/batchQuery';

// 批量获取卡片数据
const cards = await batchQuery(cardIds, async (ids) => {
  return await fetchCardsByIds(ids);
}, { batchSize: 50 }); // 调整批次大小
```

2. **查询结果缓存**
```typescript
// src/utils/queryCache.ts
export class QueryCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl = 5000; // 5秒缓存
  
  get(key: string) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  set(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
    
    // 限制缓存大小
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
  
  clear() {
    this.cache.clear();
  }
}
```

3. **索引优化**
- 确保数据库查询使用了正确的索引
- 避免全表扫描

### 2.3 Vue 组件优化

**优化建议：**

1. **使用 `v-memo` 缓存渲染结果**
```vue
<template>
  <div v-memo="[card.id, card.due]">
    <!-- 只在 card.id 或 card.due 变化时重新渲染 -->
  </div>
</template>
```

2. **使用 `v-once` 渲染静态内容**
```vue
<template>
  <div v-once>
    <!-- 只渲染一次的静态内容 -->
  </div>
</template>
```

3. **虚拟滚动优化大列表**
```typescript
// 对于 ag-grid，已经内置虚拟滚动
// 确保配置正确
const gridOptions = {
  rowModelType: 'clientSide',
  rowBuffer: 10, // 缓冲行数
  suppressColumnVirtualisation: false
};
```

4. **组件懒加载**
```typescript
// 路由级别懒加载
const ReviewDialog = defineAsyncComponent(() => 
  import('@/ui/review/ReviewDialog.vue')
);

// 条件渲染懒加载
const HeavyComponent = defineAsyncComponent({
  loader: () => import('./HeavyComponent.vue'),
  delay: 200,
  timeout: 3000
});
```

### 2.4 事件处理优化

**优化建议：**

1. **防抖和节流**
```typescript
// src/utils/debounce.ts
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return function(...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function(...args: Parameters<T>) {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
```

2. **使用事件委托**
```typescript
// 避免为每个元素添加事件监听器
// 使用事件委托到父元素
container.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target.matches('.card-item')) {
    handleCardClick(target);
  }
});
```

### 2.5 WebSocket 优化

**优化建议：**

1. **消息批处理**
```typescript
// src/services/QuickCardWebSocketService.ts 优化
class MessageBatcher {
  private queue: any[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  
  add(message: any) {
    this.queue.push(message);
    
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush();
      }, 100); // 100ms 批处理
    }
  }
  
  flush() {
    if (this.queue.length > 0) {
      this.processBatch(this.queue);
      this.queue = [];
    }
    this.timer = null;
  }
  
  processBatch(messages: any[]) {
    // 批量处理消息
  }
}
```

2. **连接池管理**
- 复用 WebSocket 连接
- 实现自动重连机制
- 添加心跳检测

## 3. 内存管理优化

### 3.1 内存泄漏防护

**优化建议：**

1. **清理事件监听器**
```typescript
// Vue 组件中
onBeforeUnmount(() => {
  // 清理事件监听器
  eventBus.off('event-name', handler);
  
  // 清理定时器
  clearInterval(intervalId);
  
  // 清理 WebSocket
  ws?.close();
});
```

2. **WeakMap 缓存**
```typescript
// 使用 WeakMap 避免内存泄漏
const cache = new WeakMap<object, any>();

function getCachedData(key: object) {
  if (!cache.has(key)) {
    cache.set(key, computeExpensiveData(key));
  }
  return cache.get(key);
}
```

3. **限制缓存大小**
```typescript
// 使用 LRU 缓存
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 移到最后（最近使用）
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }
  
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最久未使用的项
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

### 3.2 大数据处理优化

**优化建议：**

1. **分页加载**
```typescript
// 实现游标分页
async function loadCardsPaginated(cursor: string | null, limit: number) {
  const query = `
    SELECT * FROM cards 
    WHERE ${cursor ? `id > '${cursor}'` : '1=1'}
    ORDER BY id 
    LIMIT ${limit}
  `;
  
  const cards = await sql(query);
  const nextCursor = cards.length > 0 ? cards[cards.length - 1].id : null;
  
  return { cards, nextCursor };
}
```

2. **流式处理**
```typescript
// 使用异步迭代器处理大数据集
async function* processCardsInBatches(cardIds: string[], batchSize: number) {
  for (let i = 0; i < cardIds.length; i += batchSize) {
    const batch = cardIds.slice(i, i + batchSize);
    const cards = await fetchCards(batch);
    yield cards;
  }
}

// 使用
for await (const batch of processCardsInBatches(allCardIds, 100)) {
  processBatch(batch);
}
```

## 4. 代码质量优化

### 4.1 TypeScript 优化

**优化建议：**

1. **使用类型守卫减少运行时检查**
```typescript
// 使用类型守卫
function isCard(obj: any): obj is Card {
  return obj && typeof obj.id === 'string' && typeof obj.due === 'number';
}

// 避免重复类型检查
if (isCard(data)) {
  // TypeScript 知道 data 是 Card 类型
  processCard(data);
}
```

2. **使用 const assertions**
```typescript
// 使用 as const 获得更精确的类型
const CARD_TYPES = ['concept', 'descriptor', 'retrieval'] as const;
type CardType = typeof CARD_TYPES[number]; // 'concept' | 'descriptor' | 'retrieval'
```

### 4.2 算法优化

**优化建议：**

1. **使用 Set 和 Map 提升查找性能**
```typescript
// 避免使用 Array.includes() 在大数组中查找
// 使用 Set
const cardIdSet = new Set(cardIds);
if (cardIdSet.has(targetId)) {
  // O(1) 查找
}

// 使用 Map 存储键值对
const cardMap = new Map(cards.map(c => [c.id, c]));
const card = cardMap.get(cardId); // O(1) 查找
```

2. **避免不必要的数组操作**
```typescript
// 避免
const filtered = array.filter(x => condition(x));
const mapped = filtered.map(x => transform(x));

// 优化：合并操作
const result = array.reduce((acc, x) => {
  if (condition(x)) {
    acc.push(transform(x));
  }
  return acc;
}, []);
```

3. **使用二分查找**
```typescript
// 对于已排序数组，使用二分查找
function binarySearch(arr: number[], target: number): number {
  let left = 0;
  let right = arr.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  
  return -1;
}
```

## 5. 性能监控

### 5.1 增强性能监控工具

```typescript
// src/utils/performance.ts 增强版
export class PerformanceMonitor {
  private static enabled = process.env.NODE_ENV === 'development';
  
  // 添加性能标记
  static mark(name: string) {
    if (this.enabled && performance.mark) {
      performance.mark(name);
    }
  }
  
  // 测量两个标记之间的时间
  static measure(name: string, startMark: string, endMark: string) {
    if (this.enabled && performance.measure) {
      try {
        performance.measure(name, startMark, endMark);
        const measure = performance.getEntriesByName(name)[0];
        console.log(`[PERF] ${name}: ${measure.duration.toFixed(2)}ms`);
      } catch (e) {
        // 标记不存在
      }
    }
  }
  
  // 监控函数执行时间
  static async measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    threshold = 100 // 超过阈值才记录
  ): Promise<T> {
    if (!this.enabled) return fn();
    
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const duration = performance.now() - start;
      if (duration > threshold) {
        console.warn(`[PERF] ${name} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`);
      }
    }
  }
  
  // 内存使用监控
  static logMemoryUsage() {
    if (this.enabled && performance.memory) {
      const memory = (performance as any).memory;
      console.log('[MEMORY]', {
        used: `${(memory.usedJSHeapSize / 1048576).toFixed(2)} MB`,
        total: `${(memory.totalJSHeapSize / 1048576).toFixed(2)} MB`,
        limit: `${(memory.jsHeapSizeLimit / 1048576).toFixed(2)} MB`
      });
    }
  }
}
```

### 5.2 性能预算

设置性能预算，确保关键操作在可接受的时间内完成：

```typescript
// src/utils/performanceBudget.ts
export const PERFORMANCE_BUDGETS = {
  // 数据库查询
  'db:query:single': 50,      // 单次查询 < 50ms
  'db:query:batch': 200,      // 批量查询 < 200ms
  
  // UI 渲染
  'ui:render:card': 16,       // 卡片渲染 < 16ms (60fps)
  'ui:render:list': 100,      // 列表渲染 < 100ms
  
  // 网络请求
  'network:api': 500,         // API 请求 < 500ms
  'network:websocket': 100,   // WebSocket 消息 < 100ms
  
  // 算法计算
  'algo:fsrs': 10,            // FSRS 计算 < 10ms
  'algo:sort': 50,            // 排序 < 50ms
};

export function checkBudget(name: keyof typeof PERFORMANCE_BUDGETS, duration: number) {
  const budget = PERFORMANCE_BUDGETS[name];
  if (duration > budget) {
    console.warn(`⚠️ Performance budget exceeded: ${name} took ${duration.toFixed(2)}ms (budget: ${budget}ms)`);
  }
}
```

## 6. 实施计划

### 阶段 1：快速优化（1-2天）
1. ✅ 配置生产环境移除 console 日志（Terser）
2. ✅ 添加防抖节流到高频事件
3. ✅ 清理代码中的 console.log（开发环境使用 Logger）

### 阶段 2：中期优化（3-5天）
1. ✅ 实现查询缓存
2. ✅ 优化 Vue 组件渲染
3. ✅ WebSocket 消息批处理
4. ✅ 内存泄漏检查和修复

### 阶段 3：深度优化（1-2周）
1. ✅ 数据库查询优化
2. ✅ 算法优化
3. ✅ 组件懒加载（defineAsyncComponent）
4. ✅ 性能监控系统完善

## 7. 性能测试

### 7.1 基准测试

创建性能测试套件：

```typescript
// src/__tests__/performance/benchmark.test.ts
import { describe, it, expect } from 'vitest';
import { PerformanceMonitor } from '@/utils/performance';

describe('Performance Benchmarks', () => {
  it('should load 1000 cards within budget', async () => {
    const duration = await PerformanceMonitor.measureAsync(
      'load-1000-cards',
      async () => {
        await loadCards(1000);
      }
    );
    
    expect(duration).toBeLessThan(500); // 500ms 预算
  });
  
  it('should render card list within 16ms', async () => {
    const duration = await PerformanceMonitor.measureSync(
      'render-card-list',
      () => {
        renderCardList(cards);
      }
    );
    
    expect(duration).toBeLessThan(16); // 60fps
  });
});
```

### 7.2 性能回归测试

在 CI/CD 中集成性能测试，防止性能退化。

## 8. 监控和维护

### 8.1 生产环境监控

1. 添加性能指标收集
2. 设置性能告警
3. 定期性能审计

### 8.2 持续优化

1. 定期审查性能报告
2. 识别性能瓶颈
3. 迭代优化

## 总结

本优化方案涵盖了从构建到运行时的全方位性能提升策略。建议按照实施计划逐步推进，每个阶段完成后进行性能测试，确保优化效果。

关键优化点：
- 🚀 移除生产环境日志（立即见效）
- 🎯 数据库查询优化（显著提升）
- 💾 内存管理优化（稳定性提升）
- 📊 性能监控系统（持续改进）

## 注意事项

### 思源插件打包要求
- ✅ 必须打包成单个文件（已配置）
- ✅ 不能使用代码分割（已禁用）
- ✅ 所有依赖必须内联（已配置）
- ✅ 外部依赖：siyuan, process, electron

### 优化重点
本方案专注于运行时性能优化，不改变现有打包配置：
1. 代码质量优化（算法、数据结构）
2. 运行时性能优化（缓存、防抖节流）
3. 内存管理优化（避免泄漏、限制缓存）
4. 生产环境代码压缩（移除日志、注释）
