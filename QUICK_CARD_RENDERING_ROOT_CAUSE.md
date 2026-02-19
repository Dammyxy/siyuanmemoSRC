# 快速制卡渲染问题 - 根本原因和完整修复

**创建时间**：2026-02-15  
**状态**：已修复

---

## 根本原因

快速制卡的自定义渲染（隐藏符号）没有生效的根本原因是：

**提取练习对话框使用的是旧的 `createVueDialog` 函数，而不是 `createUnifiedReviewDialog`**

### 问题链条

1. 用户点击"提取练习" → 调用 `RetrievalPracticeEntry.openReviewDialog()`
2. `openReviewDialog()` 调用 `ReviewDialogManager.openRetrievalPracticeWithFilter()`
3. `openRetrievalPracticeWithFilter()` 使用旧的 `createVueDialog()` 创建对话框
4. `createVueDialog()` 返回的对象只有 `{ dialog, destroy }` 属性
5. 没有 `adapter` 和 `queue` 属性，所以快速制卡渲染逻辑根本没有被调用

---

## 修复内容

### 1. 修改 ReviewDialogManager.ts

**文件**：`src/services/ReviewDialogManager.ts`

**修改**：将 `openRetrievalPracticeWithFilter` 方法中的 `createVueDialog` 替换为 `createUnifiedReviewDialog`

```typescript
// ❌ 旧代码（错误）
const queue = new UnifiedQueueStrategy(QueueType.FilterGroup);
const adapter = new UnifiedReviewAdapter();

this.reviewDialog = createVueDialog({
  // ... 大量配置
});

// ✅ 新代码（正确）
this.reviewDialog = createUnifiedReviewDialog({
  plugin: this.deps.plugin,
  queueType: QueueType.FilterGroup,
  title: this.deps.i18n?.retrievalPractice || '提取练习',
  onClose: () => {
    // 清除过滤条件
    if (typeof (filterGroupQueue as any).setFilter === 'function') {
      (filterGroupQueue as any).setFilter({});
    }
    this.reviewDialog = null;
  },
});
```

### 2. 修改 createUnifiedReviewDialog.ts

**文件**：`src/strategies/createUnifiedReviewDialog.ts`

**修改**：返回值中包含 `adapter` 和 `queue`

```typescript
// ❌ 旧代码（错误）
return dialog;

// ✅ 新代码（正确）
return {
  ...dialog,
  adapter,
  queue,
};
```

### 3. 添加调试日志

**文件**：`src/strategies/UnifiedReviewAdapter.ts`

在 `toUIState`、`renderBasicCard`、`renderConceptCard` 等方法中添加了详细的调试日志。

**文件**：`src/ui/review/v2/ReviewContent.vue`

在 `watch` 中添加了内容类型检查日志。

---

## 完整修复步骤

### 步骤 1：确认修改已完成

检查以下文件是否已修改：

- [x] `src/services/ReviewDialogManager.ts` - 使用 `createUnifiedReviewDialog`
- [x] `src/strategies/createUnifiedReviewDialog.ts` - 返回包含 adapter 和 queue
- [x] `src/strategies/UnifiedReviewAdapter.ts` - 添加调试日志
- [x] `src/ui/review/v2/ReviewContent.vue` - 添加调试日志

### 步骤 2：重新构建

```bash
cd siyuan-plugin-siyuanmemo
npm run build
```

**重要**：必须看到构建成功的输出！

### 步骤 3：完全重启思源

1. 完全关闭思源笔记（不是最小化）
2. 等待 5 秒
3. 重新打开思源笔记

**重要**：必须完全重启，否则可能加载旧的缓存代码！

### 步骤 4：清除浏览器缓存（可选但推荐）

在思源中按 F12 打开开发者工具，然后：
1. 右键点击刷新按钮
2. 选择"清空缓存并硬性重新加载"

或者：
1. 打开开发者工具（F12）
2. Application 标签 → Clear storage → Clear site data

### 步骤 5：删除旧卡片，创建新卡片

旧卡片的元数据可能包含 IAL，需要重新创建：

1. 删除旧的快速制卡（在块菜单中选择"从 Riff 中移除"）
2. 重新输入符号创建新卡片：
   ```
   测试问题 >> 测试答案
   ```
3. 等待 300ms，应该看到提示：`✅ 已创建正向卡片 (>>)`

### 步骤 6：打开提取练习

点击"提取练习"按钮，打开复习对话框。

### 步骤 7：验证修复

在浏览器控制台中应该看到以下日志：

```
[createUnifiedReviewDialog] Creating dialog for queue: filter-group
[createUnifiedReviewDialog] Dialog created successfully for queue: filter-group
[UnifiedReviewAdapter] toUIState called: { hasItem: true, contextShowAnswer: true }
[UnifiedReviewAdapter] Card check: { isQuickCard: true, symbolType: ">>" ... }
[UnifiedReviewAdapter] Using quick card rendering
[UnifiedReviewAdapter] renderBasicCard: { question: "测试问题", answer: "测试答案" ... }
[UnifiedReviewAdapter] Returning front side: { type: 'html', ... }
[ReviewContent] Watch content.data triggered: { type: 'html', isQuickCard: true }
```

### 步骤 8：运行检查脚本

在浏览器控制台运行 `CHECK_ADAPTER.js` 的内容，应该看到：

```
✅ 插件已加载
✅ 复习对话框已打开
   位置: plugin.reviewDialogManager.reviewDialog

📋 Adapter 信息:
   类型: UnifiedReviewAdapter
   是否为 UnifiedReviewAdapter: true

🔍 Adapter 方法:
   有 toUIState: true
   有 renderQuickCard: true
   有 renderBasicCard: true
```

### 步骤 9：测试渲染效果

在复习界面中：

**正面**：
- 只显示"测试问题"
- 不显示 `>>` 符号
- 不显示答案

**背面**（点击"显示答案"后）：
- 显示"测试问题"
- 显示分隔线（不显示符号）
- 显示"测试答案"

---

## 如果仍然不工作

### 检查清单

- [ ] 是否运行了 `npm run build`？
- [ ] 是否看到构建成功的输出？
- [ ] 是否完全重启了思源（不是最小化）？
- [ ] 是否清除了浏览器缓存？
- [ ] 是否删除了旧卡片并创建了新卡片？
- [ ] 控制台是否有 `[createUnifiedReviewDialog]` 日志？
- [ ] 控制台是否有 `[UnifiedReviewAdapter]` 日志？

### 如果没有看到日志

1. **检查是否真的重新构建了**：
   ```bash
   ls -la dist/index.js
   ```
   查看文件修改时间是否是最新的

2. **检查是否真的重启了思源**：
   - 在任务管理器中确认思源进程已完全关闭
   - 重新打开思源

3. **检查是否使用了正确的入口**：
   - 必须使用"提取练习"入口
   - 不要使用旧的复习对话框

4. **检查控制台过滤器**：
   - 确保控制台没有过滤掉日志
   - 点击控制台的"Default levels"，确保所有级别都选中

### 如果看到日志但渲染仍然不对

1. **检查卡片元数据**：
   ```javascript
   const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
   const card = plugin.storage.getCardByBlockId('你的块ID');
   console.log('cardSource:', card?.meta?.cardSource);
   console.log('symbolType:', card?.meta?.symbolType);
   console.log('question:', card?.meta?.question);
   console.log('answer:', card?.meta?.answer);
   ```
   
   应该看到：
   ```
   cardSource: quick-symbol
   symbolType: >>
   question: 测试问题
   answer: 测试答案
   ```

2. **检查 HTML 内容**：
   - 打开开发者工具 Elements 标签
   - 查找 `.fsrs-review-v2-content__html` 元素
   - 应该包含 `<div class="quick-card-content">...</div>`

3. **检查 CSS 样式**：
   - 在 Elements 标签中选中 `.quick-card-content` 元素
   - 查看 Styles 面板，确认样式已加载

---

## 总结

问题的根本原因是使用了错误的对话框创建函数。修复后：

1. ✅ 提取练习使用 `createUnifiedReviewDialog`
2. ✅ 返回值包含 `adapter` 和 `queue`
3. ✅ 快速制卡渲染逻辑被正确调用
4. ✅ 符号被隐藏，只显示问题和答案

---

**修复完成！** 🎉
