# CardType 过滤逻辑修复

## 问题描述

xiuyuan 模板卡片在不同视图中显示不一致：
- 在【全部闪卡】视图中被识别为 topic
- 在【提取练习】和【渐进学习】队列中被正确识别为 item

## 根本原因

**真正的根本原因**：xiuyuan 卡片创建时没有设置 `ATTR_CARD_TYPE` 块属性

1. **xiuyuan service 创建卡片时**：
   - FSRSCard 对象中设置了 `type: CardType.Item`
   - 但是调用 `markBlockAsCard` 时**没有传递 cardType 参数**
   - 导致块属性中没有 `custom-fsrs-card-type` 字段

2. **数据源读取时**：
   - 从块属性读取 `ATTR_CARD_TYPE`，而不是从 FSRSCard 对象读取
   - 如果块属性中没有这个字段，可能显示为 undefined 或错误的值

3. **过滤逻辑不一致**（次要问题）：
   - 代码中存在两套不一致的 cardType 过滤逻辑
   - 旧逻辑使用基于内容的推断（检查 `::` 和 `?` 标记）
   - 新逻辑基于字段，但对缺失值的处理不一致

## 修复方案

### 1. 修复 xiuyuan 卡片创建逻辑（主要修复）

**修改 `markBlockAsCard` 函数签名**，添加 cardType 参数：

**文件**: `src/core/siyuan/block.ts`

```typescript
export async function markBlockAsCard(
    blockId: string, 
    cardId: string, 
    priority?: number,
    cardType?: 'topic' | 'item'  // ✅ 新增参数
): Promise<void> {
    const attrs: Record<string, string> = {
        [ATTR_CARD_ID]: cardId,
        [ATTR_IS_FLASHCARD]: 'true',
    };

    if (priority !== undefined) {
        attrs[ATTR_PRIORITY] = String(priority);
    }

    // ✅ 设置卡片类型
    if (cardType) {
        attrs[ATTR_CARD_TYPE] = cardType;
    }

    await api.setBlockAttrs(blockId, attrs);
}
```

**更新所有调用 `markBlockAsCard` 的地方**：

1. `src/core/xiuyuan/service.ts` - xiuyuan 卡片创建
2. `src/ui/menu/BlockMenu.ts` - 块菜单创建卡片
3. `src/services/CardService.ts` - 卡片服务
4. `src/services/BlockMenuHandler.ts` - 块菡单处理器
5. `src/core/box/TransactionObserver.ts` - 事务观察器

所有调用都传入 `'item'` 作为 cardType（因为这些都是创建 item 类型的卡片）。

### 2. 统一 cardType 过滤逻辑（次要修复）

统一 cardType 过滤逻辑，遵循以下原则：

- **缺失 cardType 的卡片默认为 'item'**
- **移除所有基于内容的推断逻辑**
- **topic-only**: 只显示明确标记为 `cardType === 'topic'` 的卡片
- **item-only**: 显示 `cardType === 'item'` 或 `!cardType` 的卡片

**修改文件**:
- `src/ui/browser/browserService.ts` - applyPresetFilter 函数
- `src/ui/browser/browserService.ts` - loadCards 函数
- `src/ui/browser/utils/cardFilters.ts` - applyCardTypeFilter 函数

## 修改文件清单

### 主要修复（xiuyuan 卡片创建）

1. **src/core/siyuan/block.ts**
   - 修改 `markBlockAsCard` 函数签名，添加 cardType 参数

2. **src/core/xiuyuan/service.ts**
   - 调用 `markBlockAsCard` 时传入 `'item'`

3. **src/ui/menu/BlockMenu.ts**
   - 调用 `markBlockAsCard` 时传入 `'item'`

4. **src/services/CardService.ts**
   - 调用 `markBlockAsCard` 时传入 `'item'`

5. **src/services/BlockMenuHandler.ts**
   - 调用 `markBlockAsCard` 时传入 `'item'`

6. **src/core/box/TransactionObserver.ts**
   - 调用 `markBlockAsCard` 时传入 `card.type`

### 次要修复（过滤逻辑统一）

7. **src/ui/browser/browserService.ts**
   - applyPresetFilter 函数：移除基于内容的推断
   - loadCards 函数：已经是正确的逻辑

8. **src/ui/browser/utils/cardFilters.ts**
   - applyCardTypeFilter 函数：添加缺失值默认为 item 的逻辑

## 测试验证

1. 编译成功：`npm run build` ✅
2. 需要在思源笔记中验证：
   - **创建新的 xiuyuan 模板卡片**，检查块属性中是否有 `custom-fsrs-card-type: item`
   - xiuyuan 模板卡片在【全部闪卡】中显示为 item
   - xiuyuan 模板卡片在【渐进学习】队列中显示为 item
   - cardType 过滤器在所有视图中正常工作

## 影响范围

- 所有新创建的卡片（包括 xiuyuan 模板卡片）
- 所有使用 cardType 过滤的视图
- 特别是【全部闪卡】、【渐进学习】、【提取练习】队列

## 注意事项

**已存在的 xiuyuan 卡片**：
- 如果块属性中没有 `custom-fsrs-card-type` 字段，会默认显示为 item（根据新的过滤逻辑）
- 如果需要修正已存在的卡片，可以：
  1. 在 SRS 浏览器中批量选择卡片
  2. 使用右键菜单 "标记为 Item" 功能
  3. 或者运行迁移脚本批量更新

## 修复日期

2026-02-07


## 关于"识别卡片类型"按钮

SRS 浏览器工具栏中的"识别卡片类型"按钮（`migrateTopicItem`）功能正常，不需要修改。

### 功能说明

这个按钮用于**批量识别已存在的卡片类型**：
1. 调用 `detectCardType` 函数自动识别每张卡片是 topic 还是 item
2. 设置 `ATTR_CARD_TYPE` 块属性
3. 如果是 topic，还会初始化 `ATTR_A_FACTOR`

### 识别逻辑

`detectCardType` 函数（位于 `src/core/card-builder/detectCardType.ts`）会根据卡片内容判断类型：
- **Topic（主题）**：纯阅读材料，没有问答标记
- **Item（卡片）**：包含问答标记（如 `::`, `?` 等）

### 使用场景

- **已存在的旧卡片**：使用"识别卡片类型"按钮批量识别
- **新创建的卡片**：通过我们修复的 `markBlockAsCard` 函数自动设置

### 相关文件

- `src/ui/browser/composables/useCardActions.ts` - migrateTopicItem 函数
- `src/scripts/migrateToTopicItem.ts` - 批量迁移脚本
- `src/core/card-builder/detectCardType.ts` - 卡片类型识别逻辑

## 总结

本次修复解决了两个层面的问题：

1. **新卡片创建**：修复 `markBlockAsCard` 函数，确保新创建的卡片正确设置 cardType 属性
2. **已存在的卡片**：可以使用"识别卡片类型"按钮批量识别和修正

两个功能互补，共同确保所有卡片都有正确的类型标记。
