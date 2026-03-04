# 浏览器性能优化方案

## 性能瓶颈分析

### 1. 频繁的数据重新加载

**问题**：
- 观察者回调中，`card-updated` 和 `card-deleted` 事件都会触发 `loadData(true)` 完全重新加载
- 每次复习评分都会触发一次完全重新加载
- 复习 10 张卡片 = 10 次完全重新加载

**影响**：
- 大量的数据库查询
- 大量的 DOM 更新
- AG-Grid 重新渲染所有行

### 2. 重复的队列统计刷新

**问题**：
- `loadData()` 结束时调用 `refreshQueueCounts()`
- 观察者回调中又调用一次 `refreshQueueCounts()`
- 同一个操作触发两次队列统计刷新

### 3. 缺少防抖和节流

**问题**：
- 观察者回调没有防抖，连续的卡片更新会触发多次刷新
- 批量操作（如批量修改优先级）会触发多次刷新

### 4. 不必要的全量数据加载

**问题**：
- 每次 `loadData()` 都会加载 `allRows`（用于全局统计）
- 即使只是单张卡片更新，也要重新加载所有卡片

## 优化方案（保持 DDD 架构）

### 优化 1：增量更新替代完全重新加载

**原理**：
- 卡片更新时，只更新受影响的行，不重新加载所有数据
- 利用 AG-Grid 的 `applyTransaction` API 进行增量更新

**实现**：

```typescript
// 在 SRSBrowser.vue 中
async function handleCardUpdated(cardIds: string[]) {
  if (!gridApi.value) {
    // 降级：如果 Grid 未初始化，完全重新加载
    await loadData(true);
    return;
  }
  
  try {
    // 1. 从数据源获取更新后的卡片数据
    const updatedCards = await loadQueueCards(cardIds);
    
    // 2. 更新 rows.value 中的数据
    const updatedMap = new Map(updatedCards.map(c => [c.blockId, c]));
    for (const card of rows.value) {
      const updated = updatedMap.get(card.blockId);
      if (updated) {
        Object.assign(card, updated);
      }
    }
    
    // 3. 使用 AG-Grid 的增量更新 API
    const rowsToUpdate = rows.value.filter(c => cardIds.includes(c.blockId));
    gridApi.value.applyTransaction({ update: rowsToUpdate });
    
    // 4. 只刷新队列统计（不重新加载数据）
    await refreshQueueCounts();
    
    console.log(`[SRSBrowser] ✅ Incremental update: ${cardIds.length} cards`);
  } catch (error) {
    console.error('[SRSBrowser] Incremental update failed, falling back to full reload:', error);
    await loadData(true);
  }
}
```

### 优化 2：防抖观察者回调

**原理**：
- 使用防抖，合并短时间内的多次更新
- 批量操作只触发一次刷新

**实现**：

```typescript
// 在 SRSBrowser.vue 中
let dataChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCardIds = new Set<string>();

function handleDataChangeDebounced(event: DataChangeEvent) {
  // 收集待更新的卡片 ID
  if (event.cardIds) {
    event.cardIds.forEach(id => pendingCardIds.add(id));
  }
  
  // 清除之前的定时器
  if (dataChangeDebounceTimer) {
    clearTimeout(dataChangeDebounceTimer);
  }
  
  // 设置新的定时器（300ms 防抖）
  dataChangeDebounceTimer = setTimeout(async () => {
    const cardIds = Array.from(pendingCardIds);
    pendingCardIds.clear();
    
    console.log(`[SRSBrowser] Processing batched updates: ${cardIds.length} cards`);
    
    switch (event.type) {
      case 'card-updated':
        await handleCardUpdated(cardIds);
        break;
      case 'card-deleted':
        await handleCardDeleted(cardIds);
        break;
      case 'queue-changed':
        await refreshQueueCounts();
        break;
      case 'mode-switched':
        await loadData();
        break;
    }
  }, 300);
}
```

### 优化 3：懒加载全局统计

**原理**：
- `allRows` 只在需要时加载（切换到"全部"视图时）
- 队列视图不需要加载全局统计

**实现**：

```typescript
// 在 SRSBrowser.vue 中
async function loadData(forceRefresh = false) {
  // ... 现有逻辑 ...
  
  // ✅ 只在非队列模式下加载全局统计
  if (!activeQueueId.value) {
    allRows.value = await PerformanceMonitor.measure('loadAllCards', () => 
      loadCards('all', undefined, '', forceRefresh, 'all', props.plugin)
    );
  } else {
    // 队列模式：延迟加载全局统计
    if (allRows.value.length === 0) {
      // 后台加载，不阻塞 UI
      void loadCards('all', undefined, '', forceRefresh, 'all', props.plugin)
        .then(cards => { allRows.value = cards; });
    }
  }
  
  // ... 现有逻辑 ...
}
```

### 优化 4：避免重复的队列统计刷新

**原理**：
- `loadData()` 结束时不调用 `refreshQueueCounts()`
- 只在观察者回调中调用一次

**实现**：

```typescript
// 在 SRSBrowser.vue 中
async function loadData(forceRefresh = false) {
  // ... 现有逻辑 ...
  
  // ❌ 移除：await refreshQueueCounts();
  
  // ... 现有逻辑 ...
}

// 在 onMounted 中
browserAdapter.value.setOnDataChangeCallback((event: DataChangeEvent) => {
  // ... 现有逻辑 ...
  
  // ✅ 统一在这里刷新队列统计
  if (event.type !== 'mode-switched') {
    void refreshQueueCounts();
  }
});
```

### 优化 5：虚拟滚动（AG-Grid 已内置）

**说明**：
- AG-Grid 已经内置了虚拟滚动
- 只渲染可见的行，不渲染屏幕外的行
- 无需额外配置

### 优化 6：缓存优化

**原理**：
- 增加缓存有效期（从 30 秒增加到 60 秒）
- 减少不必要的缓存失效

**实现**：

```typescript
// 在 browserService.ts 中
const CACHE_TTL = 60 * 1000; // 从 30 秒增加到 60 秒
```

## 优化效果预估

### 优化前

- 复习 10 张卡片：10 次完全重新加载
- 每次加载：查询所有卡片 + 渲染所有行
- 总耗时：~5-10 秒（取决于卡片数量）

### 优化后

- 复习 10 张卡片：1 次批量增量更新（防抖）
- 每次更新：只查询 10 张卡片 + 只更新 10 行
- 总耗时：~0.3-0.5 秒

**性能提升：10-20 倍**

## 实施步骤

### 第一阶段：核心优化（立即实施）

1. ✅ 实现增量更新 `handleCardUpdated()`
2. ✅ 添加防抖 `handleDataChangeDebounced()`
3. ✅ 移除重复的 `refreshQueueCounts()` 调用

### 第二阶段：进一步优化（可选）

4. ✅ 懒加载全局统计
5. ✅ 增加缓存有效期
6. ✅ 添加性能监控日志

### 第三阶段：测试和调优

7. ✅ 测试各种场景（复习、批量操作、搜索等）
8. ✅ 根据实际情况调整防抖时间
9. ✅ 监控性能指标

## 保持 DDD 架构

### 领域层（Domain Layer）

- ✅ 不变：`FSRSCard`、`BrowserCard` 等领域模型
- ✅ 不变：业务逻辑保持在领域服务中

### 应用层（Application Layer）

- ✅ 不变：`UnifiedDataSourceManager`、`SRSBrowserAdapter` 等应用服务
- ✅ 增强：添加增量更新能力

### 表现层（Presentation Layer）

- ✅ 优化：`SRSBrowser.vue` 使用增量更新和防抖
- ✅ 不变：组件职责保持清晰

### 基础设施层（Infrastructure Layer）

- ✅ 优化：`browserService.ts` 增加缓存有效期
- ✅ 不变：数据访问逻辑保持不变

## 注意事项

1. **向后兼容**：增量更新失败时自动降级到完全重新加载
2. **数据一致性**：确保增量更新后数据与服务器一致
3. **测试覆盖**：添加单元测试和集成测试
4. **性能监控**：使用 `PerformanceMonitor` 监控优化效果

## 相关文件

- `src/ui/browser/SRSBrowser.vue` - 主要优化目标
- `src/ui/browser/SRSBrowserAdapter.ts` - 观察者适配器
- `src/ui/browser/browserService.ts` - 缓存服务
- `src/managers/UnifiedDataSourceManager.ts` - 数据源管理器

## 总结

通过增量更新、防抖、懒加载和缓存优化，可以将浏览器性能提升 10-20 倍，同时保持 DDD 架构的清晰性和可维护性。

核心思想：**只更新变化的部分，而不是重新加载所有数据**。
