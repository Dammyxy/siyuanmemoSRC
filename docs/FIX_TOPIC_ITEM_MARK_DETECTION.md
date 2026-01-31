# 修复 Topic/Item 识别：支持标记语法

## 问题描述

用户反馈：在闪卡浏览器里点击"识别 topic/item 类型"时，少了个标记识别。

例如：`【 item ==测试==】` 这个应该被识别为 Item 闪卡，但实际上没有被识别。

## 根本原因

原来的 `detectCardType` 函数使用 `getBlockText()` 获取块内容，这个函数会将 DOM 转换为纯文本，**去除所有 HTML 标签和 markdown 标记**。

### 原来的代码
```typescript
const content = await getBlockText(blockId);
if (/::/.test(content)) {
    return true;  // Item
}
```

### 问题分析
1. `getBlockText()` 使用 `domToText()` 转换，会去除标记语法
2. `【 item ==测试==】` 变成 `【 item 测试】`
3. 标记语法 `==...==` 被完全去除，无法检测

### 为什么标记语法很重要？
在思源笔记中，`==文本==` 是标记语法，用于高亮显示重要内容。在闪卡中，标记通常用于：
- 强调答案部分
- 标注关键概念
- 突出重要信息

因此，**包含标记语法的块通常是 Item（问答卡片）**，而不是 Topic（纯阅读材料）。

## 解决方案

### 核心思路
使用 SQL 查询获取块的 `markdown` 或 `content` 字段（包含原始标记），而不是使用 `getBlockText()`（会去除标记）。

### 修改的代码

#### 1. 获取原始内容（包含标记）
```typescript
// 0. 获取块的原始内容（包含 markdown 标记）
// 使用 SQL 查询获取 markdown 字段，而不是 getBlockText（会去除标记）
const blockData = await sql(`
    SELECT markdown, content FROM blocks
    WHERE id = '${blockId}'
    LIMIT 1
`);

const markdown = blockData && blockData.length > 0 ? blockData[0].markdown : '';
const content = blockData && blockData.length > 0 ? blockData[0].content : '';
```

#### 2. 检测标记语法
```typescript
// 1. 内容包含标记语法（==文本==）→ Item
// 标记通常用于强调答案或重要内容，是 Item 的特征
if (/==([^=]+)==/.test(markdown) || /==([^=]+)==/.test(content)) {
    console.log(`[FSRS] Block ${blockId}: Item (mark syntax == found)`);
    return true;
}
```

#### 3. 检测 :: 分隔符
```typescript
// 2. 内容包含 :: 分隔符 → Item（明确的问答卡片）
if (/::/.test(content)) {
    console.log(`[FSRS] Block ${blockId}: Item (:: separator found)`);
    return true;
}
```

### 检测优先级
1. **标记语法** `==...==` → Item（新增）
2. **分隔符** `::` → Item
3. **标题块** `type='h'` → Item
4. **列表项** `type='i'` + 有列表子级 → Item
5. **超级块** `type='s'` + 有任何子级 → Item
6. **其他** → Topic

## 修复后的效果

### 示例 1：标记语法
```markdown
【 item ==测试==】
```
- **原来**：识别为 Topic ❌（标记被去除）
- **现在**：识别为 Item ✅（检测到 `==测试==`）

### 示例 2：问答卡片
```markdown
什么是 FSRS？::一个间隔重复算法
```
- **原来**：识别为 Item ✅（检测到 `::`）
- **现在**：识别为 Item ✅（仍然有效）

### 示例 3：标题块
```markdown
# 标题
```
- **原来**：识别为 Item ✅（type='h'）
- **现在**：识别为 Item ✅（仍然有效）

### 示例 4：纯文本
```markdown
这是一段纯文本
```
- **原来**：识别为 Topic ✅
- **现在**：识别为 Topic ✅（仍然有效）

## 思源笔记中的标记语法

### 支持的标记类型
- `==文本==` - 高亮标记（mark）
- `**文本**` - 加粗（bold）
- `*文本*` - 斜体（italic）
- `~~文本~~` - 删除线（strikethrough）
- `` `文本` `` - 行内代码（code）

### 为什么只检测 `==...==`？
1. **高亮标记最常用于答案**：在问答卡片中，答案通常用高亮标记
2. **其他标记太常见**：加粗、斜体等在 Topic 中也很常见
3. **避免误判**：只检测最具特征性的标记

## 相关文件

- `siyuan-plugin-fsrs/src/core/card-builder/detectCardType.ts`

## 总结

这个修复让 Topic/Item 识别功能能够正确处理标记语法：
- **新增检测**：`==文本==` 标记语法 → Item
- **保持兼容**：原有的检测规则仍然有效
- **提高准确性**：更符合用户的使用习惯

现在包含标记语法的块会被正确识别为 Item 闪卡了！
