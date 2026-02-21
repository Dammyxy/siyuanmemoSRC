# 列表模版卡类型识别修复

## 问题描述

列表模版卡创建后，子卡片的类型识别存在错误：

1. **卡片数据中的类型**：因为子列表项没有答案（没有子级列表），被 `CardTypeDetectionService` 错误识别为 `topic`
2. **块属性中的类型**：创建时没有设置 `custom-card-type` 属性
3. **类型冲突**：卡片数据和块属性中的类型不一致，导致显示和过滤问题

## 根本原因

### 1. 卡片类型检测逻辑不适用于列表模版卡

`CardTypeDetectionService.detectCardType()` 的检测规则：
- 列表项有子级 → `item`
- 列表项无子级 → `topic`

但列表模版卡的子列表项通常没有子级（只是文本内容），所以被错误识别为 `topic`。

### 2. 保存时未设置块属性

`XiuyuanRepository.save()` 方法只设置了：
- `custom-xiuyuan-id`
- `custom-xiuyuan-template`

没有设置 `custom-card-type` 属性。

## 解决方案

### 修复 1：强制列表模版卡类型为 `item`

在 `XiuyuanRepository.cardToFSRSCard()` 中，检测到列表模版卡时，直接设置为 `item` 类型：

```typescript
// ✅ 修复：列表模版卡的子卡片强制为 item 类型
let cardType: 'item' | 'topic' = 'item';

if (meta.listTemplate && Array.isArray(meta.listTemplate.childrenData)) {
  // 列表模版卡：所有子卡片都是 item 类型
  cardType = 'item';
  console.log(`[XiuyuanRepository] List template card detected, forcing cardType to 'item'`);
} else {
  // 非列表模版卡：使用 CardTypeDetectionService 检测
  const blockId = blockIDs[0]?.getValue() || '';
  
  if (this.cardTypeDetectionService && blockId) {
    try {
      cardType = await this.cardTypeDetectionService.detectCardType(blockId);
    } catch (error) {
      console.warn(`[XiuyuanRepository] Failed to detect cardType, using default 'item':`, error);
    }
  }
}
```

### 修复 2：保存时写入块属性

在 `XiuyuanRepository.save()` 中，为所有相关块设置 `custom-card-type` 属性：

```typescript
// 5.1 确定卡片类型
let cardType: 'item' | 'topic' = 'item';
if (meta.listTemplate && Array.isArray(meta.listTemplate.childrenData)) {
  // 列表模版卡：强制为 item
  cardType = 'item';
} else if (this.cardTypeDetectionService && blockIDs.length > 0) {
  // 非列表模版卡：检测类型
  try {
    cardType = await this.cardTypeDetectionService.detectCardType(blockIDs[0].getValue());
  } catch (error) {
    console.warn('[XiuyuanRepository] Failed to detect cardType, using default "item":', error);
  }
}

// 5.2 写入代表块属性
await setBlockAttrs(representativeBlockId, {
  'custom-xiuyuan-id': xiuyuan.getId().getValue(),
  'custom-xiuyuan-template': xiuyuan.getTemplateID().getValue(),
  'custom-card-type': cardType,  // ✅ 添加卡片类型属性
});

// 5.3 列表模版卡：为所有子块设置 item 类型
if (meta.listTemplate && Array.isArray(meta.listTemplate.childrenData)) {
  const childrenData = meta.listTemplate.childrenData;
  for (const child of childrenData) {
    await setBlockAttrs(child.id, {
      'custom-card-type': 'item',  // ✅ 子块也设置为 item
    });
  }
}
```

## 数据源说明

### 为什么需要同时设置两个地方？

列表模版卡的类型需要在两个地方设置：

1. **卡片数据（FSRSCard.type）**：
   - 存储在 msgpack 文件的 `cardDTOs` 中
   - 运行时使用（复习、浏览、过滤）
   - 由 `XiuyuanRepository.cardToFSRSCard()` 生成

2. **块属性（custom-card-type）**：
   - 存储在思源笔记数据库中
   - 用户可见（块属性面板）
   - 保持数据一致性

### 这不是重复！

**数据流向**：
```
创建时：
  XiuyuanRepository.save()
    ├─ cardToFSRSCard(): 生成 FSRSCard.type = 'item'
    └─ setBlockAttrs: 写入 custom-card-type = 'item'

同步时：
  XiuyuanSyncService.incrementalSync()
    └─ 检测到 custom-xiuyuan-id → 跳过（不读取块属性）✅

使用时：
  复习/浏览
    └─ 使用 FSRSCard.type（从 cardDTOs）✅
```

**关键点**：
- 列表模版卡有 `custom-xiuyuan-id` 属性
- 同步时会被识别为 Xiuyuan 卡片并跳过
- 不会通过 RiffMapper 从块属性读取类型
- 块属性只是为了用户可见性和数据一致性

### 与普通卡片的区别

| 卡片类型 | 同步行为 | 类型来源 |
|---------|---------|---------|
| **列表模版卡** | 跳过（有 custom-xiuyuan-id） | XiuyuanRepository.cardToFSRSCard() |
| **普通卡片** | 同步（无 custom-xiuyuan-id） | RiffMapper（从块属性读取） |

**结论**：列表模版卡的类型完全由 XiuyuanRepository 控制，不会被同步覆盖。

文件：`src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`

1. `cardToFSRSCard()` 方法（第 324 行附近）
2. `save()` 方法（第 130 行附近）

## 验证方法

### 1. 创建列表模版卡

1. 在思源笔记中创建一个有序列表（至少 2 个子项）：
   ```markdown
   1. 问题标题
      1. 提示1 → 答案1
      2. 提示2 → 答案2
      3. 提示3 → 答案3
   ```

2. 右键父列表项 → 选择"创建列表模版卡"

3. 查看控制台日志，应该看到：
   ```
   [XiuyuanRepository] List template card detected, forcing cardType to 'item'
   [SiYuanMemo] 🎉 List template cards creation complete: {xiuyuan: {…}, cards: Array(3)}
   ```

### 2. 验证块属性

使用思源的块属性面板（右键块 → 属性）检查：

- 父列表项的段落块：
  - `custom-xiuyuan-id`: `xy_...`
  - `custom-xiuyuan-template`: `builtin-list-item`
  - `custom-card-type`: `item` ✅

- 所有子列表项：
  - `custom-card-type`: `item` ✅

### 3. 验证卡片数据

在浏览器控制台中执行：
```javascript
// 获取存储管理器
const storage = window.siyuanMemoPlugin.context.getUnifiedStorageManager();

// 查找列表模版卡
const cards = storage.getAllCards();
const listTemplateCards = cards.filter(c => c.meta?.listTemplate);

// 检查类型
listTemplateCards.forEach(card => {
  console.log(`Card ${card.id}: type=${card.type}, meta.cue=${card.meta.cue}`);
});
```

预期输出：
```
Card xy_..._0: type=item, meta.cue=提示1
Card xy_..._1: type=item, meta.cue=提示2
Card xy_..._2: type=item, meta.cue=提示3
```

### 4. 验证复习界面

1. 进入复习界面
2. 找到列表模版卡
3. 验证：
   - ✅ 正面显示问题和当前提示
   - ✅ 背面显示问题、已学过的答案和当前答案
   - ✅ 渐进式显示功能正常

### 5. 验证卡片浏览器

1. 打开卡片浏览器
2. 使用类型过滤器选择 "Item"
3. 验证列表模版卡能被正确显示
4. 使用类型过滤器选择 "Topic"
5. 验证列表模版卡不会被显示

## 影响范围

- ✅ 列表模版卡的所有子卡片类型统一为 `item`
- ✅ 卡片数据和块属性中的类型保持一致
- ✅ 卡片浏览器的类型过滤功能正常工作
- ✅ 复习界面的类型显示正确
- ✅ 不影响其他类型的卡片（普通卡、多挖空卡等）

## 相关文件

- `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` - 修复位置
- `src/core/xiuyuan/domain/services/CardTypeDetectionService.ts` - 类型检测服务
- `src/application/usecases/xiuyuan/CreateListTemplateCardsUseCase.ts` - 列表模版卡创建用例
- `src/ui/review/v2/components/XiuyuanListTemplateCard.vue` - 列表模版卡渲染器

## 设计原则

1. **单一数据源**：卡片类型应该在一个地方确定，然后同步到所有需要的地方
2. **一致性**：卡片数据和块属性中的类型必须保持一致
3. **特殊处理**：列表模版卡是特殊类型，需要特殊的类型识别逻辑
4. **防御性编程**：块属性写入失败不应该阻止保存流程
