# 列表项卡片创建修复

## 问题描述

在新架构下，列表项块的卡片识别和渲染有两个问题：

### 问题 1：有序列表项的列表模板创建错误
- 父列表项（如 "1"）被识别为一个卡片
- 子列表项（2, 3, 4, 5）被识别为另一个卡片
- 结果是两个块组合成一个卡片，而不是正确的列表模板行为

### 问题 2：无序列表项的子项没有被隐藏
- 无序列表项有子列表项时，正面应该隐藏子列表项
- 但是当前的策略没有处理列表项的隐藏逻辑
- 只有 `mark` 类型的内容会被隐藏

## 正确的行为

### 有序列表项（subtype = 'o'）
列表模板应该：
1. 父列表项作为问题（隐藏子列表项）
2. 每个子列表项分别作为一张卡片的答案
3. 复习时渐进式显示：显示已学过的答案 + 当前提示
4. 1 个 Xiuyuan → N 张 FSRSCard（N = 子列表项数量）

### 无序列表项（subtype = 'u'）
普通 item 卡片：
1. 正面：父列表项（隐藏子列表项，使用 `card__block--hideli` CSS 类）
2. 背面：父列表项 + 子列表项（显示所有内容）
3. 1 个 Xiuyuan → 1 张 FSRSCard

## 根本原因

### 问题 1：有序列表项的列表模板创建错误

在 `TransactionObserver.ts` 中：
1. `checkListTemplate` 方法没有检查子列表项的 `subtype`
2. `createListTemplateCards` 方法错误地循环为每个子列表项调用 `createFromBlocks`
3. 应该：
   - 只有当子列表项是有序列表（`subtype = 'o'`）时才创建列表模板
   - 调用 `createListTemplateCards` 一次，传入父块和所有子块

### 问题 2：无序列表项的子项没有被隐藏

在卡片策略中：
1. `CardTypeDetectionService` 会检测列表项是否有子列表项，如果有则识别为 `item` 卡片
2. 但是所有策略（BasicCardStrategy, ConceptCardStrategy 等）都没有处理列表项的隐藏逻辑
3. 应该：
   - 在策略的 `parse` 方法中，检测块是否为列表项且有子列表项
   - 如果是，正面添加 `list` 到 `hiddenTypes`

## 修复方案

### 修复 1：有序列表项的列表模板创建

#### 修改文件 1：`src/core/box/TransactionObserver.ts`

**修改 `checkListTemplate` 方法**：
```typescript
private async checkListTemplate(blockId: string): Promise<boolean> {
    try {
        // ... 现有的块类型检查 ...
        
        // 2. 获取列表容器
        const listContainerResult = await sql(`
            SELECT id FROM blocks
            WHERE parent_id = '${blockId}'
            AND type = 'l'
            LIMIT 1
        `);
        
        if (!listContainerResult || listContainerResult.length === 0) {
            return false;
        }
        
        const listContainerId = listContainerResult[0].id;
        
        // 3. 检查子列表项是否为有序列表（subtype = 'o'）
        const childrenResult = await sql(`
            SELECT id FROM blocks
            WHERE parent_id = '${listContainerId}'
            AND type = 'i'
            AND subtype = 'o'
        `);
        
        const childCount = childrenResult ? childrenResult.length : 0;
        const hasMultipleOrderedChildren = childCount >= 2;
        
        return hasMultipleOrderedChildren;
    } catch (err) {
        console.error('[SiYuanMemo] Failed to check list template:', err);
        return false;
    }
}
```

**修改 `createListTemplateCards` 方法**：
```typescript
private async createListTemplateCards(parentBlockId: string): Promise<void> {
    try {
        // 1. 获取列表容器
        const listContainerResult = await sql(`
            SELECT id FROM blocks
            WHERE parent_id = '${parentBlockId}'
            AND type = 'l'
            LIMIT 1
        `);
        
        if (!listContainerResult || listContainerResult.length === 0) {
            return;
        }
        
        const listContainerId = listContainerResult[0].id;
        
        // 2. 获取所有有序子列表项
        const childrenResult = await sql(`
            SELECT id FROM blocks
            WHERE parent_id = '${listContainerId}'
            AND type = 'i'
            AND subtype = 'o'
            ORDER BY id ASC
        `);
        
        if (!childrenResult || childrenResult.length < 2) {
            return;
        }
        
        const childBlockIds = childrenResult.map((row: any) => row.id);
        
        // 3. 调用列表模板专用的创建方法
        const xiuyuanAppService = this.plugin.context.getXiuyuanApplicationService();
        const result = await xiuyuanAppService.createListTemplateCards({
            parentBlockId,
            childBlockIds,
            templateId: 'builtin-list-item',
            deckId: BUILTIN_DECK_ID
        });
        
        if (result.ok) {
            console.log('[SiYuanMemo] Created list template:', result.value.xiuyuan.id);
        }
    } catch (err) {
        console.error('[SiYuanMemo] Failed to create list template cards:', err);
    }
}
```

### 修复 2：无序列表项的子项隐藏

#### 修改文件 2：`src/core/card/quick-card/domain/strategies/*.ts`

需要在所有策略的 `parse` 方法中添加列表项检测逻辑。

**方案**：在 `utils.ts` 中添加辅助函数，然后在各个策略中使用。

**新增 `utils.ts` 函数**：
```typescript
/**
 * 检测是否需要隐藏列表项
 * 
 * @param metadata - 卡片元数据
 * @returns 是否需要隐藏列表项
 */
export function shouldHideListItems(metadata: QuickCardMetadata): boolean {
    // 如果元数据中包含 hasListChildren 标记，则需要隐藏
    return metadata.hasListChildren === true;
}
```

**修改策略示例（以 ConceptCardStrategy 为例）**：
```typescript
parse(blockContent: string, metadata: QuickCardMetadata): {
    front: CardFaceData;
    back: CardFaceData;
} {
    const { symbol } = metadata;
    const [concept, definition] = splitBySymbol(blockContent, symbol);
    
    // 正面：只显示概念名称
    const frontHtml = concept;
    
    // 反面：概念名称 + 定义
    const backHtml = `${concept}<br/>${definition}`;
    
    // 检测是否需要隐藏列表项
    const frontHiddenTypes: HiddenContentType[] = ['mark'];
    if (shouldHideListItems(metadata)) {
        frontHiddenTypes.push('list');
    }
    
    return {
        front: {
            html: frontHtml,
            hiddenTypes: frontHiddenTypes,
        },
        back: {
            html: backHtml,
            hiddenTypes: [],
        },
    };
}
```

#### 修改文件 3：`src/core/card/quick-card/infrastructure/QuickCardRepository.ts`

在 `loadCard` 方法中，检测块是否为列表项且有子列表项：

```typescript
async loadCard(blockId: string, cardId?: string): Promise<QuickCard | null> {
    try {
        // ... 现有代码 ...
        
        // 4. 构建元数据
        const metadata: QuickCardMetadata = {
            symbol: cardInfo.symbol,
            parentBlockId: block.parentID,
            cardId,
        };
        
        // 5. 检测是否为列表项且有子列表项
        if (block.type === 'i') {
            const hasListChildren = await this.checkHasListChildren(blockId);
            if (hasListChildren) {
                metadata.hasListChildren = true;
            }
        }
        
        // ... 其余代码 ...
    } catch (error) {
        // ...
    }
}

/**
 * 检查列表项是否有子列表项
 */
private async checkHasListChildren(blockId: string): Promise<boolean> {
    try {
        // 1. 获取列表容器
        const listContainerResult = await sql(`
            SELECT id FROM blocks
            WHERE parent_id = '${blockId}'
            AND type = 'l'
            LIMIT 1
        `);
        
        if (!listContainerResult || listContainerResult.length === 0) {
            return false;
        }
        
        const listContainerId = listContainerResult[0].id;
        
        // 2. 检查是否有子列表项
        const childrenResult = await sql(`
            SELECT id FROM blocks
            WHERE parent_id = '${listContainerId}'
            AND type = 'i'
            LIMIT 1
        `);
        
        return childrenResult && childrenResult.length > 0;
    } catch (err) {
        console.error('[QuickCardRepository] Failed to check list children:', err);
        return false;
    }
}
```

## 架构说明

### 列表模板的正确流程

1. **检测阶段** (`TransactionObserver.checkListTemplate`)
   - 检查块类型是否为列表项 (`type = 'i'`)
   - 检查是否有 ≥2 个子列表项
   - 如果满足条件，识别为列表模板

2. **创建阶段** (`TransactionObserver.createListTemplateCards`)
   - 获取所有子列表项 ID
   - 调用 `XiuyuanApplicationService.createListTemplateCards`
   - 传入父块 ID 和所有子块 ID

3. **用例执行** (`CreateListTemplateCardsUseCase`)
   - 获取父列表项的段落块 ID（用于问题显示）
   - 解析每个子列表项的提示和答案（支持 `→` 分隔符）
   - 创建 1 个 Xiuyuan 聚合根
   - 为每个子列表项创建 1 张 FSRSCard
   - 保存到仓储

### 数据结构

```typescript
Xiuyuan {
  id: 'xy_xxx',
  blockIDs: [parentParagraphId, child1Id, child2Id, ...],
  templateID: 'builtin-list-item',
  faces: [
    { question: parentParagraphId, answer: child1Content },
    { question: parentParagraphId, answer: child2Content },
    ...
  ],
  meta: {
    listTemplate: {
      parentBlockId,
      parentParagraphId,
      childrenData: [
        { id: child1Id, cue: '提示1', answer: '答案1', index: 0 },
        { id: child2Id, cue: '提示2', answer: '答案2', index: 1 },
        ...
      ]
    }
  }
}
```

## 测试验证

### 测试场景
1. 创建一个列表项，包含 ≥2 个子列表项
2. 添加到 Riff 卡包
3. 验证创建的卡片数量和结构

### 预期结果
- 创建 1 个 Xiuyuan
- 创建 N 张 FSRSCard（N = 子列表项数量）
- 每张卡片的问题相同（父列表项），答案不同（各个子列表项）
- 复习时能正确显示渐进式答案

## 相关文件

- `src/core/box/TransactionObserver.ts` - 事务观察者（修复点）
- `src/application/services/XiuyuanApplicationService.ts` - 应用服务
- `src/application/usecases/xiuyuan/CreateListTemplateCardsUseCase.ts` - 列表模板用例
- `src/application/commands/xiuyuan/CreateListTemplateCardsCommand.ts` - 命令定义
- `src/core/xiuyuan/domain/services/CardTypeDetectionService.ts` - 卡片类型检测

## 状态

✅ 已修复

## 修复内容总结

### 修复 1：有序列表项的列表模板创建
- ✅ 修改 `TransactionObserver.checkListTemplate`：检查 `subtype = 'o'`
- ✅ 修改 `TransactionObserver.createListTemplateCards`：调用正确的方法
- ✅ 添加 `TransactionObserver.isListTemplateChild`：防止子列表项被单独创建为卡片
- ✅ 修改 `TransactionObserver.checkAndCreateCard`：在开始时检查是否为列表模板子项

### 修复 2：无序列表项的子项隐藏
- ✅ 添加 `utils.shouldHideListItems` 辅助函数
- ✅ 修改 `ConceptCardStrategy`：添加列表项隐藏逻辑
- ✅ 修改 `DescriptorCardStrategy`：添加列表项隐藏逻辑
- ✅ 修改 `BasicCardStrategy`：添加列表项隐藏逻辑
- ✅ 修改 `QuickCardRepository.loadCard`：检测列表项子级
- ✅ 添加 `QuickCardRepository.checkHasListChildren` 方法
- ✅ 更新 `QuickCardMetadata` 类型定义

## 关键修复点

### 问题根源
之前的实现中，列表项的子列表项也会被添加到 Riff，触发独立的卡片创建流程，导致：
1. 父列表项创建一张卡片
2. 每个子列表项也创建一张卡片
3. 结果是多张独立的卡片

**这个问题同时影响有序列表和无序列表**：
- 有序列表：应该创建列表模板（1 个 Xiuyuan → N 张卡片），但子项被单独创建了
- 无序列表：应该创建一张卡片（正面隐藏子项），但子项也被单独创建了

### 解决方案
修改 `isListTemplateChild` 方法，检测**所有**列表项的子项：
- 无论是有序还是无序列表，子列表项都不应该被单独创建为卡片
- 在 `checkAndCreateCard` 的开始就检查块是否为列表项的子项
- 如果是，直接跳过创建
- 只有顶层的父列表项会创建卡片（有序列表创建列表模板，无序列表创建普通卡片）

## 测试建议

1. **有序列表项测试**：
   - 创建一个有序列表项，包含 ≥2 个子列表项
   - 添加到 Riff 卡包
   - 验证创建了 1 个 Xiuyuan 和 N 张卡片
   - 验证每张卡片的问题相同，答案不同

2. **无序列表项测试**：
   - 创建一个无序列表项，包含子列表项
   - 添加到 Riff 卡包
   - 验证正面隐藏了子列表项
   - 验证背面显示了所有内容
