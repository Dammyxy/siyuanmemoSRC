# 列表模版卡与描述符卡属性冲突修复

## 问题描述

列表模版卡在创建后，块属性中同时存在两个类型标记：
- `custom-fsrs-card-type="descriptor"` ❌ 旧的/错误的
- `custom-card-type="item"` ✅ 新的/正确的

这导致：
1. 渲染失败（显示"无法找到父概念，这可能是一个孤立的描述符卡"）
2. 类型识别混乱

## 根本原因

### 场景重现

1. 用户创建了一个包含 `;;` 符号的列表项（例如："测试 ;; 描述"）
2. AutoCardHandler 检测到 `;;` 符号，创建描述符卡
3. 设置块属性：`custom-fsrs-card-type="descriptor"`
4. 后来，用户删除了 `;;` 符号，改为 `→` 符号（例如："测试→2"）
5. 用户右键创建列表模版卡
6. XiuyuanRepository 设置块属性：`custom-card-type="item"`
7. 但旧的 `custom-fsrs-card-type="descriptor"` 仍然存在

### 属性冲突

```
块属性：
{
  "custom-fsrs-card-type": "descriptor",  // 旧的，来自 AutoCardHandler
  "custom-card-type": "item",             // 新的，来自 XiuyuanRepository
  "custom-xiuyuan-id": "xy_...",          // Xiuyuan ID
  "custom-xiuyuan-template": "builtin-list-item"
}
```

### 渲染逻辑

复习界面的渲染器选择逻辑：
1. 检查 `custom-fsrs-card-type`
2. 如果是 `descriptor`，使用 DescriptorCardRenderer
3. DescriptorCardRenderer 查找父概念卡
4. 找不到父概念卡，显示错误

## 解决方案

### 修复 1：清除旧的类型标记

在 `XiuyuanRepository.save()` 中，创建列表模版卡时清除旧的 `custom-fsrs-card-type` 属性：

```typescript
// 5.2 写入代表块属性
await setBlockAttrs(representativeBlockId, {
  'custom-xiuyuan-id': xiuyuan.getId().getValue(),
  'custom-xiuyuan-template': xiuyuan.getTemplateID().getValue(),
  'custom-card-type': cardType,
  'custom-fsrs-card-type': '',  // ✅ 清除旧的类型标记
});

// 5.3 列表模版卡：为所有子块设置 item 类型
for (const child of childrenData) {
  await setBlockAttrs(child.id, {
    'custom-card-type': 'item',
    'custom-fsrs-card-type': '',  // ✅ 清除旧的类型标记
  });
}
```

### 修复 2：AutoCardHandler 跳过 Xiuyuan 卡片

在 `AutoCardHandler.checkQuickSymbols()` 中，跳过已经是 Xiuyuan 卡片的块：

```typescript
// 2. ✅ 检查是否已经是 Xiuyuan 卡片（通过块属性）
const attrs = await getBlockAttrs(blockId);

if (attrs && (attrs['custom-xiuyuan-id'] || attrs['custom-fsrs-xiuyuan-id'])) {
  console.log('[SiYuanMemo][AutoCard] Block is already part of a Xiuyuan card, skipping:', blockId);
  return;
}
```

## 修复位置

1. `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` - save() 方法
2. `src/application/handlers/AutoCardHandler.ts` - checkQuickSymbols() 方法

## 验证方法

### 1. 清理旧数据

对于已经存在冲突的块，需要手动清理：

```javascript
// 在浏览器控制台执行
const { setBlockAttrs } = window.siyuan.api;

// 清除指定块的旧属性
await setBlockAttrs('20260220170417-jixrltw', {
  'custom-fsrs-card-type': ''
});
```

### 2. 测试新创建的列表模版卡

1. 创建一个有序列表（至少 2 个子项）
2. 右键父列表项 → 选择"创建列表模版卡"
3. 检查块属性：
   - ✅ `custom-card-type="item"`
   - ✅ `custom-fsrs-card-type` 不存在或为空
4. 进入复习界面，验证渲染正常

### 3. 测试属性冲突场景

1. 创建一个列表项，内容包含 `;;` 符号
2. 等待 AutoCardHandler 创建描述符卡
3. 检查块属性：`custom-fsrs-card-type="descriptor"`
4. 删除 `;;` 符号，改为 `→` 符号
5. 右键创建列表模版卡
6. 检查块属性：
   - ✅ `custom-card-type="item"`
   - ✅ `custom-fsrs-card-type` 为空（被清除）
7. 进入复习界面，验证渲染正常

## 影响范围

- ✅ 列表模版卡不会被 AutoCardHandler 误标记
- ✅ 创建列表模版卡时会清除旧的类型标记
- ✅ 渲染器能正确识别列表模版卡
- ✅ 不影响正常的描述符卡功能

## 相关文件

- `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` - 修复位置 1
- `src/application/handlers/AutoCardHandler.ts` - 修复位置 2
- `src/ui/review/v2/components/XiuyuanListTemplateCard.vue` - 列表模版卡渲染器
- `src/core/card/descriptor-card/application/DescriptorCardRenderService.ts` - 描述符卡渲染器

## 设计原则

1. **属性清理**：创建新卡片时，清除可能冲突的旧属性
2. **防御性检查**：AutoCardHandler 应该检查块是否已经是其他类型的卡片
3. **单一类型**：一个块只能有一个卡片类型标记
4. **优先级**：Xiuyuan 卡片的类型标记优先级最高
