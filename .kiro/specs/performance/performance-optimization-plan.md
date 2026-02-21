# 性能优化方案

## 目标
优化浏览器、复习队列、复习界面三个核心模块的性能，提升用户体验。

## 当前性能瓶颈分析

### 1. 浏览器 (SRSBrowser.vue)
- **问题1**: 每次数据加载都会触发多次 `loadData()`，导致重复请求
- **问题2**: AG-Grid 渲染大量数据时性能下降（2000+ 卡片）
- **问题3**: 预览面板每次点击都重新加载 Protyle
- **问题4**: 队列统计刷新频繁，每次操作都触发
- **问题5**: 缓存失效策略不够精细，经常全量刷新

### 2. 复习队列 (UnifiedQueueStrategy.ts)
- **问题1**: `next()` 方法每次都重新计算 nextDues，耗时较长
- **问题2**: 队列变更监听器触发频繁，导致不必要的重新加载
- **问题3**: 缺少队列项缓存，每次都从存储层读取

### 3. 复习界面 (ReviewContent.vue)
- **问题1**: Protyle 初始化耗时较长（100-200ms）
- **问题2**: 每次卡片切换都销毁并重建 Protyle 实例
- **问题3**: 答案显示/隐藏时重复应用 CSS 类
- **问题4**: 快速卡片/描述符卡检测每次都执行，缺少缓存

## 优化方案

### Phase 1: 浏览器性能优化

#### 1.1 数据加载优化
```typescript
// 目标：减少重复加载，添加请求去重
// 文件：src/ui/browser/SRSBrowser.vue

// ✅ 已实现：AbortController 取消重复请求
// 🆕 新增：请求去重（防抖 + 节流）
const loadDataDebounced = debounce(loadData, 300);
const loadDataThrottled = throttle(loadData, 1000);
```

#### 1.2 AG-Grid 虚拟滚动优化
```typescript
// 目标：优化大数据集渲染
// 文件：src/ui/browser/SRSBrowser.vue

const gridOptions = {
  animateRows: false,  // ✅ 已禁用
  suppressCellFocus: true,  // ✅ 已禁用
  rowBuffer: 20,  // 🆕 增加缓冲区（当前10 → 20）
  suppressColumnVirtualisation: false,  // 🆕 启用列虚拟化
  enableCellTextSelection: true,
  // 🆕 分页模式（可选，适用于超大数据集）
  pagination: true,
  paginationPageSize: 100,
  paginationPageSizeSelector: [50, 100, 200, 500],
}
```

#### 1.3 预览面板缓存
```typescript
// 目标：缓存 Protyle 实例，避免重复创建
// 文件：src/ui/browser/BrowserPreview.vue

const protyleCache = new Map<string, Protyle>();

function getOrCreateProtyle(blockId: string): Protyle {
  if (protyleCache.has(blockId)) {
    return protyleCache.get(blockId)!;
  }
  
  const protyle = new Protyle(/* ... */);
  protyleCache.set(blockId, protyle);
  
  // 限制缓存大小
  if (protyleCache.size > 10) {
    const firstKey = protyleCache.keys().next().value;
    protyleCache.get(firstKey)?.destroy();
    protyleCache.delete(firstKey);
  }
  
  return protyle;
}
```

#### 1.4 队列统计优化
```typescript
// 目标：减少队列统计刷新频率
// 文件：src/ui/browser/SRSBrowser.vue

// 🆕 使用节流，避免频繁刷新
const refreshQueueCountsThrottled = throttle(refreshQueueCounts, 2000);

// 🆕 批量操作后只刷新一次
async function handleBatchAction(actionId: string, cards: BrowserCard[]) {
  await performAction(actionId, cards);
  // 延迟刷新，等待所有操作完成
  await nextTick();
  await refreshQueueCountsThrottled();
}
```

#### 1.5 缓存策略优化
```typescript
// 目标：精细化缓存失效策略
// 文件：src/ui/browser/browserService.ts

// 🆕 按操作类型决定是否清除缓存
function shouldInvalidateCache(actionId: string): boolean {
  const invalidatingActions = [
    'delete-card',
    'reset',
    'suspend',
    'postpone',
    'advance',
  ];
  return invalidatingActions.includes(actionId);
}

// 🆕 部分缓存失效（只清除受影响的卡片）
function invalidateCardCachePartial(cardIds: string[]): void {
  for (const cardId of cardIds) {
    cardCache.delete(cardId);
  }
}
```

### Phase 2: 复习队列性能优化

#### 2.1 nextDues 计算缓存
```typescript
// 目标：缓存 nextDues 计算结果
// 文件：src/application/adapters/UnifiedQueueStrategy.ts

private nextDuesCache = new Map<string, Record<number, string>>();

private async addNextDues(card: FSRSCard): Promise<any> {
  const cacheKey = `${card.id}-${card.state}-${card.due}`;
  
  // 🆕 检查缓存
  if (this.nextDuesCache.has(cacheKey)) {
    return {
      ...card,
      nextDues: this.nextDuesCache.get(cacheKey),
    };
  }
  
  // 计算 nextDues
  const nextDues = await this.calculateNextDues(card);
  
  // 🆕 缓存结果
  this.nextDuesCache.set(cacheKey, nextDues);
  
  // 🆕 限制缓存大小
  if (this.nextDuesCache.size > 100) {
    const firstKey = this.nextDuesCache.keys().next().value;
    this.nextDuesCache.delete(firstKey);
  }
  
  return { ...card, nextDues };
}
```

#### 2.2 队列变更监听优化
```typescript
// 目标：减少不必要的重新加载
// 文件：src/application/adapters/UnifiedQueueStrategy.ts

private subscribeToQueueChanges(): void {
  // 🆕 使用防抖，避免频繁触发
  const debouncedReload = debounce(() => {
    this.invalidateCache();
    void this.reloadCards();
  }, 500);
  
  this.unsubscribe = this.queue.subscribe((event) => {
    // 🆕 只在必要时重新加载
    if (event.type === 'card-updated' || event.type === 'card-removed') {
      debouncedReload();
    }
  });
}
```

#### 2.3 队列项缓存
```typescript
// 目标：缓存队列项，减少存储层读取
// 文件：src/application/adapters/UnifiedQueueStrategy.ts

private queueItemsCache: FSRSCard[] | null = null;
private cacheTimestamp: number = 0;
private readonly CACHE_TTL = 5000; // 5秒

private async getQueueItems(): Promise<FSRSCard[]> {
  const now = Date.now();
  
  // 🆕 检查缓存是否有效
  if (this.queueItemsCache && (now - this.cacheTimestamp) < this.CACHE_TTL) {
    return this.queueItemsCache;
  }
  
  // 重新加载
  const items = await this.queue.getAllItems();
  this.queueItemsCache = items;
  this.cacheTimestamp = now;
  
  return items;
}
```

### Phase 3: 复习界面性能优化

#### 3.1 Protyle 实例复用
```typescript
// 目标：复用 Protyle 实例，避免重复创建
// 文件：src/ui/review/v2/ReviewContent.vue

const protylePool = new Map<string, Protyle>();
const MAX_POOL_SIZE = 3;

async function renderProtyle(blockId: string): Promise<void> {
  // 🆕 尝试从池中获取
  let protyle = protylePool.get(blockId);
  
  if (protyle) {
    // 复用现有实例
    hostRef.value.appendChild(protyle.element);
    return;
  }
  
  // 创建新实例
  protyle = new Protyle(/* ... */);
  
  // 🆕 加入池
  protylePool.set(blockId, protyle);
  
  // 🆕 限制池大小
  if (protylePool.size > MAX_POOL_SIZE) {
    const firstKey = protylePool.keys().next().value;
    protylePool.get(firstKey)?.destroy();
    protylePool.delete(firstKey);
  }
}
```

#### 3.2 CSS 类应用优化
```typescript
// 目标：避免重复应用 CSS 类
// 文件：src/ui/review/v2/ReviewContent.vue

let lastAppliedState: { hasHidden: boolean; showAnswer: boolean } | null = null;

function applyAnswerVisibility(): void {
  const element = hostRef.value;
  if (!element) return;
  
  const hasHidden = props.hasHiddenContent;
  const showAnswer = props.showAnswer;
  
  // 🆕 检查状态是否改变
  if (lastAppliedState &&
      lastAppliedState.hasHidden === hasHidden &&
      lastAppliedState.showAnswer === showAnswer) {
    return; // 状态未改变，跳过
  }
  
  // 应用 CSS 类
  // ...
  
  // 🆕 记录状态
  lastAppliedState = { hasHidden, showAnswer };
}
```

#### 3.3 卡片类型检测缓存
```typescript
// 目标：缓存卡片类型检测结果
// 文件：src/ui/review/v2/ReviewContent.vue

const cardTypeCache = new Map<string, {
  isQuick: boolean;
  isDescriptor: boolean;
  isConcept: boolean;
}>();

async function detectCardType(blockId: string) {
  // 🆕 检查缓存
  if (cardTypeCache.has(blockId)) {
    return cardTypeCache.get(blockId)!;
  }
  
  // 执行检测
  const isQuick = await quickCardRenderService.value.isQuickCard(blockId);
  const isDescriptor = await descriptorCardRenderService.value.isDescriptorCard(blockId);
  const isConcept = /* ... */;
  
  const result = { isQuick, isDescriptor, isConcept };
  
  // 🆕 缓存结果
  cardTypeCache.set(blockId, result);
  
  // 🆕 限制缓存大小
  if (cardTypeCache.size > 50) {
    const firstKey = cardTypeCache.keys().next().value;
    cardTypeCache.delete(firstKey);
  }
  
  return result;
}
```

#### 3.4 Protyle 初始化优化
```typescript
// 目标：延迟非关键渲染，优先显示内容
// 文件：src/ui/review/v2/ReviewContent.vue

async function renderProtyle(blockId: string): Promise<void> {
  // 🆕 立即显示加载状态
  hostRef.value.innerHTML = '<div class="loading">Loading...</div>';
  
  // 🆕 使用 requestIdleCallback 延迟非关键操作
  await new Promise(resolve => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => resolve(undefined));
    } else {
      setTimeout(() => resolve(undefined), 0);
    }
  });
  
  // 创建 Protyle
  const protyle = new Protyle(/* ... */);
  
  // 🆕 分阶段渲染
  protyle.render({
    lazy: true,  // 延迟加载图片等资源
    priority: 'content',  // 优先渲染内容
  });
}
```

## 实施计划

### Week 1: 浏览器优化
- Day 1-2: 数据加载优化 + AG-Grid 优化
- Day 3-4: 预览面板缓存 + 队列统计优化
- Day 5: 缓存策略优化 + 测试

### Week 2: 复习队列优化
- Day 1-2: nextDues 计算缓存
- Day 3: 队列变更监听优化
- Day 4: 队列项缓存
- Day 5: 测试 + 性能基准测试

### Week 3: 复习界面优化
- Day 1-2: Protyle 实例复用
- Day 3: CSS 类应用优化 + 卡片类型检测缓存
- Day 4: Protyle 初始化优化
- Day 5: 集成测试 + 性能报告

## 性能指标

### 目标
- 浏览器加载时间：< 500ms（当前 1-2s）
- 复习队列切换：< 200ms（当前 500ms）
- 复习界面卡片切换：< 150ms（当前 300-400ms）
- 内存占用：< 200MB（当前 300-400MB）

### 测试方法
```typescript
// 使用 PerformanceMonitor 测量
import { PerformanceMonitor } from '@/utils/performance';

// 浏览器加载
const loadTime = await PerformanceMonitor.measure('browserLoad', () => loadData());

// 队列切换
const switchTime = await PerformanceMonitor.measure('queueSwitch', () => handleSelectQueue(queueId));

// 卡片切换
const cardTime = await PerformanceMonitor.measure('cardSwitch', () => renderProtyle(blockId));
```

## 工具函数

### 防抖 (Debounce)
```typescript
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
```

### 节流 (Throttle)
```typescript
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  
  return function(...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}
```

### LRU 缓存
```typescript
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  
  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;
    
    // 移到最后（最近使用）
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    
    return value;
  }
  
  set(key: K, value: V): void {
    // 删除旧值
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // 添加新值
    this.cache.set(key, value);
    
    // 检查大小
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
  
  clear(): void {
    this.cache.clear();
  }
}
```

## 注意事项

1. **缓存失效策略**：确保缓存在数据更新后正确失效
2. **内存管理**：限制缓存大小，避免内存泄漏
3. **用户体验**：优化不应影响功能正确性
4. **向后兼容**：保持 API 兼容性
5. **测试覆盖**：添加性能测试用例

## 参考资料

- [AG-Grid Performance](https://www.ag-grid.com/javascript-data-grid/performance/)
- [Vue Performance](https://vuejs.org/guide/best-practices/performance.html)
- [Web Performance](https://web.dev/performance/)
