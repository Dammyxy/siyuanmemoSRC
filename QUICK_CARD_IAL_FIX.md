# 快速制卡 IAL 清理修复

**创建时间**：2026-02-15  
**状态**：✅ 已修复

---

## 问题描述

用户反馈：控制台显示卡片元数据正常，但复习界面仍然显示完整的块内容（包含符号）。

### 问题分析

通过控制台检查发现，答案字段包含了 IAL（Inline Attribute List）：

```javascript
answer: "{: updated=\"20260215132130\" id=\"20260215132056-no2qm2b\"}"
```

**原因**：
- 使用 `getBlockKramdown()` 获取块内容时，返回的是 kramdown 格式
- kramdown 格式包含 IAL（`{: ...}`）
- 在解析问题和答案时，没有清理 IAL
- 导致答案中包含了 IAL 内容

---

## 解决方案

### 1. 添加 IAL 清理方法

在 `AutoCardHandler` 中添加 `cleanIAL()` 方法：

```typescript
/**
 * 清理 IAL（Inline Attribute List）
 * 
 * 移除 kramdown 格式中的 IAL，例如：
 * - `{: updated="20260215132130" id="20260215132056-no2qm2b"}`
 * - `{: .class #id}`
 * 
 * @param text 文本
 * @returns 清理后的文本
 */
private cleanIAL(text: string): string {
    // 移除 IAL：{: ...}
    return text.replace(/\s*\{:.*?\}\s*/g, ' ').trim();
}
```

### 2. 在解析后清理 IAL

#### 基础卡片（>>, <<, <>）

```typescript
// 解析问题和答案
if (direction === 'forward') {
    const match = content.match(this.patterns.basicForward);
    if (match) {
        question = match[1].trim();
        answer = match[2].trim();
    }
}

// 🆕 清理 IAL
question = this.cleanIAL(question);
answer = this.cleanIAL(answer);
```

#### 概念卡片（::）

```typescript
// 解析概念和定义
const match = content.match(this.patterns.concept);
if (match) {
    concept = match[1].trim();
    definition = match[2].trim();
}

// 🆕 清理 IAL
concept = this.cleanIAL(concept);
definition = this.cleanIAL(definition);
```

#### 描述符卡片（;;）

```typescript
// 解析属性和描述
const match = content.match(this.patterns.descriptor);
if (match) {
    attribute = match[1].trim();
    description = match[2].trim();
}

// 🆕 清理 IAL
attribute = this.cleanIAL(attribute);
description = this.cleanIAL(description);
```

---

## 修改文件

- `src/services/handlers/AutoCardHandler.ts`
  - 添加 `cleanIAL()` 方法
  - 在 `createBasicCard()` 中清理 IAL
  - 在 `createConceptCard()` 中清理 IAL
  - 在 `createDescriptorCard()` 中清理 IAL

---

## 测试步骤

### 1. 删除旧卡片

旧卡片的答案字段已经包含了 IAL，需要删除重新创建。

在块菜单中选择"从 Riff 中移除"。

### 2. 重新构建插件

```bash
cd siyuan-plugin-siyuanmemo
npm run build
```

### 3. 重启思源

重启思源笔记或重新加载插件。

### 4. 创建新卡片

```
正面 >> 背面
```

等待 300ms，应该看到提示：
```
✅ 已创建正向卡片 (>>)
```

### 5. 检查元数据

在浏览器控制台中运行：

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const card = plugin.storage.getCardByBlockId('你的块ID');
console.log('question:', card?.meta?.question);
console.log('answer:', card?.meta?.answer);
```

**预期输出**：
```
question: 正面
answer: 背面
```

**不应该包含 IAL**：
```
❌ answer: {: updated="..." id="..."}
✅ answer: 背面
```

### 6. 测试复习界面

打开"提取练习"复习对话框。

**正面**：
- 只显示"正面"
- 不显示符号和答案

**背面**：
- 显示"正面"
- 显示分隔线
- 显示"背面"
- 不显示 IAL

---

## IAL 格式说明

IAL（Inline Attribute List）是 kramdown 格式的一部分，用于为块添加属性。

### 常见格式

```markdown
文本 {: .class #id key="value"}
```

### 示例

```markdown
正面 >> 背面 {: updated="20260215132130" id="20260215132056-no2qm2b"}
```

### 清理后

```markdown
正面 >> 背面
```

---

## 为什么之前没有起作用？

### 原因 1：IAL 污染

答案字段包含了 IAL，导致：
- 答案显示为 `{: updated="..." id="..."}`
- 无法正确渲染答案内容

### 原因 2：没有重新创建卡片

旧卡片的元数据已经保存，包含了错误的答案字段。

即使修复了代码，旧卡片仍然会显示错误的内容。

**解决方法**：
- 删除旧卡片
- 重新创建新卡片

---

## 相关问题

### Q1: 为什么控制台显示正常，但复习界面不正常？

**A**: 有两个可能的原因：

1. **卡片元数据包含 IAL**
   - 检查 `card.meta.answer` 是否包含 `{: ...}`
   - 如果包含，需要删除卡片重新创建

2. **代码没有重新构建**
   - 修改代码后需要运行 `npm run build`
   - 重启思源或重新加载插件

### Q2: 如何批量清理旧卡片的 IAL？

**A**: 目前没有自动清理功能，需要手动操作：

1. 导出卡片数据（如果需要保留复习记录）
2. 删除旧卡片
3. 重新输入符号创建新卡片
4. 导入复习记录（如果需要）

或者等待后续版本的自动迁移功能。

### Q3: 填空卡片也需要清理 IAL 吗？

**A**: 是的，填空卡片也可能包含 IAL。

但是填空卡片的处理方式不同：
- 填空卡片使用 `clozePositions` 记录位置
- 位置是基于原始内容计算的
- 如果清理 IAL，位置会偏移

**建议**：
- 暂时不清理填空卡片的 IAL
- 等待后续版本优化填空卡片的处理逻辑

---

## 总结

已完成以下修复：

1. ✅ 添加 `cleanIAL()` 方法
2. ✅ 在基础卡片中清理 IAL
3. ✅ 在概念卡片中清理 IAL
4. ✅ 在描述符卡片中清理 IAL

现在用户需要：
1. 重新构建插件：`npm run build`
2. 重启思源笔记
3. 删除旧卡片
4. 重新创建新卡片

新创建的卡片将不再包含 IAL，复习界面会正确显示问题和答案。

---

**文档版本**：v1.0  
**最后更新**：2026-02-15  
**状态**：✅ 已完成
