# 队列视图类型筛选失效修复

## 问题描述

在提取练习队列和渐进学习队列里，所有当天到期的闪卡都进去了，全是 item 类型。但在全部闪卡视图里能看到正确的闪卡类型（item、topic 等）。

## 问题分析

### 1. 数据流

```
队列.getCards()
  ↓
UnifiedDataSourceManager.getCards(filter)
  ↓
DataAccessFacade.getCards(filter)
  ↓
CardApplicationService.getCards()
  ↓
UnifiedStorageManager.getAllCards()
  ↓
CardMapper.toDomain(dto)
```

### 2. 类型筛选位置

#### 队列层（Domain Layer）
- `RetrievalPracticeQueue.getCards()`: 只获取 `['item', 'descriptor']`
- `IncrementalLearningQueue.getCards()`: 获取所有类型

```typescript
// RetrievalPracticeQueue.ts:121
const dueCards = await this.manager.getCards({
    cardType: ['item', 'descriptor'],
    dueDate: { lte: new Date(dayEnd) }
});

// IncrementalLearningQueue.ts:150
const dueCards = await this.manager.getCards({
    cardType: ['item', 'concept', 'descriptor', 'topic', 'incremental', 'webpage'],
    dueDate: { lte: new Date(now) }
});
```

#### 数据访问层（Application Layer）
- `DataAccessFacade.applyFilter()`: 使用 `CardFilterService.filterByCardTypes()`

```typescript
// DataAccessFacade.ts:377
if (filter.cardType) {
    const allowedTypes = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
    filtered = this.cardFilterService.filterByCardTypes(filtered, allowedTypes);
}
```

#### UI层（Presentation Layer）
- `RetrievalDataSource.applyFilters()`: 根据 `this.options.cardType` 筛选
- `IncrementalLearningDataSource.applyFilters()`: 根据 `this.options.cardType` 筛选

```typescript
// RetrievalDataSource.ts:160
if (this.options.cardType && this.options.cardType !== 'all') {
  result = result.filter(c => {
    switch (this.options.cardType) {
      case 'topic-only':
        return c.cardType === 'topic';
      case 'item-only':
        return c.cardType === 'item' || !c.cardType;
      // ...
    }
  });
}
```

### 3. 问题根源

**可能的原因**：

1. **数据库中的卡片 type 字段不正确**
   - 所有卡片的 `type` 都是 `'item'`
   - 没有 `'topic'`、`'concept'` 等类型的卡片

2. **CardTypeDetectionService 未被调用**
   - 创建卡片时没有正确检测类型
   - 或者检测结果没有保存到数据库

3. **类型转换问题**
   - `CardMapper.toDomain()` 转换时丢失了类型信息
   - 或者 `CardPersistenceDTO` 中的 `type` 字段为空

## 调查步骤

### 步骤 1：检查数据库中的卡片类型

运行调试脚本：

```bash
node debug-queue-cardtype.js
```

检查：
- 所有卡片的 `type` 字段分布
- 到期卡片的 `type` 字段分布
- 是否有 `topic`、`concept` 等类型的卡片

### 步骤 2：检查卡片创建流程

查找卡片创建的位置：
- `XiuyuanApplicationService.createXiuyuanFromBlocks()`
- `CreateXiuyuanFromBlocksUseCase`
- `CreateListTemplateCardsUseCase`

检查：
- 是否调用了 `CardTypeDetectionService.detectCardType()`
- 检测结果是否正确保存到 `FSRSCard.type`

### 步骤 3：检查类型检测逻辑

查看 `CardTypeDetectionService.detectCardType()`:
- 检测规则是否正确
- 是否能正确识别 topic、item 等类型

## 修复方案

### 方案 A：修复卡片创建流程（推荐）

确保在创建卡片时正确检测并设置类型：

```typescript
// CreateXiuyuanFromBlocksUseCase.ts
const cardType = await this.cardTypeDetectionService.detectCardType(blockId);

const card: FSRSCard = {
    // ...
    type: cardType,  // ✅ 使用检测结果
    // ...
};
```

### 方案 B：批量修复现有卡片

创建迁移脚本，重新检测所有卡片的类型：

```typescript
async function migrateCardTypes() {
    const storage = UnifiedStorageManager.getInstance();
    const allCards = storage.getAllCards();
    
    for (const card of allCards) {
        const detectedType = await cardTypeDetectionService.detectCardType(card.blockId);
        if (card.type !== detectedType) {
            card.type = detectedType;
            await storage.setCard(card);
        }
    }
}
```

### 方案 C：在数据访问层动态检测

在 `DataAccessFacade.getCards()` 中动态检测类型（性能较差，不推荐）：

```typescript
async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
    let cards = await this.cardService.getCards({});
    
    // 动态检测类型
    for (const card of cards) {
        if (!card.type || card.type === 'item') {
            const detectedType = await this.cardTypeDetectionService.detectCardType(card.blockId);
            card.type = detectedType;
        }
    }
    
    // 应用过滤器
    if (filter) {
        cards = this.applyFilter(cards, filter);
    }
    
    return cards;
}
```

## 验证步骤

1. 运行调试脚本，确认卡片类型分布正确
2. 在全部闪卡视图中，检查是否能看到不同类型的卡片
3. 在提取练习队列中，选择 "topic-only"，检查是否只显示 topic 卡片
4. 在渐进学习队列中，选择 "item-only"，检查是否只显示 item 卡片

## 相关文件

- `src/core/xiuyuan/domain/services/CardTypeDetectionService.ts` - 类型检测服务
- `src/application/usecases/xiuyuan/CreateXiuyuanFromBlocksUseCase.ts` - 创建卡片用例
- `src/application/queries/DataAccessFacade.ts` - 数据访问门面
- `src/core/card/domain/services/CardFilterService.ts` - 卡片过滤服务
- `src/ui/browser/datasource/RetrievalDataSource.ts` - 提取练习数据源
- `src/ui/browser/datasource/IncrementalLearningDataSource.ts` - 渐进学习数据源
