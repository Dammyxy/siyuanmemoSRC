# 渐进学习队列 CardType 筛选修复

## 问题描述

在 SRS 浏览器中，卡片类型（item/topic）筛选功能存在不一致的行为：
- 在【全部闪卡】视图中，xiuyuan 模板卡被错误地识别为 topic
- 在【渐进学习】和【检索练习】队列中，xiuyuan 模板卡被正确识别为 item
- 选择 "仅主题" 或 "仅卡片" 筛选时，结果不一致

## 根本原因

1. **CardType 转换错误**：在多个数据源的 `convertToBrowserCard` 方法中，CardType 枚举转换逻辑有误
   - 原代码：`if (typeof card.type === 'string') { cardType = card.type as any; }`
   - 问题：CardType 枚举的值本身就是字符串（'item', 'topic', 'incremental', 'webpage'），不需要类型检查

2. **队列模式下筛选未应用**：在 SRSBrowser.vue 的队列模式下，直接使用 `browserAdapter.fetchRows()`，绕过了数据源的筛选逻辑
   - 原代码：直接调用 `browserAdapter.fetchRows()`
   - 问题：没有传递 `cardType` 参数给数据源

3. **回退逻辑不准确**：在 `browserService.ts` 的 `loadCards` 函数中，存在基于内容推断卡片类型的回退逻辑
   - 问题：如果 `cardType` 字段不存在，会根据内容中是否有 `::` 或 `?` 来推断类型
   - xiuyuan 模板卡的内容中可能没有这些标记，导致被错误识别为 topic

## 修复方案

### 1. 修复 CardType 转换逻辑

修改了以下文件中的 `convertToBrowserCard` 方法：
- `src/ui/browser/datasource/IncrementalLearningDataSource.ts`
- `src/ui/browser/datasource/RetrievalDataSource.ts`
- `src/ui/browser/datasource/FinalDrillDataSource.ts`
- `src/ui/browser/datasource/FilterGroupDataSource.ts`
- `src/ui/browser/SRSBrowserAdapter.ts`

**修改前：**
```typescript
let cardType: 'topic' | 'item' | 'incremental' | 'webpage' | undefined;
if (typeof card.type === 'string') {
  cardType = card.type as any;
}
```

**修改后：**
```typescript
// CardType 枚举的值本身就是字符串 ('item', 'topic', 'incremental', 'webpage')
const cardType = card.type as 'topic' | 'item' | 'incremental' | 'webpage' | undefined;
```

### 2. 修复队列模式下的筛选逻辑

修改了 `src/ui/browser/SRSBrowser.vue` 中的 `loadData` 函数：

**修改前：**
```typescript
// 队列模式：直接使用 browserAdapter.fetchRows()
const result = await browserAdapter.value.fetchRows({
  sortModel: currentSortModel.value,
  filterModel: {},
});
```

**修改后：**
```typescript
// 队列模式：使用数据源工厂创建数据源（支持 cardType 筛选）
const options = {
  docId: activeDocId.value,
  preset: currentPreset.value,
  queryText: searchQuery.value,
  cardType: currentCardType.value as 'all' | 'topic-only' | 'item-only',
};

currentDataSource.value = createQueueDataSource(
  activeQueueId.value,
  props.plugin.unifiedDataSourceManager,
  options,
  () => getQueueById(activeQueueId.value)?.getAllItems?.() || []
);

// 执行数据加载
await executeFetchRows(forceRefresh);
```

### 3. 添加调试日志

在 `IncrementalLearningDataSource.ts` 中添加了调试日志，用于诊断 cardType 筛选问题：

```typescript
// 卡片类型筛选
if (this.options.cardType && this.options.cardType !== 'all') {
  console.log(`[IncrementalLearningDataSource] Applying cardType filter: ${this.options.cardType}`);
  console.log(`[IncrementalLearningDataSource] Sample cardTypes before filter:`, result.slice(0, 5).map(c => ({ blockId: c.blockId, cardType: c.cardType })));
  
  result = result.filter(c => {
    switch (this.options.cardType) {
      case 'topic-only':
        return c.cardType === 'topic';
      case 'item-only':
        return c.cardType === 'item';
      default:
        return true;
    }
  });
  
  console.log(`[IncrementalLearningDataSource] After cardType filter: ${result.length} cards`);
  console.log(`[IncrementalLearningDataSource] Sample cardTypes after filter:`, result.slice(0, 5).map(c => ({ blockId: c.blockId, cardType: c.cardType })));
}
```

## 已知问题

### Xiuyuan 模板卡在【全部闪卡】中被识别为 Topic

**原因**：`browserService.ts` 中的 `loadCards` 函数使用了基于内容的回退逻辑来推断卡片类型：

```typescript
if (cardType === 'topic-only') {
    cards = cards.filter(c => c.cardType === 'topic' || (!c.cardType && c.content.indexOf('::') === -1 && c.content.indexOf('?') === -1));
} else if (cardType === 'item-only') {
    cards = cards.filter(c => c.cardType === 'item' || (!c.cardType && (c.content.indexOf('::') !== -1 || c.content.indexOf('?') !== -1)));
}
```

如果 `cardType` 字段不存在，且内容中没有 `::` 或 `?`，就会被识别为 topic。

**解决方案**：
1. 确保所有卡片在创建时都正确设置 `type` 字段（xiuyuan 卡片已经正确设置为 `CardType.Item`）
2. 移除或改进回退逻辑，不应该基于内容来推断卡片类型
3. 如果 `cardType` 字段缺失，应该从数据库的块属性中读取 `custom-fsrs-type` 属性

## 验证

修复后，渐进学习队列的卡片类型筛选功能应该正常工作：
1. 卡片的 `cardType` 字段正确显示为 'item' 或 'topic'
2. 选择 "仅主题" 时，只显示 topic 类型的卡片
3. 选择 "仅卡片" 时，只显示 item 类型的卡片
4. Xiuyuan 模板卡在所有视图中都应该被识别为 item

## 影响范围

- 渐进学习队列
- 检索练习队列
- 最终训练队列
- 筛选组队列
- SRS 浏览器的所有队列视图
- 【全部闪卡】视图（部分影响，仍存在回退逻辑问题）

## 相关文件

- `src/ui/browser/datasource/IncrementalLearningDataSource.ts`
- `src/ui/browser/datasource/RetrievalDataSource.ts`
- `src/ui/browser/datasource/FinalDrillDataSource.ts`
- `src/ui/browser/datasource/FilterGroupDataSource.ts`
- `src/ui/browser/SRSBrowserAdapter.ts`
- `src/ui/browser/SRSBrowser.vue`
- `src/ui/browser/browserService.ts`（待修复）

## 日期

2026-02-07
