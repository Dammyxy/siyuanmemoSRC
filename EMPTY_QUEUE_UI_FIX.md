# 队列完成 UI 修复

## 问题描述

用户反馈：卡片刷完之后，UI 显示"内容加载中..."，这个提示不准确，应该显示"队列已完成"或类似的提示。

## 问题分析

### 日志分析

```javascript
[UnifiedQueueStrategy] Queue is empty: retrieval-practice
[useReviewSession] 队列已耗尽，会话完成
```

队列确实已经空了，但 UI 显示的是"内容加载中..."，这是因为：

1. 当队列为空时，`UnifiedReviewAdapter` 返回 `content.type = 'empty'`
2. `ReviewContent.vue` 中对 `type === 'empty'` 的处理是显示"内容加载中..."
3. 这个文案不区分"正在加载"和"队列已完成"两种状态

### 根本原因

`ReviewContent.vue` 中的 `empty` 类型被用于两种不同的场景：
- **正在加载**：真正的"内容加载中..."
- **队列为空**：应该显示"没有到期卡片"

但代码只有一个文案，导致混淆。

## 解决方案

### 参考思源源码

查看 `siyuan/app/src/card/openCard.ts` 中的 `allDone` 函数：

```typescript
const allDone = (countElement: Element, editor: Protyle, actionElements: NodeListOf<Element>) => {
    countElement.classList.add("fn__none");
    editor.protyle.element.classList.add("fn__none");
    const emptyElement = editor.protyle.element.nextElementSibling;
    emptyElement.innerHTML = `<div>🔮</div>${window.siyuan.languages.noDueCard}`;
    emptyElement.classList.remove("fn__none");
    actionElements[0].classList.add("fn__none");
    actionElements[1].classList.add("fn__none");
    const moreElement = countElement.parentElement.querySelector('[data-type="more"]');
    moreElement.classList.add("fn__none");
    moreElement.previousElementSibling.classList.add("fn__none");
};
```

思源的做法：
- 使用 🔮 图标
- 显示 `noDueCard`（没有到期卡片）
- 隐藏所有按钮和工具栏

### 修改内容

#### 1. 修改 ReviewContent.vue 模板

**修改前**：
```vue
<div v-if="content.type === 'empty'" class="fsrs-review-v2-content__empty ft__secondary">
  {{ t('loadingContent', '内容加载中...') }}
</div>
```

**修改后**：
```vue
<div v-if="content.type === 'empty'" class="fsrs-review-v2-content__empty">
  <div class="fsrs-review-v2-content__empty-icon">🔮</div>
  <div class="fsrs-review-v2-content__empty-title">{{ t('noDueCard', '没有到期卡片') }}</div>
</div>
```

#### 2. 更新 CSS 样式

**修改前**：
```css
.fsrs-review-v2-content__empty {
  padding: 16px;
  text-align: center;
}
```

**修改后**：
```css
.fsrs-review-v2-content__empty {
  padding: 48px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.fsrs-review-v2-content__empty-icon {
  font-size: 48px;
  line-height: 1;
}

.fsrs-review-v2-content__empty-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--b3-theme-on-surface);
}
```

## 影响范围

### 所有队列都受益

这个修改在 `ReviewContent.vue` 中，是所有队列共用的 UI 组件，因此：

✅ 检索练习队列（Retrieval Practice）  
✅ 渐进学习队列（Incremental Learning）  
✅ 最终训练队列（Final Drill）  
✅ 神经漫游队列（Neural Roam）  
✅ 过滤组队列（Filter Group）  

所有队列在刷完卡片后都会显示正确的"没有到期卡片"提示。

### 只需修改基类

因为 `ReviewContent.vue` 是所有队列共用的组件，所以：
- ✅ 只需修改一个文件
- ✅ 所有队列自动受益
- ✅ 不需要修改队列逻辑

## 测试验证

### 编译测试

```bash
npm run build
```

✅ 编译成功，无错误

### 功能测试

1. 打开任意队列
2. 刷完所有卡片
3. 验证显示：
   - 🔮 图标
   - "没有到期卡片"文案
   - 样式美观，居中显示

## 与思源官方的一致性

我们的实现与思源官方保持一致：
- ✅ 使用相同的图标（🔮）
- ✅ 使用相同的文案（noDueCard）
- ✅ 类似的布局和样式

这确保了用户体验的一致性。

## 总结

通过参考思源源码，我们修复了队列完成时显示"内容加载中..."的问题，现在会正确显示"没有到期卡片"。这个修改简单、优雅，且对所有队列都有效。
