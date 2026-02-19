# 快速制卡答案渲染方案

**创建时间**：2026-02-15  
**状态**：设计中

---

## 问题描述

当前快速制卡功能已经实现了符号检测和卡片创建，但在复习时的答案渲染存在问题：

### 当前行为

对于快速制卡符号（如 `问题 >> 答案`），当前实现：
- 正面：显示整个块内容（`问题 >> 答案`）
- 背面：显示整个块内容（`问题 >> 答案`）

### 期望行为

- 正面：只显示问题部分（`问题`）
- 背面：显示问题 + 答案（`问题` + `答案`）

---

## 解决方案

### 方案 1：在 Adapter 中处理（推荐）

在 `UnifiedReviewAdapter` 中，根据卡片的 `meta` 信息，生成不同的内容：

#### 优点
- 集中处理，逻辑清晰
- 不需要修改 ReviewContent.vue
- 可以复用现有的 Protyle 渲染逻辑

#### 实现步骤

1. **检测快速制卡符号**

在 `UnifiedReviewAdapter.toUIState()` 中：

```typescript
// 检查是否为快速制卡
const isQuickCard = card.meta?.cardSource === 'quick-symbol';
const symbolType = card.meta?.symbolType;

if (isQuickCard) {
    // 根据符号类型处理
    switch (symbolType) {
        case '>>':
        case '<<':
        case '<>':
            return this.renderBasicCard(card, context);
        case '::':
            return this.renderConceptCard(card, context);
        case ';;':
            return this.renderDescriptorCard(card, context);
        case '{{}}':
            return this.renderClozeCard(card, context);
        default:
            // 降级到默认渲染
            break;
    }
}
```

2. **渲染基础卡片（>>, <<, <>）**

```typescript
private renderBasicCard(card: FSRSCard, context: ReviewContext): ReviewUIState {
    const question = card.meta?.question || '';
    const answer = card.meta?.answer || '';
    const direction = card.meta?.direction || 'forward';
    
    // 正面：只显示问题
    if (!context.showAnswer) {
        return {
            content: {
                type: 'html',
                id: card.blockID,
                data: `<div class="quick-card-question">${this.escapeHtml(question)}</div>`
            },
            actions: {
                showAnswer: true,
                grades: [],
                menu: []
            },
            meta: {
                hasHiddenContent: true,
                transition: 'fade'
            }
        };
    }
    
    // 背面：显示问题 + 答案
    return {
        content: {
            type: 'html',
            id: card.blockID,
            data: `
                <div class="quick-card-content">
                    <div class="quick-card-question">${this.escapeHtml(question)}</div>
                    <div class="quick-card-divider">───</div>
                    <div class="quick-card-answer">${this.escapeHtml(answer)}</div>
                </div>
            `
        },
        actions: {
            showAnswer: false,
            grades: this.getGrades(card),
            menu: []
        },
        meta: {
            hasHiddenContent: false,
            transition: 'fade'
        }
    };
}

private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

3. **渲染概念卡片（::）**

```typescript
private renderConceptCard(card: FSRSCard, context: ReviewContext): ReviewUIState {
    const concept = card.meta?.concept || '';
    const definition = card.meta?.definition || '';
    
    // 正面：只显示概念名称
    if (!context.showAnswer) {
        return {
            content: {
                type: 'html',
                id: card.blockID,
                data: `<div class="quick-card-concept"><strong>${this.escapeHtml(concept)}</strong></div>`
            },
            actions: {
                showAnswer: true,
                grades: [],
                menu: []
            },
            meta: {
                hasHiddenContent: true,
                transition: 'fade'
            }
        };
    }
    
    // 背面：显示概念 + 定义
    return {
        content: {
            type: 'html',
            id: card.blockID,
            data: `
                <div class="quick-card-content">
                    <div class="quick-card-concept"><strong>${this.escapeHtml(concept)}</strong></div>
                    <div class="quick-card-divider">───</div>
                    <div class="quick-card-definition">${this.escapeHtml(definition)}</div>
                </div>
            `
        },
        actions: {
            showAnswer: false,
            grades: this.getGrades(card),
            menu: []
        },
        meta: {
            hasHiddenContent: false,
            transition: 'fade'
        }
    };
}
```

4. **渲染填空卡片（{{}}）**

```typescript
private renderClozeCard(card: FSRSCard, context: ReviewContext): ReviewUIState {
    const clozes = card.meta?.clozes || [];
    const clozePositions = card.meta?.clozePositions || [];
    
    // 获取原始块内容
    const blockContent = await this.getBlockContent(card.blockID);
    
    // 正面：隐藏填空
    if (!context.showAnswer) {
        let hiddenContent = blockContent;
        
        // 从后往前替换，避免位置偏移
        for (let i = clozePositions.length - 1; i >= 0; i--) {
            const pos = clozePositions[i];
            const before = hiddenContent.substring(0, pos.start);
            const after = hiddenContent.substring(pos.end);
            hiddenContent = before + '<span class="cloze-blank">______</span>' + after;
        }
        
        return {
            content: {
                type: 'html',
                id: card.blockID,
                data: `<div class="quick-card-cloze">${hiddenContent}</div>`
            },
            actions: {
                showAnswer: true,
                grades: [],
                menu: []
            },
            meta: {
                hasHiddenContent: true,
                transition: 'fade'
            }
        };
    }
    
    // 背面：显示完整内容，高亮填空
    let revealedContent = blockContent;
    for (let i = clozePositions.length - 1; i >= 0; i--) {
        const pos = clozePositions[i];
        const before = revealedContent.substring(0, pos.start);
        const after = revealedContent.substring(pos.end);
        const clozeText = pos.text;
        revealedContent = before + `<span class="cloze-revealed">${this.escapeHtml(clozeText)}</span>` + after;
    }
    
    return {
        content: {
            type: 'html',
            id: card.blockID,
            data: `<div class="quick-card-cloze">${revealedContent}</div>`
        },
        actions: {
            showAnswer: false,
            grades: this.getGrades(card),
            menu: []
        },
        meta: {
            hasHiddenContent: false,
            transition: 'fade'
        }
    };
}
```

5. **添加样式**

在 `ReviewContent.vue` 中添加样式：

```vue
<style scoped>
/* 快速制卡样式 */
.quick-card-content {
  padding: 24px;
  font-size: 16px;
  line-height: 1.6;
}

.quick-card-question {
  font-size: 18px;
  font-weight: 500;
  color: var(--b3-theme-on-surface);
  margin-bottom: 16px;
}

.quick-card-divider {
  text-align: center;
  color: var(--b3-theme-on-surface-light);
  margin: 16px 0;
  font-size: 14px;
}

.quick-card-answer {
  font-size: 16px;
  color: var(--b3-theme-on-surface);
  padding: 16px;
  background: var(--b3-theme-surface-light);
  border-radius: 8px;
}

.quick-card-concept {
  font-size: 20px;
  text-align: center;
  padding: 24px;
}

.quick-card-definition {
  font-size: 16px;
  color: var(--b3-theme-on-surface);
  padding: 16px;
  background: var(--b3-theme-surface-light);
  border-radius: 8px;
}

.quick-card-cloze {
  font-size: 16px;
  line-height: 1.8;
  padding: 24px;
}

.cloze-blank {
  display: inline-block;
  min-width: 60px;
  border-bottom: 2px solid var(--b3-theme-primary);
  text-align: center;
  color: transparent;
}

.cloze-revealed {
  background: var(--b3-theme-primary-lightest);
  color: var(--b3-theme-primary);
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}
</style>
```

---

### 方案 2：使用自定义渲染组件

创建专门的快速制卡渲染组件，类似于 `XiuyuanListTemplateCard.vue`：

#### 优点
- 更灵活，可以添加更多交互
- 可以支持更复杂的渲染逻辑
- 易于维护和扩展

#### 缺点
- 需要创建新组件
- 增加代码复杂度

#### 实现步骤

1. 创建 `QuickCardRenderer.vue`
2. 在 Adapter 中检测快速制卡，返回自定义内容类型
3. 在 ReviewContent.vue 中添加条件渲染

---

## 推荐方案

**方案 1：在 Adapter 中处理**

原因：
1. 实现简单，不需要新增组件
2. 逻辑集中，易于维护
3. 可以复用现有的 HTML 渲染逻辑
4. 性能更好，不需要额外的 Vue 组件开销

---

## 实施计划

### Phase 1：基础渲染（1天）

- [ ] 在 UnifiedReviewAdapter 中添加快速制卡检测
- [ ] 实现基础卡片渲染（>>, <<, <>）
- [ ] 实现概念卡片渲染（::）
- [ ] 添加基础样式

### Phase 2：高级渲染（1天）

- [ ] 实现填空卡片渲染（{{}}）
- [ ] 实现描述符卡片渲染（;;）
- [ ] 优化样式和动画
- [ ] 添加单元测试

### Phase 3：优化和测试（0.5天）

- [ ] 性能优化
- [ ] 边界情况处理
- [ ] 集成测试
- [ ] 文档更新

---

## 注意事项

### 1. HTML 转义

所有用户输入的内容都需要进行 HTML 转义，防止 XSS 攻击：

```typescript
private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

### 2. Markdown 渲染

如果需要支持 Markdown 格式，可以使用思源的 Markdown 渲染器：

```typescript
private async renderMarkdown(text: string): Promise<string> {
    // 使用思源的 Markdown 渲染 API
    const { lute } = await import('@/core/siyuan/api');
    return lute.Md2HTML(text);
}
```

### 3. 块引用

如果内容中包含块引用（`((block-id))`），需要特殊处理：

```typescript
private async resolveBlockRefs(content: string): Promise<string> {
    // 查找所有块引用
    const refPattern = /\(\(([0-9a-z-]+)\)\)/g;
    const matches = content.matchAll(refPattern);
    
    for (const match of matches) {
        const blockId = match[1];
        const blockContent = await this.getBlockContent(blockId);
        content = content.replace(match[0], blockContent);
    }
    
    return content;
}
```

### 4. 图片和资源

如果内容中包含图片，需要确保路径正确：

```typescript
private fixAssetPaths(html: string): string {
    // 修复相对路径为绝对路径
    return html.replace(
        /src="assets\//g,
        `src="${window.location.origin}/assets/`
    );
}
```

---

## 测试用例

### 基础卡片

```markdown
输入：什么是FSRS？ >> 一种间隔重复算法

正面：
┌─────────────────────┐
│ 什么是FSRS？        │
└─────────────────────┘

背面：
┌─────────────────────┐
│ 什么是FSRS？        │
│ ───                 │
│ 一种间隔重复算法    │
└─────────────────────┘
```

### 概念卡片

```markdown
输入：FSRS :: Free Spaced Repetition Scheduler

正面：
┌─────────────────────┐
│     **FSRS**        │
└─────────────────────┘

背面：
┌─────────────────────┐
│     **FSRS**        │
│ ───                 │
│ Free Spaced         │
│ Repetition          │
│ Scheduler           │
└─────────────────────┘
```

### 填空卡片

```markdown
输入：{{FSRS}}是一种{{间隔重复}}算法

正面：
┌─────────────────────┐
│ ______ 是一种       │
│ ______ 算法         │
└─────────────────────┘

背面：
┌─────────────────────┐
│ [FSRS] 是一种       │
│ [间隔重复] 算法     │
└─────────────────────┘
```

---

## 后续优化

### 1. 支持富文本

当前方案使用纯文本渲染，后续可以支持：
- Markdown 格式
- 块引用
- 图片和附件
- 代码高亮

### 2. 交互增强

- 点击问题跳转到原始块
- 支持编辑卡片内容
- 支持添加笔记

### 3. 主题定制

- 支持自定义样式
- 支持暗色模式
- 支持字体大小调整

---

**文档版本**：v1.0  
**最后更新**：2026-02-15  
**状态**：待实施
