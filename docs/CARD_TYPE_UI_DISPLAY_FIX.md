# 卡片类型 UI 显示修复

**修复日期**：2026-02-15  
**问题**：标记为概念卡或描述符卡后,在浏览器中没有显示类型标识

---

## 🐛 问题分析

用户通过右键菜单标记卡片为概念卡或描述符卡后,在卡片浏览器的 CardType 列中没有显示对应的标识。

### 根本原因

1. **列定义缺失**：`columnDefs.ts` 中的 CardType 列只处理了 `topic` 和 `item` 类型
2. **类型定义不完整**：`BrowserCard` 接口的 `cardType` 字段类型中没有包含 `concept` 和 `descriptor`
3. **过滤器缺失**：卡片类型过滤器中没有概念卡和描述符卡的选项

---

## ✅ 修复内容

### 1. 更新列定义 (columnDefs.ts)

**文件**：`src/ui/browser/config/columnDefs.ts`

```typescript
// CardType - 卡片类型 (Topic/Item/Concept/Descriptor)
{
  field: 'cardType',
  headerName: 'CardType',
  width: 90,  // ✅ 增加宽度以容纳更长的文本
  valueFormatter: (params) => {
    const type = params.value;
    if (type === 'topic') return '📄 Topic';
    if (type === 'item') return '❓ Item';
    if (type === 'concept') return '🧠 Concept';        // ✅ 新增
    if (type === 'descriptor') return '🏷️ Descriptor';  // ✅ 新增
    return '-';
  },
  cellStyle: (params) => {
    const type = params.value;
    if (type === 'topic') {
      return { color: 'var(--b3-theme-info)', fontWeight: 500 };
    }
    if (type === 'item') {
      return { color: 'var(--b3-theme-success)', fontWeight: 500 };
    }
    if (type === 'concept') {
      return { color: 'var(--b3-theme-primary)', fontWeight: 600 };  // ✅ 新增
    }
    if (type === 'descriptor') {
      return { color: 'var(--b3-theme-secondary)', fontWeight: 500 };  // ✅ 新增
    }
    return {};
  },
},
```

**视觉效果**：
- 🧠 Concept - 主题色，加粗显示
- 🏷️ Descriptor - 次要色，正常粗细

---

### 2. 更新类型定义 (types.ts)

**文件**：`src/ui/browser/types.ts`

#### 2.1 BrowserCard 接口

```typescript
// Topic/Item/Concept/Descriptor 区分
cardType?: 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage';  // ✅ 添加 concept 和 descriptor
aFactor?: number;  // A-Factor (仅 Topic 卡片)
```

#### 2.2 CardTypeFilter 类型

```typescript
/** 卡片类型筛选 */
export type CardTypeFilter = 'all' | 'topic-only' | 'item-only' | 'concept-only' | 'descriptor-only';  // ✅ 添加新类型
```

#### 2.3 筛选预设

```typescript
export const FILTER_PRESETS: FilterPreset[] = [
  // ...
  // Topic/Item/Concept/Descriptor 筛选
  { key: 'topic-only', label: '仅主题', icon: 'iconFile' },
  { key: 'item-only', label: '仅卡片', icon: 'iconCheck' },
  { key: 'concept-only', label: '仅概念卡', icon: 'iconBrain' },        // ✅ 新增
  { key: 'descriptor-only', label: '仅描述符卡', icon: 'iconTag' },     // ✅ 新增
];
```

---

### 3. 更新过滤逻辑

#### 3.1 常量定义 (constants.ts)

**文件**：`src/ui/browser/constants.ts`

```typescript
export const FILTER_PRESETS = {
  // ...
  TOPIC_ONLY: 'topic-only',
  ITEM_ONLY: 'item-only',
  CONCEPT_ONLY: 'concept-only',        // ✅ 新增
  DESCRIPTOR_ONLY: 'descriptor-only',  // ✅ 新增
} as const;
```

#### 3.2 过滤函数 (cardFilters.ts)

**文件**：`src/ui/browser/utils/cardFilters.ts`

```typescript
export function applyCardTypeFilter(cards: BrowserCard[], cardType: CardTypeFilter): BrowserCard[] {
  switch (cardType) {
    case 'all':
      return cards;
    
    case 'topic-only':
      return cards.filter(card => card.cardType === 'topic');
    
    case 'item-only':
      return cards.filter(card => card.cardType === 'item' || !card.cardType);
    
    case 'concept-only':  // ✅ 新增
      return cards.filter(card => card.cardType === 'concept');
    
    case 'descriptor-only':  // ✅ 新增
      return cards.filter(card => card.cardType === 'descriptor');
    
    default:
      return cards;
  }
}
```

#### 3.3 分组逻辑 (helpers.ts)

**文件**：`src/ui/browser/utils/helpers.ts`

```typescript
for (const card of cards) {
  if (card.cardType === 'topic') {
    groups.topic.push(card);
  } else if (card.cardType === 'item') {
    groups.item.push(card);
  } else if (card.cardType === 'concept') {  // ✅ 新增
    groups.concept = groups.concept || [];
    groups.concept.push(card);
  } else if (card.cardType === 'descriptor') {  // ✅ 新增
    groups.descriptor = groups.descriptor || [];
    groups.descriptor.push(card);
  } else {
    // ...
  }
}
```

---

## 🎨 UI 效果

### CardType 列显示

| 卡片类型 | 显示文本 | 图标 | 颜色 | 字重 |
|---------|---------|------|------|------|
| Topic | 📄 Topic | 📄 | Info (蓝色) | 500 |
| Item | ❓ Item | ❓ | Success (绿色) | 500 |
| **Concept** | **🧠 Concept** | **🧠** | **Primary (主题色)** | **600** |
| **Descriptor** | **🏷️ Descriptor** | **🏷️** | **Secondary (次要色)** | **500** |

### 筛选器选项

用户现在可以在浏览器中使用以下筛选器：
- 全部卡片
- 仅主题 (Topic)
- 仅卡片 (Item)
- **仅概念卡 (Concept)** ✨
- **仅描述符卡 (Descriptor)** ✨

---

## 🔄 数据流

```
用户标记卡片
    ↓
CardTypeMarkerService.setCardTypeMarker()
    ↓
更新 FSRSCard.cardTypeMarker = 'concept' | 'descriptor'
更新 FSRSCard.type = CardType.Concept | CardType.Descriptor
    ↓
同步到块属性 custom-fsrs-card-type
    ↓
HybridSyncService 加载卡片
    ↓
convertRiffCardToFSRSCard() 读取 cardTypeMarker
    ↓
BrowserCard.cardType = 'concept' | 'descriptor'
    ↓
AG-Grid 渲染
    ↓
columnDefs.ts valueFormatter 显示 🧠 Concept 或 🏷️ Descriptor
```

---

## 📝 待完成的工作

虽然 UI 显示已经修复,但还有一些相关功能需要在后续 Phase 中实现：

### Phase 2：神经漫游集成
- [ ] 概念卡自动加入神经漫游队列
- [ ] 神经漫游种子管理
- [ ] 权重计算

### Phase 3：快速制卡集成
- [ ] `::` 符号创建概念卡
- [ ] `;;` 符号创建描述符卡
- [ ] Xiuyuan 模板支持

### Phase 4：UI 增强
- [ ] 卡片浏览器中显示神经漫游种子标识
- [ ] 复习界面显示父概念上下文
- [ ] 神经漫游导航增强

---

## ✅ 验证步骤

1. **标记卡片**
   - 在浏览器中右键点击卡片
   - 选择"卡片类型" → "标记为概念卡"
   - 确认提示消息显示

2. **查看显示**
   - 刷新浏览器或重新加载
   - 在 CardType 列中应该看到 "🧠 Concept"
   - 文本应该是主题色且加粗

3. **测试过滤**
   - 点击筛选器
   - 选择"仅概念卡"
   - 应该只显示概念卡

4. **测试描述符卡**
   - 重复上述步骤,标记为描述符卡
   - 应该看到 "🏷️ Descriptor"

---

## 🎉 总结

修复完成后,用户现在可以：
1. ✅ 在浏览器中看到概念卡和描述符卡的类型标识
2. ✅ 使用过滤器筛选特定类型的卡片
3. ✅ 通过视觉样式区分不同类型的卡片

所有修改都是向后兼容的,不会影响现有的 Topic 和 Item 卡片的显示。
