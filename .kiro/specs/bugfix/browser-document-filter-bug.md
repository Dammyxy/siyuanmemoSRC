# 浏览器文档筛选失效问题

## 问题描述

在浏览器中点击文档列表中的文档进行筛选时，筛选失效。虽然系统识别到了文档点击事件并尝试应用筛选，但最终显示的卡片数量不正确。

## 复现步骤

1. 打开浏览器（SRSBrowser）
2. 在左侧文档列表中点击某个文档
3. 观察右侧卡片列表的筛选结果
4. 查看控制台日志

## 实际行为

从日志可以看到：

```
[SiYuanMemo][SRSBrowser] 🔍 focusedDocIds computed: {shouldFocusDocList: true, rowsForFocusCount: 64, cardsWithRootId: 63, allRootIds: Array(64), rootIdCounts: {…}, …}
[SiYuanMemo][BrowserHierarchy] 🔍 After filtering: {filteredCardsCount: 63, sampleFiltered: Array(3)}
[SiYuanMemo][DataAccessFacade] Cards needing data: 46 need rootId, 46 need content
[SiYuanMemo][DataAccessFacade] ✅ Filled rootId for 46 cards, content for 46 cards
```

关键问题：
1. 点击文档后，`handleSelectDoc` 被调用，设置了 `activeDocId.value`
2. `loadData()` 被触发，进入队列模式分支
3. 创建队列数据源时传入了 `docId` 参数
4. 但是筛选时 `card.rootId` 字段还没有填充
5. `DataAccessFacade` 在后续才填充 `rootId`，但此时筛选已经完成

## 预期行为

1. 用户点击文档列表中的某个文档时，`activeDocId.value` 应该被设置为该文档的 ID
2. 队列数据源应该使用 `docId` 参数进行筛选
3. 筛选逻辑应该正确比较 `card.rootId` 和 `docId`
4. 浏览器应该只显示属于该文档的卡片

## 根本原因分析

### 问题定位 ✅

通过分析日志和代码，确认了问题的根本原因：

**`rootId` 填充时机问题：**

1. **队列返回卡片时**：
   - `RetrievalPracticeQueue.getCards()` 调用 `manager.getCards()`
   - 返回的 `FSRSCard` 对象的 `meta.rootId` 字段可能为空

2. **数据源转换时**：
   - `RetrievalDataSource.convertToBrowserCard()` 从 `card.meta?.rootId` 提取 `rootId`
   - 如果 `meta.rootId` 为空，`BrowserCard.rootId` 也为空

3. **筛选执行时**：
   - `RetrievalDataSource.applyFilters()` 执行 `c.rootId === this.options.docId`
   - 因为 `rootId` 为空，筛选失败，所有卡片都被过滤掉

4. **后续填充**：
   - `DataAccessFacade.fillMissingRootIds()` 才填充 `rootId`
   - 但此时筛选已经完成，为时已晚

### 数据流分析

```
RetrievalPracticeQueue.getCards()
  ↓ 返回 FSRSCard[] (meta.rootId 可能为空)
  ↓
RetrievalDataSource.fetchRows()
  ↓ 调用 convertToBrowserCard()
  ↓ 提取 card.meta?.rootId → BrowserCard.rootId
  ↓
RetrievalDataSource.applyFilters()
  ↓ 执行 c.rootId === this.options.docId
  ↓ ❌ 筛选失败（rootId 为空）
  ↓
返回空数组或错误的结果
  ↓
DataAccessFacade.fillMissingRootIds()
  ↓ ✅ 填充 rootId（但已经太晚了）
```

## 解决方案

### 方案 1：在 DataAccessFacade.getCards() 中填充 rootId（推荐）✅

修改 `DataAccessFacade.getCards()` 方法，在返回卡片前自动填充 `rootId`：

**优点**：
- 符合 DDD 原则：`DataAccessFacade` 是应用层的数据访问门面
- 职责清晰：数据访问层负责确保数据完整性
- 一次性解决所有调用路径的问题
- 不影响现有架构

**缺点**：
- 每次调用 `getCards()` 都会填充，可能有轻微性能影响（但可以通过缓存优化）

**实现位置**：
- `src/application/queries/DataAccessFacade.ts` 的 `getCards()` 方法

**实现代码**：
```typescript
async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
    // 现有的查询逻辑...
    const cards = await this.cardService.getCards(filter);
    
    // 🆕 自动填充 rootId（在返回前）
    await this.fillMissingRootIds(cards);
    
    return cards;
}
```

### 方案 2：在队列层面填充 rootId

修改 `UnifiedDataSourceManager.getCards()` 方法，确保返回的卡片已经包含 `meta.rootId` 字段：

**优点**：
- 符合 DDD 原则：数据源头保证数据完整性

**缺点**：
- ❌ 违反 DDD 架构：`UnifiedDataSourceManager`（应用层）不应该直接依赖 `BlockRepository`（基础设施层）
- ❌ 职责混乱：`UnifiedDataSourceManager` 是数据源管理器，不应该负责数据填充
- 需要修改核心数据管理器
- 可能影响性能（需要额外查询）

**不推荐原因**：
这个方案违反了 DDD 的依赖倒置原则。应用层不应该直接依赖基础设施层的具体实现。

### 方案 3：在数据源转换时同步填充 rootId

修改 `RetrievalDataSource.fetchRows()` 方法，在转换前批量填充 `rootId`：

**优点**：
- 不影响队列层
- 可以批量查询，性能较好

**缺点**：
- 需要在每个数据源中重复实现
- 违反 DRY 原则
- 数据源层不应该负责数据填充

**实现位置**：
- `src/ui/browser/datasource/RetrievalDataSource.ts` 的 `fetchRows()` 方法
- 其他队列数据源也需要类似修改

### 推荐方案

**方案 1** 最合理：在 `DataAccessFacade.getCards()` 中填充 `rootId`，符合 DDD 原则和单一职责原则。

## 实现计划

### 步骤 1：添加调试日志（已完成）✅

在 `RetrievalDataSource.applyFilters()` 中添加了调试日志，用于确认问题。

### 步骤 2：修改 DataAccessFacade.getCards()（待实现）

在 `getCards()` 方法中，返回卡片前自动填充 `rootId`：

```typescript
async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
    // 1. 从缓存或数据库获取卡片
    const now = Date.now();
    const cacheValid = this.cardsCache && (now - this.cardsCacheTimestamp) < this.CACHE_TTL;
    
    if (cacheValid && !filter) {
        return this.cardsCache!;
    }
    
    // 2. 查询卡片
    const cards = await this.cardService.getCards(filter);
    
    // 3. 🆕 自动填充 rootId 和 content
    const cardsNeedingData = cards.filter(c => 
        !c.meta?.rootId || !c.meta?.content || String(c.meta.content).trim() === ''
    );
    
    if (cardsNeedingData.length > 0) {
        console.log(`[SiYuanMemo][DataAccessFacade] 🔧 Filling missing rootId/content for ${cardsNeedingData.length} cards`);
        await this.fillMissingRootIds(cardsNeedingData);
    }
    
    // 4. 缓存结果
    if (!filter) {
        this.cardsCache = cards;
        this.cardsCacheTimestamp = now;
    }
    
    return cards;
}
```

### 步骤 3：测试验证

1. 重新编译项目：`npm run build`
2. 重启思源笔记
3. 打开浏览器
4. 点击文档列表中的文档
5. 查看控制台日志，确认：
   - `cardsWithRootId` 的数量等于 `totalCards`
   - `filteredCount` 大于 0
   - 浏览器显示正确的卡片

## 相关文件

- `src/ui/browser/SRSBrowser.vue` - 浏览器 UI 组件，`handleSelectDoc()` 函数
- `src/ui/browser/datasource/RetrievalDataSource.ts` - 提取练习数据源，`applyFilters()` 方法
- `src/ui/browser/utils/dataSourceFactory.ts` - 数据源工厂
- `src/core/queue/domain/RetrievalPracticeQueue.ts` - 提取练习队列，`getCards()` 方法
- `src/managers/UnifiedDataSourceManager.ts` - 统一数据源管理器，`getCards()` 方法（需要修改）
- `src/application/queries/DataAccessFacade.ts` - 数据访问门面，`fillMissingRootIds()` 方法
- `src/application/queries/CardContentQueryService.ts` - 卡片内容查询服务

## 状态

- [x] 问题分析完成
- [x] 添加调试日志
- [x] 实现方案 1（在 DataAccessFacade.getCards() 中填充 rootId）
- [x] 实现非队列模式的文档筛选（DDD 架构）
- [ ] 测试验证
- [ ] 文档更新

## 补充实现：非队列模式的文档筛选 ✅

### 问题发现

在实现方案 1 后，发现渐进学习队列的文档筛选正常工作，但全部闪卡模式的文档筛选仍然失效。

**原因分析**：
- 队列模式使用 `queue.getCards()` → `DataAccessFacade.getCards()`，`rootId` 被正确填充
- 非队列模式使用 `browserService.getBrowserCards()` → `GetBrowserCardsQueryHandler`
- `GetBrowserCardsQuery` 接口已添加 `docId` 参数，但 `GetBrowserCardsQueryHandler` 未实现文档筛选逻辑
- `SRSBrowser.vue` 未传递 `docId` 参数

### DDD 架构实现

按照 DDD 分层架构，实现了完整的文档筛选功能：

#### 1. 领域层 - CardFilterService.filterByDocId()

在 `src/core/card/domain/services/CardFilterService.ts` 添加文档筛选方法：

```typescript
/**
 * 按文档 ID 过滤（根文档 ID）
 * 
 * @param cards - 卡片列表
 * @param docId - 文档 ID（根文档 ID）
 * @returns 过滤后的卡片列表
 */
filterByDocId(cards: Card[], docId: string): Card[] {
  if (!docId) {
    return cards;
  }
  
  return cards.filter(card => {
    const cardRootId = (card.meta as any)?.rootId || '';
    return cardRootId === docId;
  });
}
```

**设计原则**：
- 纯函数，无副作用
- 领域层不依赖基础设施层
- 单一职责：只负责文档筛选逻辑

#### 2. 应用层 - GetBrowserCardsQueryHandler

在 `src/application/queries/browser/GetBrowserCardsQueryHandler.ts` 实现：

**关键修复**：在应用文档筛选前，必须先填充 `rootId`

```typescript
// 5. 应用文档过滤（领域层）
// ⚠️ 重要：文档筛选需要 rootId，必须先填充
if (query.docId) {
  console.log('[GetBrowserCardsQueryHandler] 🔍 Applying document filter:', query.docId);
  
  // 🔧 先填充 rootId（批量查询）
  const cardsNeedingRootId = filteredCards.filter(c => !(c.meta as any)?.rootId);
  if (cardsNeedingRootId.length > 0) {
    console.log('[GetBrowserCardsQueryHandler] 🔧 Filling rootId for', cardsNeedingRootId.length, 'cards before document filter');
    await this.fillRootIds(cardsNeedingRootId);
  }
  
  // 然后应用文档筛选
  filteredCards = this.cardFilterService.filterByDocId(filteredCards, query.docId);
  console.log('[GetBrowserCardsQueryHandler] 🔍 After document filter:', filteredCards.length);
}
```

**新增方法** - `fillRootIds()`：
```typescript
/**
 * 填充卡片的 rootId（用于文档筛选）
 * 
 * @param cards - 需要填充 rootId 的卡片列表
 */
private async fillRootIds(cards: FSRSCard[]): Promise<void> {
  if (cards.length === 0) {
    return;
  }
  
  const blockIds = cards.map(c => c.blockId);
  
  try {
    // 批量查询 rootId（每批 500 个）
    const BATCH_SIZE = 500;
    for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
      const batchIds = blockIds.slice(i, i + BATCH_SIZE);
      const idsStr = batchIds.map(id => `'${id}'`).join(',');
      
      const query = `
        SELECT id, root_id
        FROM blocks
        WHERE id IN (${idsStr})
      `;
      
      const result = await sql(query);
      
      // 填充到卡片的 meta.rootId
      const rootIdMap = new Map<string, string>();
      for (const row of result) {
        rootIdMap.set(row.id, row.root_id || '');
      }
      
      for (const card of cards) {
        const rootId = rootIdMap.get(card.blockId);
        if (rootId) {
          if (!card.meta) {
            card.meta = {};
          }
          (card.meta as any).rootId = rootId;
        }
      }
    }
  } catch (error) {
    console.error('[GetBrowserCardsQueryHandler] Failed to fill rootIds:', error);
  }
}
```

**设计原则**：
- 应用层协调领域服务
- 不包含业务逻辑，委托给领域层
- 负责数据转换和流程控制
- 在筛选前确保数据完整性

#### 3. UI层 - SRSBrowser.vue

在 `src/ui/browser/SRSBrowser.vue` 传递 `docId` 参数：

```typescript
const result = await props.browserService.getBrowserCards({
  preset: currentPreset.value as any,
  searchText: searchQuery.value,
  cardTypes: currentCardType.value !== 'all' ? [currentCardType.value.replace('-only', '')] : undefined,
  docId: activeDocId.value || undefined,  // ✅ 传递 docId
  sortBy: currentSortField.value as any,
  sortOrder: currentSortOrder.value as any,
  forceRefresh,
  pageSize: 10000,
});
```

**设计原则**：
- UI层通过应用服务调用
- 不直接访问领域层
- 只负责用户交互和数据展示

### DDD 架构合规性验证

✅ **依赖方向正确**：
```
UI层 (SRSBrowser.vue)
  ↓ 调用
应用层 (GetBrowserCardsQueryHandler)
  ↓ 调用
领域层 (CardFilterService)
```

✅ **职责分离清晰**：
- 领域层：纯业务逻辑（文档筛选）
- 应用层：协调领域服务（查询处理）
- UI层：用户交互（传递参数）

✅ **无架构违规**：
- 应用层不直接依赖基础设施层
- 领域层完全独立
- UI层通过应用服务访问

### 测试计划

1. **渐进学习队列** + 点击文档筛选 → 应该正常工作 ✅
2. **全部闪卡** + 点击文档筛选 → 应该正常工作 🔄
3. **其他队列** + 点击文档筛选 → 应该正常工作 🔄

### 相关文件

- ✅ `src/core/card/domain/services/CardFilterService.ts` - 添加 `filterByDocId()` 方法
- ✅ `src/application/queries/browser/GetBrowserCardsQueryHandler.ts` - 调用文档筛选
- ✅ `src/ui/browser/SRSBrowser.vue` - 传递 `docId` 参数
- ✅ `src/application/queries/browser/GetBrowserCardsQuery.ts` - 已有 `docId` 参数定义
