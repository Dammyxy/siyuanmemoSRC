# 卡片类型标记系统实现总结

## 概述

实现了卡片类型标记系统，允许用户手动标记卡片为"概念卡"或"描述符卡"，并确保这些标记不会被自动识别系统覆盖。

## 核心修改

### 1. 类型映射调整

**文件**: `src/core/card-type/type-mapping.ts`

**修改前**:
- `concept` → `topic` (A-Factor 调度器)
- `descriptor` → `item` (FSRS 调度器)

**修改后**:
- `concept` → `item` (FSRS 调度器)
- `descriptor` → `item` (FSRS 调度器)

**原因**: 概念卡也需要使用 FSRS 调度器，而不是 A-Factor 调度器。两种类型的区别在于语义和神经漫游队列的处理，而不是调度算法。

### 2. 浏览器菜单集成

**文件**: `src/ui/browser/composables/useCardActions.ts`

**新增功能**:
- `markCardsAsConcept()`: 标记卡片为概念卡
- `markCardsAsDescriptor()`: 标记卡片为描述符卡
- `buildCardTypeSubmenu()`: 构建卡片类型子菜单，包含新的标记选项

**关键实现**:
```typescript
// 只使用 fsrsCardId，不使用 blockId fallback
for (const card of cards) {
  if (card.fsrsCardId) {
    cardIds.push(card.fsrsCardId);
  } else {
    console.warn('[useCardActions] Card missing fsrsCardId, skipping:', card.id, card.blockId);
  }
}
```

**为什么不用 blockId fallback**:
- Xiuyuan 列表模板卡：多张卡片共用同一个 `blockId`（代表块）
- 使用 `blockId` 查找会导致只找到第一张卡片
- 所有数据源都正确设置了 `fsrsCardId`，所以不需要 fallback

### 3. 迁移系统保护

**文件**: `src/scripts/migrateToTopicItem.ts`

**新增逻辑**:
```typescript
// 1. 优先检查用户设置的类型标记
const cardTypeMarker = attrs?.['custom-fsrs-card-type'];

if (cardTypeMarker === 'concept' || cardTypeMarker === 'descriptor') {
  // 概念卡和描述符卡都使用 FSRS 调度器（item）
  const inferredType = 'item';
  
  // 更新块属性以匹配
  if (existingType !== inferredType) {
    await setBlockAttrs(blockId, { [ATTR_CARD_TYPE]: inferredType });
  }
  
  return { blockId, migrated: true, cardType: inferredType };
}

// 2. 如果没有用户标记，才进行自动检测
const cardType = await detectCardType(blockId);
```

**保护机制**:
- 用户手动设置的 `cardTypeMarker` 优先级最高
- 不受 `forceRemigrate` 参数影响
- 自动识别系统不会覆盖用户的选择

### 4. HybridSync 同步保护

**文件**: `src/services/HybridSyncService.ts`

**问题**: WebSocket 触发增量同步时，`detectCardTypesForNewCards` 会自动检测卡片类型并更新块属性，覆盖用户的手动标记。

**修复**:
```typescript
// 0. 过滤掉已经有 cardTypeMarker 的卡片（用户手动标记的）
const cardsToDetect: RiffBlock[] = [];
let skippedWithMarker = 0;

for (const card of cards) {
  try {
    const attrs = await getBlockAttrs(card.id);
    const cardTypeMarker = attrs?.['custom-fsrs-card-type'];
    
    if (cardTypeMarker === 'concept' || cardTypeMarker === 'descriptor') {
      // 跳过已有用户标记的卡片
      skippedWithMarker++;
      console.log(`[HybridSync] Skipping card with cardTypeMarker: ${card.id} (${cardTypeMarker})`);
      continue;
    }
    
    cardsToDetect.push(card);
  } catch (err) {
    // 如果获取属性失败，仍然尝试检测
    cardsToDetect.push(card);
  }
}
```

**保护机制**:
- 在自动检测之前，先检查块属性中的 `custom-fsrs-card-type`
- 跳过已有 `cardTypeMarker` 的卡片
- 只对没有用户标记的卡片进行自动检测

### 5. 测试更新

**文件**: 
- `src/core/card-type/__tests__/type-mapping.test.ts`
- `src/core/card-type/__tests__/CardTypeMarkerService.test.ts`

**更新内容**:
- 所有 `concept → topic` 的断言改为 `concept → item`
- 反向映射测试更新为 `item → [concept, descriptor]`
- 验证测试更新为正确的映射关系

## 工作流程

```
用户在浏览器中选择卡片
  ↓
点击"标记为概念卡"或"标记为描述符卡"
  ↓
useCardActions.markCardsAsConcept/Descriptor()
  ↓
收集 fsrsCardId（跳过没有 fsrsCardId 的卡片）
  ↓
CardTypeMarkerService.batchSetMarker()
  ↓
设置 cardTypeMarker 字段
推导 type = 'item'
同步块属性 custom-fsrs-card-type
  ↓
保存到存储
  ↓
WebSocket 触发增量同步
  ↓
HybridSync.detectCardTypesForNewCards()
  ↓
检测到 custom-fsrs-card-type 存在
  ↓
跳过该卡片，不进行自动检测
  ↓
迁移系统运行时
  ↓
检测到 custom-fsrs-card-type 存在
  ↓
尊重用户设置，不进行自动识别
  ↓
✅ 用户标记被保留
```

## 保护层级

系统提供了三层保护，确保用户手动标记不会被覆盖：

1. **CardTypeMarkerService 层**: 设置 `cardTypeMarker` 和块属性
2. **HybridSync 层**: 增量同步时跳过已有 `cardTypeMarker` 的卡片
3. **Migration 层**: 迁移系统尊重已有 `cardTypeMarker` 的卡片

## Xiuyuan 卡片兼容性

**问题**: Xiuyuan 列表模板卡的多张卡片共用一个 `blockId`（代表块）

**解决方案**:
1. 每张 Xiuyuan 卡片都有独立的 `id`（通过 `generateXiuyuanCardID` 生成）
2. 浏览器数据源正确设置 `fsrsCardId: card.id`
3. 标记操作只使用 `fsrsCardId`，不使用 `blockId` fallback
4. 每张卡片可以被独立标记，不会相互影响

## 数据存储

### FSRSCard 字段
```typescript
interface FSRSCard {
  cardTypeMarker?: 'concept' | 'descriptor';  // 用户设置的类型标记
  type: CardType;                              // 技术类型（调度器类型）
  // ...
}
```

### 块属性
```typescript
{
  'custom-fsrs-card-type': 'concept' | 'descriptor',  // 类型标记
  'custom-card-type': 'item',                         // 技术类型
}
```

## 菜单显示

浏览器右键菜单 → 卡片类型 → 子菜单：
- 标记为 Topic
- 标记为 Item
- ─────────── (分隔线)
- 🧠 标记为概念卡
- 🏷️ 标记为描述符卡

## 注意事项

1. **概念卡和描述符卡都使用 FSRS 调度器**，不使用 A-Factor
2. **用户标记优先级最高**，不会被自动识别覆盖
3. **Xiuyuan 卡片完全兼容**，每张卡片可以独立标记
4. **必须有 fsrsCardId**，没有 fsrsCardId 的卡片会被跳过并警告
5. **三层保护机制**，确保用户标记在任何同步和迁移场景下都不会丢失

## 后续工作

根据 `.kiro/specs/card-type-system-enhancement/tasks.md`，Phase 2 和 Phase 3 已被快速制卡功能覆盖，不需要继续实现。

当前实现已完成：
- ✅ Phase 1: 核心数据模型
- ✅ 浏览器菜单集成
- ✅ 迁移系统保护
- ✅ HybridSync 同步保护
- ✅ Xiuyuan 卡片兼容性
