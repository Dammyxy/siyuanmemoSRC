# 快速制卡符号隐藏功能测试

## 问题描述

快速制卡在复习界面中，符号（`>>`, `::`, `;;`, `{{}}`）应该被隐藏，但其他内容应该正常显示。

## 根源问题

`UnifiedQueueStrategy.addNextDues()` 方法使用对象展开语法 `{ ...card, nextDues }` 创建新对象，可能导致字段丢失。

## 修复方案

直接在原对象上添加 `nextDues` 字段：

```typescript
// 修改文件: src/strategies/UnifiedQueueStrategy.ts (line ~540)
(card as any).nextDues = nextDues;
return card;
```

## 测试步骤

### 步骤 1: 刷新思源笔记

按 `F5` 或重启思源笔记，确保新代码生效。

### 步骤 2: 检查数据库中的卡片

在浏览器控制台运行：

```javascript
// 复制 CHECK_DB_CARD.js 的内容并运行
```

**预期结果：**
- 应该能看到快速制卡的 `meta.cardSource === 'quick-symbol'`
- 应该能看到 `meta.symbolType`, `meta.question`, `meta.answer` 等字段

### 步骤 3: 打开复习对话框

点击插件图标，选择"检索练习"。

### 步骤 4: 检查 ReviewContent 接收到的数据

在浏览器控制台运行：

```javascript
// 复制 CHECK_REVIEW_CARD.js 的内容并运行
```

**预期结果：**
- `card.meta.cardSource` 应该为 `'quick-symbol'`（如果是快速制卡）
- `isQuickCard` 应该为 `true`
- 控制台应该显示"✅ 是快速制卡"

### 步骤 5: 验证 UI 行为

在复习界面中：

1. **快速制卡（cardSource === 'quick-symbol'）：**
   - ✅ 符号（`>>`, `::`, `;;`, `{{}}`）应该被隐藏
   - ✅ 问题内容应该正常显示
   - ✅ 点击"显示答案"后，答案应该出现
   - ✅ 答案中的符号也应该被隐藏

2. **普通卡片：**
   - ✅ 应用标准隐藏行为（所有内容初始隐藏）

## 调试脚本

### CHECK_DB_CARD.js
检查数据库中卡片的 `meta` 字段是否正确存储。

### CHECK_REVIEW_CARD.js
检查 `ReviewContent.vue` 接收到的 `props.content.card` 是否包含完整的 `meta` 字段。

### FINAL_TEST.js
完整的端到端测试（需要修复 API 调用）。

## 相关代码

### 数据流

1. **AutoCardHandler** (src/services/handlers/AutoCardHandler.ts)
   - 检测快速制卡符号
   - 设置 `meta.cardSource = 'quick-symbol'`
   - 设置 `meta.symbolType`, `meta.question`, `meta.answer`

2. **RetrievalPracticeQueue** (src/queues/RetrievalPracticeQueue.ts)
   - 从 `UnifiedDataSourceManager` 获取卡片
   - 卡片包含完整的 `meta` 字段

3. **UnifiedQueueStrategy** (src/strategies/UnifiedQueueStrategy.ts)
   - `next()` 方法调用 `addNextDues(card)`
   - ✅ 现在直接在原对象上添加 `nextDues`，保留所有字段

4. **ReviewContent.vue** (src/ui/review/v2/ReviewContent.vue)
   - 检查 `props.content.card.meta.cardSource === 'quick-symbol'`
   - 快速制卡：只应用 `card__block--hidemark` 类
   - 普通卡片：应用所有隐藏类

### 关键代码位置

**UnifiedQueueStrategy.ts (line ~540):**
```typescript
// 🔧 直接在原对象上添加 nextDues，避免展开语法丢失字段
(card as any).nextDues = nextDues;
return card;
```

**ReviewContent.vue (line ~210, ~310):**
```typescript
const cardMeta = (props.content.card as any)?.meta;
const isQuickCard = cardMeta?.cardSource === 'quick-symbol';

if (isQuickCard) {
    console.log('[FSRS ReviewContent] Quick card detected, only hiding symbols');
    // 只隐藏符号
    protyle.protyle.element.classList.add('card__block--hidemark');
} else {
    // 隐藏所有内容（标准行为）
    protyle.protyle.element.classList.add('card__block--hidemark');
    protyle.protyle.element.classList.add('card__block--hideli');
    protyle.protyle.element.classList.add('card__block--hidesb');
    protyle.protyle.element.classList.add('card__block--hideh');
}
```

## 故障排除

### 问题 1: meta 字段为空

**症状：** `card.meta` 为 `undefined` 或 `null`

**原因：** 卡片可能是在快速制卡功能实现之前创建的

**解决：** 重新创建卡片或手动触发 WebSocket 更新

### 问题 2: cardSource 不是 'quick-symbol'

**症状：** `card.meta.cardSource` 为 `undefined` 或其他值

**原因：** 
- 卡片不是通过快速制卡符号创建的
- AutoCardHandler 没有正确检测符号

**解决：** 检查块内容是否包含快速制卡符号（`>>`, `::`, `;;`, `{{}}`）

### 问题 3: 符号没有被隐藏

**症状：** 复习界面中符号仍然可见

**原因：** 
- CSS 类没有正确应用
- `isQuickCard` 检测失败

**解决：** 
1. 运行 `CHECK_REVIEW_CARD.js` 检查 `isQuickCard` 值
2. 检查浏览器开发者工具中的 CSS 类
3. 确认 `card__block--hidemark` 类已应用

## 成功标准

- ✅ 数据库中的快速制卡有 `meta.cardSource === 'quick-symbol'`
- ✅ `ReviewContent` 接收到完整的 `meta` 字段
- ✅ `isQuickCard` 检测正确
- ✅ 复习界面中符号被隐藏
- ✅ 其他内容正常显示
