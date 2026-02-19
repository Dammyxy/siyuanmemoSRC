# 快速制卡答案渲染 - 修复总结

**创建时间**：2026-02-15  
**状态**：✅ 已修复

---

## 修复内容

### 1. 隐藏符号

**问题**：用户反馈符号（`>>`, `::` 等）显示在复习界面中，影响美观。

**解决方案**：修改渲染逻辑，不再显示符号。

**修改文件**：`src/strategies/UnifiedReviewAdapter.ts`

#### 修改前

```typescript
// 背面：显示问题 + 答案
return {
    type: 'html',
    id: card.blockId,
    data: `
        <div class="quick-card-content">
            <div class="quick-card-question">${this.escapeHtml(question)}</div>
            <div class="quick-card-divider">
                <span>${symbolType}</span>  // ❌ 显示符号
            </div>
            <div class="quick-card-answer">${this.escapeHtml(answer)}</div>
        </div>
    `
};
```

#### 修改后

```typescript
// 背面：显示问题 + 答案（不显示符号）
return {
    type: 'html',
    id: card.blockId,
    data: `
        <div class="quick-card-content">
            <div class="quick-card-question">${this.escapeHtml(question)}</div>
            <div class="quick-card-divider">
                <span></span>  // ✅ 不显示符号
            </div>
            <div class="quick-card-answer">${this.escapeHtml(answer)}</div>
        </div>
    `
};
```

**影响的卡片类型**：
- ✅ 基础卡片（`>>`, `<<`, `<>`）
- ✅ 概念卡片（`::`）

**填空卡片**（`{{}}`）不受影响，因为它没有分隔线。

---

### 2. 添加调试日志

**问题**：用户反馈答案渲染没有起作用，需要调试信息。

**解决方案**：添加详细的调试日志。

**修改文件**：`src/strategies/UnifiedReviewAdapter.ts`

```typescript
const card = item as FSRSCard;

// 🆕 检查是否为快速制卡
const isQuickCard = card.meta?.cardSource === 'quick-symbol';
const symbolType = card.meta?.symbolType;

console.log('[UnifiedReviewAdapter] Card check:', {
    blockId: card.blockId,
    isQuickCard,
    symbolType,
    cardSource: card.meta?.cardSource,
    meta: card.meta
});

// 🆕 如果是快速制卡，使用自定义渲染
if (isQuickCard && symbolType) {
    console.log('[UnifiedReviewAdapter] Using quick card rendering');
    return this.renderQuickCard(card, context, queue, item);
}
```

**日志示例**：

```
[UnifiedReviewAdapter] Card check: {
  blockId: "20260215123456-abcdefg",
  isQuickCard: true,
  symbolType: ">>",
  cardSource: "quick-symbol",
  meta: {
    cardSource: "quick-symbol",
    symbolType: ">>",
    question: "测试",
    answer: "答案"
  }
}
[UnifiedReviewAdapter] Using quick card rendering
```

---

## 为什么没有起作用？

### 原因 1：卡片是旧版本创建的

**症状**：
- 控制台日志显示 `isQuickCard: false`
- 卡片元数据中没有 `cardSource: 'quick-symbol'`

**解决方法**：
1. 删除旧卡片（从 Riff 中移除）
2. 重新输入符号创建新卡片
3. 等待 300ms（防抖时间）
4. 检查是否创建成功

### 原因 2：插件没有重新构建

**症状**：
- 修改代码后没有效果
- 控制台没有新的日志

**解决方法**：
```bash
cd siyuan-plugin-siyuanmemo
npm run build
```

然后重启思源或重新加载插件。

### 原因 3：使用的不是统一队列

**症状**：
- 控制台没有 `[UnifiedReviewAdapter]` 日志
- 使用的是旧版复习对话框

**解决方法**：
- 确认使用的是"提取练习"等统一队列
- 不要使用旧版的复习功能

---

## 测试步骤

### 1. 创建测试卡片

```
测试 >> 答案
```

等待 300ms，应该看到提示：
```
✅ 已创建正向卡片 (>>)
```

### 2. 检查卡片元数据

在浏览器控制台中运行：

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const card = plugin.storage.getCardByBlockId('你的块ID');
console.log('Card meta:', card?.meta);
```

**预期输出**：
```javascript
{
  cardSource: 'quick-symbol',
  symbolType: '>>',
  question: '测试',
  answer: '答案',
  direction: 'forward'
}
```

### 3. 打开复习对话框

打开"提取练习"复习对话框。

### 4. 检查渲染效果

**正面**：
- 只显示"测试"
- 不显示符号和答案

**背面**：
- 显示"测试"
- 显示分隔线（不显示符号）
- 显示"答案"

### 5. 检查控制台日志

应该看到：
```
[UnifiedReviewAdapter] Card check: {
  blockId: "...",
  isQuickCard: true,
  symbolType: ">>",
  ...
}
[UnifiedReviewAdapter] Using quick card rendering
```

---

## 视觉效果

### 基础卡片（`测试 >> 答案`）

**正面**：
```
┌─────────────────────────┐
│                         │
│        测试             │
│                         │
└─────────────────────────┘
```

**背面**：
```
┌─────────────────────────┐
│        测试             │
│   ─────────────         │
│        答案             │
└─────────────────────────┘
```

### 概念卡片（`FSRS :: 定义`）

**正面**：
```
┌─────────────────────────┐
│                         │
│      **FSRS**           │
│                         │
└─────────────────────────┘
```

**背面**：
```
┌─────────────────────────┐
│      **FSRS**           │
│   ─────────────         │
│   Free Spaced           │
│   Repetition Scheduler  │
└─────────────────────────┘
```

---

## 相关文档

- [快速制卡答案渲染完成](./QUICK_CARD_ANSWER_RENDERING_COMPLETE.md)
- [快速制卡答案渲染调试](./QUICK_CARD_ANSWER_RENDERING_DEBUG.md)
- [快速制卡答案渲染方案](./QUICK_CARD_ANSWER_RENDERING.md)

---

## 总结

已完成以下修复：

1. ✅ 隐藏符号（`>>`, `::` 等）
2. ✅ 添加调试日志
3. ✅ 创建调试指南
4. ✅ 更新文档

现在用户可以：
- 使用快速制卡符号创建卡片
- 复习时看到清爽的界面（不显示符号）
- 通过控制台日志调试问题

---

**文档版本**：v1.0  
**最后更新**：2026-02-15  
**状态**：✅ 已完成
