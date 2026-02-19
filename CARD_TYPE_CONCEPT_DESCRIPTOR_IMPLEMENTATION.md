# 概念卡与描述符卡实现总结

**实现日期**：2026-02-15  
**状态**：Phase 1 完成 ✅

---

## 📋 概述

成功将概念卡（Concept）和描述符卡（Descriptor）从映射到 `CardType.Item` 改为独立的 `CardType` 枚举值，并确保它们使用 FSRS 调度器进行调度。

---

## 🎯 核心架构变更

### 1. CardType 枚举扩展

**文件**：`src/types/card.ts`

```typescript
export enum CardType {
    Item = 'item',               // 普通闪卡（基于块）
    Topic = 'topic',             // 主题（增量阅读）
    Concept = 'concept',         // 概念卡（使用 FSRS 调度器）✨ 新增
    Descriptor = 'descriptor',   // 描述符卡（使用 FSRS 调度器）✨ 新增
    Incremental = 'incremental', // 增量内容
    Webpage = 'webpage',         // 网页卡片（渐进阅读）
}
```

**关键决策**：
- Concept 和 Descriptor 作为独立的枚举值，而非映射到 Item
- 两者都使用 FSRS 调度器（与 Item 相同）
- 区别在于语义和神经漫游队列的处理

---

### 2. 类型映射更新

**文件**：`src/core/card-type/type-mapping.ts`

```typescript
export const TYPE_MAPPING: Record<CardTypeMarker, CardType> = {
  concept: CardType.Concept,       // ✅ 直接映射到 Concept
  descriptor: CardType.Descriptor, // ✅ 直接映射到 Descriptor
};

export const REVERSE_TYPE_MAPPING: Record<CardType, CardTypeMarker[]> = {
  [CardType.Topic]: [],
  [CardType.Item]: [],
  [CardType.Concept]: ['concept'],       // ✅ 新增
  [CardType.Descriptor]: ['descriptor'], // ✅ 新增
  [CardType.Incremental]: [],
  [CardType.Webpage]: [],
};
```

---

### 3. 调度器路由增强

**文件**：`src/core/scheduler/SchedulerRouter.ts`

#### 3.1 getSchedulerType() 更新

```typescript
getSchedulerType(card: FSRSCard): SchedulerType {
    // 1. 检查卡片类型强制规则
    if (card.type === 'topic') {
        return 'a-factor-v2'; // Topic 使用 A-Factor
    }
    
    if (card.type === 'concept' || card.type === 'descriptor') {
        return 'fsrs-v5'; // ✅ Concept 和 Descriptor 使用 FSRS
    }

    // 2-4. 其他优先级规则...
}
```

#### 3.2 switchScheduler() 验证

```typescript
async switchScheduler(card: FSRSCard, newScheduler: SchedulerType): Promise<boolean> {
    // Topic 卡片验证
    if (card.type === 'topic') {
        if (newScheduler !== 'a-factor-v2') {
            console.error('[SchedulerRouter] Topic cards must use A-Factor v2 scheduler');
            return false;
        }
    }
    
    // ✅ Concept 和 Descriptor 卡片验证
    if (card.type === 'concept' || card.type === 'descriptor') {
        if (newScheduler !== 'fsrs-v5') {
            console.error('[SchedulerRouter] Concept and Descriptor cards must use FSRS scheduler');
            return false;
        }
    }
    
    // ...
}
```

---

### 4. 数据同步保护

#### 4.1 HybridSyncService 更新

**文件**：`src/services/HybridSyncService.ts`

```typescript
private convertRiffCardToFSRSCard(riffBlock: RiffBlock): FSRSCard {
    // 从块属性中读取卡片类型标记
    const cardTypeMarkerAttr = riffBlock.ial?.['custom-fsrs-card-type'];
    const cardTypeMarker = (cardTypeMarkerAttr === 'concept' || cardTypeMarkerAttr === 'descriptor')
        ? cardTypeMarkerAttr as 'concept' | 'descriptor'
        : undefined;
    
    let cardType: string;
    if (cardTypeMarker) {
        // ✅ 使用对应的 CardType 枚举值
        cardType = cardTypeMarker === 'concept' ? 'concept' : 'descriptor';
    } else {
        // 从块属性读取或使用默认值
        const cardTypeAttr = riffBlock.ial?.['custom-card-type'];
        cardType = (cardTypeAttr === 'topic' || cardTypeAttr === 'item' || 
                    cardTypeAttr === 'concept' || cardTypeAttr === 'descriptor') 
            ? cardTypeAttr 
            : 'item';
    }
    
    // ...
}
```

#### 4.2 迁移脚本保护

**文件**：`src/scripts/migrateToTopicItem.ts`

```typescript
export async function migrateSingleCard(blockId: string, forceRemigrate = false) {
    // 1. 获取现有属性
    const attrs = await getBlockAttrs(blockId);
    const cardTypeMarker = attrs?.['custom-fsrs-card-type'];

    // 2. ✅ 如果有用户设置的类型标记，优先使用（不受 forceRemigrate 影响）
    if (cardTypeMarker === 'concept' || cardTypeMarker === 'descriptor') {
        const inferredType = cardTypeMarker; // 使用新的枚举值
        
        if (existingType !== inferredType) {
            await setBlockAttrs(blockId, {
                [ATTR_CARD_TYPE]: inferredType,
            });
        }
        
        return { blockId, migrated: true, cardType: inferredType };
    }

    // 3. 检查已有类型标记（包括 concept 和 descriptor）
    if (!forceRemigrate && (existingType === 'topic' || existingType === 'item' || 
                            existingType === 'concept' || existingType === 'descriptor')) {
        return { blockId, migrated: false, cardType: existingType };
    }

    // 4. 自动检测...
}
```

---

## ✅ 测试覆盖

### 测试统计

- **type-mapping.test.ts**：25 个测试 ✅
- **CardTypeMarkerService.test.ts**：30 个测试 ✅
- **总计**：55 个单元测试全部通过

### 关键测试场景

1. **类型映射验证**
   - concept → CardType.Concept
   - descriptor → CardType.Descriptor
   - 反向映射正确

2. **CardTypeMarkerService**
   - 设置和获取类型标记
   - 批量操作
   - 缓存机制
   - 类型映射一致性验证
   - 自动修复不一致的卡片

3. **边界情况**
   - 不存在的卡片
   - 无效的类型映射
   - 缓存失效

---

## 🔒 数据保护机制

### 优先级规则

1. **用户设置的 cardTypeMarker**（最高优先级）
   - 永远不被自动检测覆盖
   - 不受 `forceRemigrate` 影响

2. **块属性中的 custom-card-type**
   - 如果没有 cardTypeMarker，使用此值

3. **自动检测**（最低优先级）
   - 仅在没有任何标记时执行

### Xiuyuan 卡片保护

**问题**：Xiuyuan 模板卡片的多个卡片共享同一个 `blockId`（代表块）

**解决方案**：
- 浏览器菜单使用 `fsrsCardId` 而非 `blockId` 查询卡片
- 完全移除 `blockId` 回退逻辑
- 避免标记错误的 Xiuyuan 卡片

---

## 🎨 UI 集成

### 浏览器右键菜单

**文件**：`src/ui/browser/composables/useCardActions.ts`

```typescript
{
  label: '卡片类型',
  icon: '🏷️',
  submenu: [
    {
      label: '标记为概念卡',
      icon: '🧠',
      action: async () => {
        const card = storage.getCard(fsrsCardId); // ✅ 使用 fsrsCardId
        if (!card) return;
        
        await cardTypeMarkerService.setCardTypeMarker(fsrsCardId, 'concept');
        showMessage('已标记为概念卡');
      }
    },
    {
      label: '标记为描述符卡',
      icon: '🏷️',
      action: async () => {
        const card = storage.getCard(fsrsCardId); // ✅ 使用 fsrsCardId
        if (!card) return;
        
        await cardTypeMarkerService.setCardTypeMarker(fsrsCardId, 'descriptor');
        showMessage('已标记为描述符卡');
      }
    }
  ]
}
```

---

## 📊 调度器行为

### 类型 → 调度器映射

| 卡片类型 | 调度器 | 说明 |
|---------|--------|------|
| Item | FSRS v5 | 普通闪卡 |
| Topic | A-Factor v2 | 增量阅读主题 |
| **Concept** | **FSRS v5** | **概念卡（新增）** |
| **Descriptor** | **FSRS v5** | **描述符卡（新增）** |
| Incremental | FSRS v5 | 增量内容 |
| Webpage | FSRS v5 | 网页卡片 |

### 调度器切换限制

- **Topic 卡片**：只能使用 A-Factor v2
- **Concept 卡片**：只能使用 FSRS v5
- **Descriptor 卡片**：只能使用 FSRS v5
- **其他类型**：可以自由切换

---

## 🚀 下一步计划

### Phase 2：神经漫游集成

1. **NeuralRoamSeedManager**
   - 管理概念卡种子列表
   - 实现种子数量限制
   - 批量操作支持

2. **自动添加机制**
   - 概念卡自动加入神经漫游队列
   - 配置开关

3. **权重计算**
   - 基于种子的权重计算
   - 集成到神经漫游队列

### Phase 3：快速制卡集成

1. **快速制卡符号**
   - `::` 创建概念卡
   - `;;` 创建描述符卡

2. **Xiuyuan 模板**
   - builtin-concept-descriptor 模板
   - 渲染逻辑

---

## 📝 关键文件清单

### 核心实现
- `src/types/card.ts` - CardType 枚举定义
- `src/core/card-type/type-mapping.ts` - 类型映射逻辑
- `src/core/card-type/CardTypeMarkerService.ts` - 类型标记服务
- `src/core/scheduler/SchedulerRouter.ts` - 调度器路由

### 数据同步
- `src/services/HybridSyncService.ts` - Riff 同步
- `src/scripts/migrateToTopicItem.ts` - 数据迁移

### UI
- `src/ui/browser/composables/useCardActions.ts` - 浏览器菜单

### 测试
- `src/core/card-type/__tests__/type-mapping.test.ts` - 类型映射测试
- `src/core/card-type/__tests__/CardTypeMarkerService.test.ts` - 服务测试

---

## 🎉 总结

Phase 1 成功完成了概念卡和描述符卡的核心架构实现：

1. ✅ 将 Concept 和 Descriptor 作为独立的 CardType 枚举值
2. ✅ 确保它们使用 FSRS 调度器
3. ✅ 实现完整的类型标记系统
4. ✅ 保护用户设置不被覆盖
5. ✅ 55 个单元测试全部通过
6. ✅ 浏览器菜单集成完成

系统现在已经准备好进入 Phase 2 的神经漫游集成阶段。
