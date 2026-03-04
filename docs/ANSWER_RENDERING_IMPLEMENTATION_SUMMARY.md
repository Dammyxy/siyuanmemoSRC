# 答案渲染功能实现总结

## 实现状态

答案渲染功能已经完成实现，所有代码修改已完成。现在需要进行手动测试验证。

## 最新修复（2026-02-02）

### 问题诊断

用户报告高亮标记挖空没有被隐藏。通过日志分析发现：

```
[FSRS ReviewContent] Watch triggered: {hidden: false, show: false}
[FSRS ReviewContent] applyAnswerVisibility called: {hasHidden: false, showAnswer: false}
[FSRS ReviewContent] No hidden content, removing all hide classes
```

**根本原因**：`hasHidden: false`，说明 Adapter 没有正确检测到卡片有隐藏内容。

### 解决方案

问题出在 Queue/Strategy 的 `getUIConfig()` 方法没有返回 `hiddenContentTypes` 字段。

**修改的文件**：
1. 创建了工具函数 `src/core/queue/utils/hiddenContentTypes.ts`
2. 更新了 `SubsetPracticeStrategy.ts`
3. 更新了 `IncrementalLearningQueue.ts`
4. 更新了 `NeuralRoamQueue.ts`

**实现逻辑**：
```typescript
export function getHiddenContentTypes(): string[] {
  const hiddenContentTypes: string[] = [];
  
  // 检查全局闪卡设置（参考原生实现 siyuan/app/src/card/openCard.ts）
  if (typeof window !== 'undefined' && (window as any).siyuan?.config?.flashcard) {
    const config = (window as any).siyuan.config.flashcard;
    if (config.mark) hiddenContentTypes.push('mark');
    if (config.list) hiddenContentTypes.push('list');
    if (config.superBlock) hiddenContentTypes.push('superBlock');
    if (config.heading) hiddenContentTypes.push('heading');
  }
  
  return hiddenContentTypes;
}
```

**数据流**：
```
window.siyuan.config.flashcard (思源笔记设置)
  → getHiddenContentTypes() (工具函数)
  → Queue.getUIConfig() (返回 hiddenContentTypes)
  → Adapter.toUIState() (设置 hasHiddenContent)
  → ReviewContent.vue (props.hasHiddenContent)
  → watch 触发
  → applyAnswerVisibility() (应用 CSS 类)
```

## 实现方案

### 1. 答案隐藏/显示逻辑（ReviewContent.vue）

**实现方式**：使用 Vue watch 监听 `hasHiddenContent` 和 `showAnswer` 状态变化

**关键代码**：
```typescript
function applyAnswerVisibility(protyle: any): void {
  const element = protyle?.element;
  if (!element) {
    console.warn('[FSRS ReviewContent] Cannot apply answer visibility: protyle.element is null');
    return;
  }
  
  const hasHidden = props.hasHiddenContent;
  const showAnswer = props.showAnswer;
  
  if (!hasHidden) {
    // 没有隐藏内容，移除所有隐藏类
    element.classList.remove(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
    return;
  }
  
  if (showAnswer) {
    // 显示答案，移除所有隐藏类
    element.classList.remove(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
  } else {
    // 隐藏答案，添加所有隐藏类
    element.classList.add(
      'card__block--hidemark',
      'card__block--hideli',
      'card__block--hidesb',
      'card__block--hideh'
    );
  }
}

watch(
  () => [props.hasHiddenContent, props.showAnswer],
  ([hidden, show]) => {
    const protyle = editorRef.value?.protyle;
    if (!protyle) return;
    applyAnswerVisibility(protyle);
  },
  { immediate: true, deep: true },
);
```

**为什么不在 Protyle 的 `after` 回调中应用 CSS 类？**

原生思源实现使用 `afterCB` 回调（传递给 `onGet` 函数），此时 `protyle.element` 已经完全初始化。但在我们的插件中，我们使用 Protyle 构造函数的 `after` 回调，此时 `protyle.element` 可能还是 `null`。

使用 watch 的优势：
- 在 Protyle 完全初始化后才触发
- 自动响应状态变化（用户点击"显示答案"时）
- 更符合 Vue 的响应式编程模式

### 2. 下次复习时间显示（ReviewActions.vue）

**实现方式**：在每个评分按钮上方显示 `nextDue` 字段

**关键代码**：
```vue
<div v-for="g in actions.grades" :key="g.value">
  <span>{{ g.nextDue || '' }}</span>
  <button
    :data-type="g.value"
    :aria-label="`${g.value} / ${g.kb}`"
    class="b3-button"
    :class="getButtonVariant(g.value)"
    @click="emit('grade', g.value)"
  >
    <div class="card__icon">{{ g.emoji }}</div>
    {{ g.label }} ({{ g.kb }})
  </button>
</div>
```

**CSS 样式**：
```css
.card__action > div > span {
  display: flex;
  color: var(--b3-theme-on-surface);
  text-align: center;
  font-size: 12px;
  margin-bottom: 8px;
  height: 28px;
  line-height: 14px;
  justify-content: center;
  align-items: center;
}
```

### 3. 模板卡片支持（Xiuyuan）

**实现方式**：当 `showAnswer=true` 且 `answerBlockID` 存在时，渲染答案块

**关键代码**：
```vue
<!-- 背面：答案块（Xiuyuan 模板卡片，点击显示答案后显示） -->
<div v-if="showAnswer && answerBlockID" class="fsrs-review-v2-content__answer-divider">
  <span>{{ t('answerDivider', '─── 答案 ───') }}</span>
</div>
<div v-if="showAnswer && answerBlockID" ref="answerHostRef" class="fsrs-review-v2-content__protyle-host fsrs-review-v2-content__answer"></div>
```

## 数据流

### 1. 答案隐藏/显示

```
QueueItem (hasHiddenContent) 
  → Adapter (提取 hasHiddenContent)
  → ReviewUIState (hasHiddenContent)
  → ReviewContent.vue (props.hasHiddenContent)
  → watch 触发
  → applyAnswerVisibility()
  → 应用 CSS 类
```

### 2. 下次复习时间

```
QueueItem (nextDues: { 1: string, 2: string, 3: string, 4: string })
  → Adapter (提取 nextDues[rating] → nextDue)
  → ReviewUIState (actions.grades[].nextDue)
  → ReviewActions.vue (g.nextDue)
  → 显示在按钮上方
```

### 3. 模板卡片

```
QueueItem (answerBlockID)
  → Adapter (提取 answerBlockID)
  → ReviewUIState (content.answerBlockID)
  → ReviewContent.vue (props.content.answerBlockID)
  → watch 触发
  → renderAnswerProtyle()
  → 渲染答案块
```

## 已完成的任务

- ✅ 1.1 创建 `applyAnswerVisibility()` 函数
- ✅ 1.2 在 `renderProtyle()` 的 `after` 回调中调用（后改为 watch）
- ✅ 1.3 修复现有的 watch 逻辑
- ✅ 2.1 在评分按钮上方添加时间显示元素
- ✅ 2.2 验证 CSS 样式
- ✅ 3.1 检查 `ReviewUIState` 类型定义
- ✅ 3.2 检查 `QueueItem` 类型定义
- ✅ 3.3 运行 TypeScript 编译

## 待完成的任务

- ⏳ 1.4 编写单元测试（可选，如果手动测试通过可跳过）
- ⏳ 2.3 编写单元测试（可选，如果手动测试通过可跳过）
- ⏳ 4.1 编写集成测试（可选，如果手动测试通过可跳过）
- **🔴 4.2 手动测试所有复习模式（必需）**
- **🔴 4.3 测试模板卡片（必需）**
- ⏳ 4.4 运行现有测试套件
- ⏳ 5. Checkpoint - 确保所有测试通过

## 下一步操作

### 1. 重新编译插件

```bash
cd siyuan-plugin-fsrs
pnpm run build
```

### 2. 重新加载插件

在思源笔记中：
1. 打开设置 → 集市 → 已下载 → 插件
2. 找到 FSRS 插件
3. 点击"重新加载"按钮

### 3. 进行手动测试

请按照 `ANSWER_RENDERING_TEST_GUIDE.md` 中的步骤进行测试：

#### 测试 1：答案内容的隐藏/显示
1. 创建一个包含标记（`==答案==`）的卡片
2. 打开复习界面
3. 验证答案内容被隐藏
4. 点击"显示答案"
5. 验证答案内容显示，时间显示在按钮上方

#### 测试 2：模板卡片
1. 创建一个模板卡片（双块）
2. 打开复习界面
3. 验证只显示问题块
4. 点击"显示答案"
5. 验证显示问题块+答案块+时间

#### 测试 3：所有复习模式
1. 测试提取练习
2. 测试刻意练习
3. 测试神经漫游
4. 测试最终冲刺
5. 测试难点攻坚

### 4. 查看控制台日志

打开浏览器控制台（F12），查看日志：
- `[FSRS ReviewContent] applyAnswerVisibility called`
- `[FSRS ReviewContent] Hiding answer, adding hide classes`
- `[FSRS ReviewContent] Showing answer, removing all hide classes`

### 5. 报告测试结果

测试完成后，请告诉我：
- ✅ 哪些功能正常工作
- ❌ 哪些功能有问题
- 📝 控制台是否有错误或警告

## 调试技巧

### 检查 CSS 类

在浏览器控制台中：
```javascript
// 查找 Protyle 元素
const protyle = document.querySelector('.protyle');
console.log(protyle.className);

// 答案隐藏时应该包含：
// - card__block--hidemark
// - card__block--hideli
// - card__block--hidesb
// - card__block--hideh
```

### 检查下次复习时间数据

在浏览器控制台中：
```javascript
// 查找 Vue 组件实例
const reviewView = document.querySelector('.fsrs-review-v2').__vueParentComponent;
console.log(reviewView.state.value.actions.grades);

// 应该看到：
// [
//   { label: '重来', value: 1, nextDue: '1 分钟', ... },
//   { label: '困难', value: 2, nextDue: '5 分钟', ... },
//   { label: '良好', value: 3, nextDue: '10 分钟', ... },
//   { label: '简单', value: 4, nextDue: '6 天', ... }
// ]
```

## 技术说明

### 为什么使用 watch 而不是 after 回调？

**问题**：在 Protyle 的 `after` 回调中，`protyle.element` 可能还是 `null`

**原因**：
- 原生思源使用 `afterCB`（传递给 `onGet` 函数），此时 DOM 已完全初始化
- 我们使用 Protyle 构造函数的 `after` 回调，此时 DOM 可能还未完全初始化

**解决方案**：
- 使用 Vue watch 监听状态变化
- watch 在 Protyle 完全初始化后才触发
- 自动响应用户操作（点击"显示答案"）

### CSS 类的作用

- `card__block--hidemark`：隐藏标记（`==答案==`）
- `card__block--hideli`：隐藏列表项
- `card__block--hidesb`：隐藏超级块
- `card__block--hideh`：隐藏标题

这些 CSS 类由思源笔记原生提供，我们只需要在正确的时机添加/移除它们。

## 常见问题

### Q: 为什么答案内容没有被隐藏？

**A**: 可能的原因：
1. CSS 类没有正确应用 → 检查控制台日志
2. Protyle 实例还未渲染完成 → 等待几秒后再试
3. 卡片没有 `hasHiddenContent` 标记 → 检查卡片数据

### Q: 为什么下次复习时间没有显示？

**A**: 可能的原因：
1. `nextDues` 数据缺失 → 检查 Adapter 是否正确提取数据
2. 数据格式不正确 → 检查控制台日志

### Q: 为什么模板卡片的答案块没有显示？

**A**: 可能的原因：
1. `answerBlockID` 缺失 → 检查卡片 meta 数据
2. 答案块渲染失败 → 检查控制台日志

---

**准备好测试了吗？请重新编译插件，重新加载，然后按照测试指南进行测试！** 🚀
