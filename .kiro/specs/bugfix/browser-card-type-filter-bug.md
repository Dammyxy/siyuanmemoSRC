# 浏览器文档筛选失效问题

## 问题描述

在浏览器中点击文档列表中的文档进行筛选时，筛选似乎失效了。虽然系统识别到了文档点击事件并尝试应用筛选，但最终显示的卡片数量不正确。

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
[SiYuanMemo][BrowserHierarchy] 🔍 Document IDs to load: {idsCount: 43, ids: Array(43), counts: {…}}
```

关键问题：
1. 点击文档后，`handleSelectDoc` 被调用，设置了 `activeDocId.value`
2. `loadData()` 被触发，进入队列模式分支
3. 创建队列数据源时传入了 `docId` 参数
4. 但是筛选结果似乎不正确，或者 `rootId` 字段没有正确填充

## 预期行为

1. 用户点击文档列表中的某个文档时，`activeDocId.value` 应该被设置为该文档的 ID
2. 队列数据源应该使用 `docId` 参数进行筛选
3. 筛选逻辑应该正确比较 `card.rootId` 和 `docId`
4. 浏览器应该只显示属于该文档的卡片

## 根本原因分析

### 问题定位

通过分析日志和代码，发现以下问题：

1. **文档筛选逻辑位置**：
   - 在 `RetrievalDataSource.ts` 的 `applyFilters()` 方法中（第 125 行）
   - 筛选条件：`c.rootId === this.options.docId`

2. **可能的问题**：
   - `card.rootId` 字段可能没有正确填充
   - `docId` 的值可能不正确
   - 筛选逻辑可能在某个环节被绕过

3. **日志显示**：
   ```
   [SiYuanMemo][DataAccessFacade] Cards needing data: 46 need rootId, 46 need content
   [SiYuanMemo][DataAccessFacade] ⚠️ Block not found in database: 20260217123311-hg6vmym
   [SiYuanMemo][DataAccessFacade] ✅ Filled rootId for 46 cards, content for 46 cards
   ```
   - 说明有 46 张卡片的 `rootId` 需要填充
   - 填充过程中有 1 张卡片在数据库中找不到
   - 这表明 `rootId` 是后期填充的，而不是在队列数据源中就有的

### 真正的问题

**`rootId` 填充时机问题：**

1. **队列数据源筛选时**：`card.rootId` 可能还是空的或未定义
2. **筛选逻辑执行**：`c.rootId === this.options.docId` 比较失败，因为 `rootId` 还没填充
3. **后续填充**：`DataAccessFacade` 才填充 `rootId`，但此时筛选已经完成

这就是为什么文档筛选失效的原因：**筛选发生在 `rootId` 填充之前**。

## 解决方案

### 方案 1：在队列获取卡片时就填充 rootId（推荐）

修改队列的 `getCards()` 方法，确保返回的卡片已经包含 `rootId` 字段：

```typescript
// 在 RetrievalPracticeQueue.ts 或相应的队列类中
async getCards(): Promise<FSRSCard[]> {
  const cards = await this.fetchCardsFromDatabase();
  
  // 填充 rootId
  for (const card of cards) {
    if (!card.meta?.rootId) {
      const block = await this.getBlockInfo(card.blockId);
      if (block) {
        card.meta = card.meta || {};
        card.meta.rootId = block.root_id;
      }
    }
  }
  
  return cards;
}
```

### 方案 2：在数据源转换时填充 rootId

修改 `RetrievalDataSource.convertToBrowserCard()` 方法，在转换时同步获取 `rootId`：

```typescript
private async convertToBrowserCard(card: FSRSCard): Promise<BrowserCard> {
  // 如果没有 rootId，立即获取
  if (!card.meta?.rootId) {
    const block = await this.getBlockInfo(card.blockId);
    if (block) {
      card.meta = card.meta || {};
      card.meta.rootId = block.root_id;
    }
  }
  
  // 继续转换逻辑...
}
```

但这个方案需要将 `convertToBrowserCard` 改为异步方法，会影响较多代码。

### 方案 3：延迟筛选（不推荐）

将文档筛选逻辑移到 `DataAccessFacade` 填充 `rootId` 之后执行。但这会破坏当前的架构设计。

### 推荐方案

**方案 1** 最合理：在数据源头就确保数据完整性，符合 DDD 原则。队列应该返回完整的卡片数据，包括 `rootId`。

## 下一步行动

1. 检查队列的 `getCards()` 方法，确认返回的卡片是否包含 `rootId`
2. 如果没有，需要在队列层面填充 `rootId`
3. 添加调试日志，确认筛选时 `card.rootId` 的值
4. 测试修复后的文档筛选功能

## 调试步骤

### 需要添加的调试日志

在 `RetrievalDataSource.ts` 的 `applyFilters()` 方法中添加：

```typescript
private applyFilters(cards: BrowserCard[]): BrowserCard[] {
  let result = cards;

  // 文档筛选（使用 rootId 而非 boxId）
  if (this.options.docId) {
    console.log('[SiYuanMemo][RetrievalDataSource] 🔍 Filtering by docId:', {
      docId: this.options.docId,
      totalCards: result.length,
      cardsWithRootId: result.filter(c => c.rootId).length,
      sampleRootIds: result.slice(0, 5).map(c => ({ blockId: c.blockId, rootId: c.rootId })),
    });
    
    result = result.filter(c => c.rootId === this.options.docId);
    
    console.log('[SiYuanMemo][RetrievalDataSource] 🔍 After docId filter:', {
      filteredCount: result.length,
    });
  }
  
  // ... 其他筛选逻辑
}
```

## 相关文件

- `src/ui/browser/SRSBrowser.vue` - 浏览器 UI 组件，`handleSelectDoc()` 函数
- `src/ui/browser/datasource/RetrievalDataSource.ts` - 提取练习数据源，`applyFilters()` 方法
- `src/ui/browser/utils/dataSourceFactory.ts` - 数据源工厂
- `src/core/queue/RetrievalPracticeQueue.ts` - 提取练习队列，`getCards()` 方法
- `src/application/queries/DataAccessFacade.ts` - 数据访问门面，`fillMissingRootIds()` 方法
