# 浏览器完全 DDD 化方案（激进版）

## 🎯 目标

完全移除 SRSBrowser.vue 对 `plugin` 的依赖，所有功能都通过 `browserService` 访问。

## 📊 当前问题分析

### 问题 1：数据源工厂依赖 UnifiedDataSourceManager

**位置**：`src/ui/browser/SRSBrowser.vue` line 556

```typescript
currentDataSource.value = createDeckDataSource(
  props.plugin.unifiedDataSourceManager,  // ❌ 依赖 plugin
  options, 
  props.currentDocId, 
  props.plugin
);
```

**影响**：
- 所有非队列模式的数据加载都会失败
- 队列模式也依赖 `props.plugin.unifiedDataSourceManager`

### 问题 2：队列操作依赖 plugin

**位置**：多处

```typescript
props.plugin.finalDrillQueue
props.plugin.hybridSyncService
props.plugin.storage
```

### 问题 3：数据源需要访问底层服务

数据源（DeckDataSource, FinalDrillDataSource 等）需要：
- UnifiedDataSourceManager
- StorageManager
- 各种 Queue

## 🏗️ 解决方案

### 方案 A：扩展 BrowserApplicationService（推荐）

让 `BrowserApplicationService` 提供所有浏览器需要的功能，包括：

1. **数据加载**（已有）
   - `getBrowserCards()`
   - `getDueCount()`
   - `getStats()`

2. **队列操作**（需要新增）
   - `getQueueCards(queueId, options)`
   - `getQueueStats(queueId)`
   - `rebuildQueue(queueId)`

3. **卡片操作**（需要新增）
   - `deleteCards(cardIds)`
   - `suspendCards(cardIds)`
   - `updateCardState(cardId, state)`
   - `adjustCardDue(cardId, days)`

4. **同步操作**（需要新增）
   - `syncCards()`
   - `getSyncStatus()`

### 方案 B：创建 BrowserFacade（备选）

创建一个门面类，封装所有浏览器需要的服务：

```typescript
class BrowserFacade {
  constructor(
    private browserService: BrowserApplicationService,
    private queueService: QueueApplicationService,
    private syncService: SyncApplicationService
  ) {}
  
  // 统一的接口
  async getCards(options) { ... }
  async getQueueCards(queueId, options) { ... }
  async deleteCards(cardIds) { ... }
  // ...
}
```

## 📝 实施计划（方案 A）

### Phase 1：扩展 BrowserApplicationService

#### 1.1 添加队列查询方法

```typescript
// src/application/services/BrowserApplicationService.ts

/**
 * 获取队列卡片
 */
async getQueueCards(query: GetQueueCardsQuery): Promise<GetQueueCardsQueryResult> {
  // 委托给 GetQueueCardsQueryHandler
}

/**
 * 获取队列统计
 */
async getQueueStats(queueId: string): Promise<QueueStats> {
  // 委托给 GetQueueStatsQueryHandler
}
```

#### 1.2 添加卡片操作命令

```typescript
/**
 * 删除卡片
 */
async deleteCards(command: DeleteCardsCommand): Promise<void> {
  // 委托给 DeleteCardsUseCase
}

/**
 * 暂停卡片
 */
async suspendCards(command: SuspendCardsCommand): Promise<void> {
  // 委托给 SuspendCardsUseCase
}
```

### Phase 2：修改 SRSBrowser.vue

#### 2.1 移除 plugin prop

```typescript
const props = defineProps<{
  app?: App;
  i18n?: Record<string, string>;
  currentDocId?: string;
  mode?: 'dialog' | 'tab' | 'dock';
  browserService: BrowserApplicationService;  // ✅ 必需
}>();
```

#### 2.2 修改数据加载逻辑

```typescript
async function loadData(forceRefresh = false) {
  // ✅ 使用 browserService
  if (activeQueueId.value) {
    const result = await props.browserService.getQueueCards({
      queueId: activeQueueId.value,
      preset: currentPreset.value,
      searchText: searchQuery.value,
      sortBy: currentSortField.value,
      sortOrder: currentSortOrder.value,
      forceRefresh,
    });
    rows.value = result.cards;
  } else {
    const result = await props.browserService.getBrowserCards({
      preset: currentPreset.value,
      searchText: searchQuery.value,
      sortBy: currentSortField.value,
      sortOrder: currentSortOrder.value,
      forceRefresh,
    });
    rows.value = result.cards;
  }
}
```

#### 2.3 修改卡片操作

```typescript
async function handleDeleteCards(cardIds: string[]) {
  await props.browserService.deleteCards({ cardIds });
  await loadData(true);
}
```

### Phase 3：移除数据源工厂

数据源工厂（DeckDataSource, FinalDrillDataSource 等）将被废弃，所有数据加载都通过 `browserService`。

## 🚧 工作量评估

| 任务 | 复杂度 | 预计时间 |
|------|--------|---------|
| 扩展 BrowserApplicationService | 高 | 2-3 小时 |
| 创建新的 Query/Command | 中 | 1-2 小时 |
| 修改 SRSBrowser.vue | 高 | 2-3 小时 |
| 测试和调试 | 高 | 2-3 小时 |
| **总计** | | **7-11 小时** |

## ⚠️ 风险

1. **破坏现有功能**：数据源工厂被大量使用，移除可能导致功能缺失
2. **测试覆盖不足**：需要大量手动测试
3. **回滚困难**：改动较大，回滚成本高

## 🎯 最小可行方案（MVP）

为了降低风险，我们采用最小可行方案：

### MVP 范围

1. ✅ 只处理最常用的场景：
   - 全部卡片模式（非队列）
   - 基本的过滤和排序
   - 基本的卡片操作（删除、暂停）

2. ✅ 保留数据源工厂：
   - 队列模式仍然使用数据源工厂
   - SQL 查询模式仍然使用 QueryDataSource

3. ✅ 渐进式迁移：
   - 先让非队列模式完全使用 browserService
   - 队列模式后续再迁移

### MVP 实施步骤

#### Step 1：修改 loadData 函数

```typescript
async function loadData(forceRefresh = false) {
  loading.value = true;
  try {
    selectedRows.value = [];
    previewCard.value = null;

    // ========================================================================
    // ✅ 队列模式：保留数据源工厂（暂不迁移）
    // ========================================================================
    if (activeQueueId.value) {
      // 保持原有逻辑
      currentDataSource.value = createQueueDataSource(...);
      await executeFetchRows(forceRefresh);
      return;
    }

    // ========================================================================
    // ✅ 非队列模式：使用 browserService（完全 DDD 化）
    // ========================================================================
    const sqlStmt = extractSqlStatement(searchQuery.value);
    if (sqlStmt != null) {
      // SQL 模式：保留 QueryDataSource
      currentDataSource.value = createQueryDataSource(sqlStmt);
      await executeFetchRows(forceRefresh);
    } else {
      // ✅ 全部卡片模式：使用 browserService
      const result = await props.browserService.getBrowserCards({
        preset: currentPreset.value as PresetFilter,
        searchText: searchQuery.value,
        cardTypes: currentCardType.value !== 'all' ? [currentCardType.value.replace('-only', '')] : undefined,
        sortBy: currentSortField.value as any,
        sortOrder: currentSortOrder.value as any,
        forceRefresh,
        pageSize: 10000,
      });
      
      rows.value = result.cards;
      allRows.value = result.cards;  // 全量数据
      rowsForFocus.value = result.cards;
      
      // 清除数据源（不再使用）
      currentDataSource.value = null;
    }
  } catch (err) {
    console.error('[SiYuanMemo][CardBrowser] Load data error:', err);
    rows.value = [];
  } finally {
    loading.value = false;
  }
}
```

#### Step 2：处理 browserService 不存在的情况

```typescript
// 在组件初始化时检查
onMounted(() => {
  if (!props.browserService) {
    console.error('[SiYuanMemo][SRSBrowser] browserService is required!');
    pushErrMsg('浏览器服务未初始化');
    return;
  }
  
  // 初始化逻辑
  void loadData();
});
```

## 📋 下一步行动

1. 实施 MVP Step 1：修改 loadData 函数
2. 测试非队列模式
3. 如果成功，继续迁移队列模式
4. 如果失败，回滚并重新评估

## ✅ 成功标准

- [ ] 非队列模式完全使用 browserService
- [ ] 不依赖 props.plugin（非队列模式）
- [ ] 基本功能正常（加载、过滤、排序）
- [ ] 没有 TypeScript 错误
- [ ] 没有运行时错误
