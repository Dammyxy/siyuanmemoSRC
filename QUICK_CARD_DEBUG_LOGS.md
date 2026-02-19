# 快速制卡渲染调试日志指南

**创建时间**：2026-02-15  
**状态**：调试中

---

## 已添加的调试日志

### 1. UnifiedReviewAdapter.ts

#### 卡片检查日志
```
[UnifiedReviewAdapter] Card check: {
  blockId: "...",
  isQuickCard: true/false,
  symbolType: ">>",
  cardSource: "quick-symbol",
  meta: {...}
}
```

#### 快速制卡渲染日志
```
[UnifiedReviewAdapter] Using quick card rendering
```

#### 基础卡片渲染日志
```
[UnifiedReviewAdapter] renderBasicCard: {
  blockId: "...",
  showAnswer: true/false,
  question: "...",
  answer: "...",
  symbolType: ">>"
}
[UnifiedReviewAdapter] Returning front side: { type: 'html', id: '...', data: '...' }
[UnifiedReviewAdapter] Returning back side: { type: 'html', id: '...', data: '...' }
```

#### 概念卡片渲染日志
```
[UnifiedReviewAdapter] renderConceptCard: {
  blockId: "...",
  showAnswer: true/false,
  concept: "...",
  definition: "..."
}
[UnifiedReviewAdapter] Returning concept front: { type: 'html', id: '...', data: '...' }
[UnifiedReviewAdapter] Returning concept back: { type: 'html', id: '...', data: '...' }
```

### 2. ReviewContent.vue

#### 内容类型检查日志
```
[ReviewContent] Watch content.data triggered: {
  type: 'html',
  data: '<div class="quick-card-content">...</div>',
  isQuickCard: true
}
[ReviewContent] Not protyle type, skipping renderProtyle
```

---

## 如何使用调试日志

### 步骤 1：重新构建插件

```bash
cd siyuan-plugin-siyuanmemo
npm run build
```

### 步骤 2：重启思源笔记

完全关闭思源，然后重新打开。

### 步骤 3：打开浏览器控制台

按 F12 打开开发者工具，切换到 Console 标签。

### 步骤 4：创建测试卡片

```
测试问题 >> 测试答案
```

等待 300ms，应该看到：
```
[AutoCard] Block queued: 20260215... action: update
[AutoCard] Processing quick queue, count: 1
[AutoCard] Checking quick symbols: 20260215... content: 测试问题 >> 测试答案
[AutoCard] Detected basic forward symbol: 20260215...
[AutoCard] Creating basic card: 20260215... forward
[AutoCard] Basic card created successfully: 20260215... forward
```

### 步骤 5：打开复习对话框

打开"提取练习"复习对话框。

### 步骤 6：查看日志

在控制台中应该看到以下日志序列：

#### 正常流程（快速制卡）

```
[UnifiedReviewAdapter] Card check: {
  blockId: "20260215...",
  isQuickCard: true,
  symbolType: ">>",
  cardSource: "quick-symbol",
  meta: { question: "测试问题", answer: "测试答案", ... }
}

[UnifiedReviewAdapter] Using quick card rendering

[UnifiedReviewAdapter] renderBasicCard: {
  blockId: "20260215...",
  showAnswer: true,
  question: "测试问题",
  answer: "测试答案",
  symbolType: ">>"
}

[UnifiedReviewAdapter] Returning front side: {
  type: 'html',
  id: '20260215...',
  data: '<div class="quick-card-content">...'
}

[ReviewContent] Watch content.data triggered: {
  type: 'html',
  data: '<div class="quick-card-content">...',
  isQuickCard: true
}

[ReviewContent] Not protyle type, skipping renderProtyle
```

#### 点击"显示答案"后

```
[UnifiedReviewAdapter] renderBasicCard: {
  blockId: "20260215...",
  showAnswer: false,
  question: "测试问题",
  answer: "测试答案",
  symbolType: ">>"
}

[UnifiedReviewAdapter] Returning back side: {
  type: 'html',
  id: '20260215...',
  data: '<div class="quick-card-content">...<div class="quick-card-answer">...'
}

[ReviewContent] Watch content.data triggered: {
  type: 'html',
  data: '<div class="quick-card-content">...',
  isQuickCard: true
}
```

---

## 问题诊断

### 问题 1：没有看到 "Using quick card rendering"

**症状**：
```
[UnifiedReviewAdapter] Card check: {
  isQuickCard: false,
  ...
}
```

**原因**：
- 卡片元数据不正确
- `cardSource` 不是 'quick-symbol'
- 或者 `symbolType` 为空

**解决**：
1. 检查卡片元数据：
```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const card = plugin.storage.getCardByBlockId('你的块ID');
console.log('cardSource:', card?.meta?.cardSource);
console.log('symbolType:', card?.meta?.symbolType);
```

2. 如果元数据不正确，删除卡片重新创建

### 问题 2：看到 "Using quick card rendering" 但仍显示完整块内容

**症状**：
- 控制台显示 `Using quick card rendering`
- 控制台显示 `Returning front side` 或 `Returning back side`
- 但复习界面仍显示完整的块内容（包括符号）

**可能原因**：
1. **content.type 不是 'html'**
   - 检查日志中的 `type` 字段
   - 应该是 `type: 'html'`，不是 `type: 'protyle'`

2. **ReviewContent.vue 没有渲染 HTML**
   - 检查是否看到 `[ReviewContent] Not protyle type, skipping renderProtyle`
   - 如果没有看到，说明 Vue 组件没有更新

3. **CSS 样式没有加载**
   - 检查页面中是否有 `.quick-card-content` 等样式
   - 打开开发者工具的 Elements 标签，查看 HTML 结构

**解决**：
1. 确认 content.type 是 'html'：
```javascript
// 在复习对话框打开时运行
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
console.log('Current state:', plugin.reviewDialog?.currentState);
```

2. 检查 HTML 结构：
   - 打开开发者工具 Elements 标签
   - 查找 `.fsrs-review-v2-content__html` 元素
   - 应该包含 `<div class="quick-card-content">...</div>`

3. 如果都正常但仍不显示，可能是 CSS 问题：
   - 检查 `.quick-card-content` 样式是否存在
   - 尝试在控制台手动添加样式测试

### 问题 3：HTML 内容为空或显示错误

**症状**：
- 看到 `Returning front side` 日志
- 但 `data` 字段为空或包含错误内容

**原因**：
- `question` 或 `answer` 字段为空
- 或者包含 IAL

**解决**：
1. 检查卡片元数据：
```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const card = plugin.storage.getCardByBlockId('你的块ID');
console.log('question:', card?.meta?.question);
console.log('answer:', card?.meta?.answer);
```

2. 如果包含 IAL（`{: ...}`），删除卡片重新创建

### 问题 4：符号仍然显示

**症状**：
- HTML 内容正确
- 但仍然显示 `>>` 或 `::` 等符号

**原因**：
- 分隔线中的 `<span></span>` 应该是空的
- 但可能被填充了符号

**检查**：
查看 HTML 内容中的分隔线部分：
```html
<div class="quick-card-divider">
    <span></span>  <!-- 应该是空的 -->
</div>
```

如果 `<span>` 中有内容，说明代码有问题。

---

## 完整诊断脚本

将以下脚本复制到浏览器控制台运行：

```javascript
(function diagnoseQuickCardRendering() {
  console.log('=== 快速制卡渲染诊断 ===\n');
  
  // 1. 检查插件
  const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
  if (!plugin) {
    console.error('❌ 插件未找到');
    return;
  }
  console.log('✅ 插件已加载');
  
  // 2. 检查复习对话框
  if (!plugin.reviewDialog) {
    console.log('⚠️ 复习对话框未打开');
    console.log('💡 请打开"提取练习"复习对话框');
    return;
  }
  console.log('✅ 复习对话框已打开');
  
  // 3. 检查当前状态
  const state = plugin.reviewDialog.currentState;
  if (!state) {
    console.log('⚠️ 没有当前状态');
    return;
  }
  
  console.log('\n📋 当前状态:');
  console.log('   content.type:', state.content.type);
  console.log('   content.id:', state.content.id);
  console.log('   content.data (前100字符):', String(state.content.data).substring(0, 100));
  
  // 4. 检查是否为快速制卡
  const card = plugin.storage.getCardByBlockId(state.content.id);
  if (!card) {
    console.log('⚠️ 找不到卡片');
    return;
  }
  
  console.log('\n📋 卡片信息:');
  console.log('   cardSource:', card.meta?.cardSource);
  console.log('   symbolType:', card.meta?.symbolType);
  console.log('   question:', card.meta?.question);
  console.log('   answer:', card.meta?.answer);
  
  const isQuickCard = card.meta?.cardSource === 'quick-symbol';
  console.log('\n' + (isQuickCard ? '✅' : '❌') + ' 是快速制卡:', isQuickCard);
  
  // 5. 检查渲染类型
  if (state.content.type === 'html') {
    console.log('✅ 使用 HTML 渲染');
    
    // 检查 HTML 内容
    const hasQuickCardClass = state.content.data.includes('quick-card-content');
    console.log((hasQuickCardClass ? '✅' : '❌') + ' HTML 包含 quick-card-content:', hasQuickCardClass);
    
    // 检查是否有符号
    const symbols = ['>>', '<<', '<>', '::', ';;', '{{}}'];
    const hasSymbol = symbols.some(s => state.content.data.includes(s));
    console.log((hasSymbol ? '❌' : '✅') + ' HTML 包含符号:', hasSymbol);
    
  } else if (state.content.type === 'protyle') {
    console.log('❌ 使用 Protyle 渲染（应该使用 HTML）');
  } else {
    console.log('⚠️ 未知的渲染类型:', state.content.type);
  }
  
  // 6. 检查 DOM
  console.log('\n🔍 检查 DOM:');
  const htmlElement = document.querySelector('.fsrs-review-v2-content__html');
  if (htmlElement) {
    console.log('✅ 找到 HTML 容器');
    console.log('   innerHTML (前100字符):', htmlElement.innerHTML.substring(0, 100));
    
    const quickCardElement = htmlElement.querySelector('.quick-card-content');
    if (quickCardElement) {
      console.log('✅ 找到 quick-card-content 元素');
    } else {
      console.log('❌ 找不到 quick-card-content 元素');
    }
  } else {
    console.log('❌ 找不到 HTML 容器');
  }
  
  console.log('\n=== 诊断完成 ===');
})();
```

---

## 预期的完整日志流程

### 创建卡片时

```
[AutoCard] Block queued: 20260215132056-no2qm2b action: update
[AutoCard] Processing quick queue, count: 1
[AutoCard] Checking quick symbols: 20260215132056-no2qm2b content: 测试 >> 答案
[AutoCard] Detected basic forward symbol: 20260215132056-no2qm2b
[AutoCard] Creating basic card: 20260215132056-no2qm2b forward
[AutoCard] Added to Riff deck: 20260215132056-no2qm2b
[AutoCard] Marked block as card: 20260215132056-no2qm2b
[AutoCard] Basic card created successfully: 20260215132056-no2qm2b forward
```

### 打开复习对话框时（正面）

```
[UnifiedReviewAdapter] Card check: {
  blockId: "20260215132056-no2qm2b",
  isQuickCard: true,
  symbolType: ">>",
  cardSource: "quick-symbol",
  meta: { question: "测试", answer: "答案", ... }
}
[UnifiedReviewAdapter] Using quick card rendering
[UnifiedReviewAdapter] renderBasicCard: {
  blockId: "20260215132056-no2qm2b",
  showAnswer: true,
  question: "测试",
  answer: "答案",
  symbolType: ">>"
}
[UnifiedReviewAdapter] Returning front side: {
  type: 'html',
  id: '20260215132056-no2qm2b',
  data: '<div class="quick-card-content"><div class="quick-card-question">测试</div></div>'
}
[ReviewContent] Watch content.data triggered: {
  type: 'html',
  data: '<div class="quick-card-content">...',
  isQuickCard: true
}
[ReviewContent] Not protyle type, skipping renderProtyle
```

### 点击"显示答案"后（背面）

```
[UnifiedReviewAdapter] Card check: {
  blockId: "20260215132056-no2qm2b",
  isQuickCard: true,
  symbolType: ">>",
  cardSource: "quick-symbol",
  meta: { question: "测试", answer: "答案", ... }
}
[UnifiedReviewAdapter] Using quick card rendering
[UnifiedReviewAdapter] renderBasicCard: {
  blockId: "20260215132056-no2qm2b",
  showAnswer: false,
  question: "测试",
  answer: "答案",
  symbolType: ">>"
}
[UnifiedReviewAdapter] Returning back side: {
  type: 'html',
  id: '20260215132056-no2qm2b',
  data: '<div class="quick-card-content"><div class="quick-card-question">测试</div><div class="quick-card-divider"><span></span></div><div class="quick-card-answer">答案</div></div>'
}
[ReviewContent] Watch content.data triggered: {
  type: 'html',
  data: '<div class="quick-card-content">...',
  isQuickCard: true
}
[ReviewContent] Not protyle type, skipping renderProtyle
```

---

## 下一步

1. 重新构建插件：`npm run build`
2. 重启思源笔记
3. 删除旧卡片，创建新卡片
4. 打开复习对话框
5. 查看控制台日志
6. 运行诊断脚本
7. 根据日志输出定位问题

如果看到完整的日志流程但仍然不工作，请提供：
- 完整的控制台日志
- 诊断脚本的输出
- 复习界面的截图
- DOM 结构的截图（开发者工具 Elements 标签）

---

**祝调试顺利！** 🔧
