# 复习功能问题诊断

## 问题描述

用户报告两个问题：
1. "选中复习"功能消失了
2. 复习界面无法显示答案，直接显示评分按钮

## 问题 1：选中复习功能消失

### 根本原因

在 `DeckDataSource.ts` 第 170 行：

```typescript
if (this.plugin?.openSubsetReviewDialog) {
  actions.unshift({ id: 'review-subset', label: 'Review Subset', icon: 'iconPlay' });
}
```

这个功能依赖于 `this.plugin?.openSubsetReviewDialog` 的存在。

### 检查点

1. **`SRSBrowser.vue` 是否传递了 `plugin` 参数？**
   - ✅ 是的，在第 416 行：`createDeckDataSource(props.plugin.unifiedDataSourceManager, options, props.currentDocId, props.plugin)`

2. **`props.plugin` 是否包含 `openSubsetReviewDialog` 方法？**
   - 需要确认 `props.plugin` 的实际类型和内容

3. **`createFocusDataSource` 是否传递了 `plugin` 参数？**
   - ❌ 没有，`createFocusDataSource` 函数没有 `plugin` 参数
   - 但是 `createFocusDataSource` 主要用于聚焦计算，不需要"选中复习"功能

### 可能的解决方案

如果问题确实存在，需要：
1. 确认 `props.plugin` 是否正确传递
2. 确认 `props.plugin` 是否包含 `openSubsetReviewDialog` 方法
3. 添加调试日志确认 `this.plugin` 的值

## 问题 2：复习界面无法显示答案

### 根本原因

复习界面的答案显示逻辑依赖于 `showAnswer` 状态：

1. **初始状态**：`context.showAnswer = false`（答案未显示）
2. **点击"显示答案"**：`context.showAnswer = true`（答案已显示）
3. **Adapter 转换**：`actions.showAnswer = !context.showAnswer`（语义反转）

在 `FinalDrillAdapter.ts` 第 145 行：

```typescript
showAnswer: uiConfig.showRatingButtons ? !context.showAnswer : false,
```

这里的逻辑是：
- 如果 `uiConfig.showRatingButtons = true`，则 `showAnswer = !context.showAnswer`（正常逻辑）
- 如果 `uiConfig.showRatingButtons = false`，则 `showAnswer = false`（直接显示评分按钮，跳过答案显示）

### 检查点

1. **`uiConfig.showRatingButtons` 的值是什么？**
   - 需要检查队列的 `getUIConfig()` 方法返回值

2. **是否使用了 `UnifiedQueueStrategy`？**
   - `UnifiedQueueStrategy` 会根据卡片类型返回不同的 `showRatingButtons` 值：
     - `item` 卡片：`true`
     - `topic` 卡片：`false`
     - 无卡片：`false`

3. **当前卡片的类型是什么？**
   - 如果是 `topic` 卡片，`showRatingButtons` 会是 `false`
   - 如果是 `item` 卡片，`showRatingButtons` 应该是 `true`

### 可能的解决方案

1. **确认卡片类型**：
   - 检查当前复习的卡片是 `item` 还是 `topic`
   - `topic` 卡片不应该显示答案，而是显示"插入"和"跳过"按钮

2. **确认队列类型**：
   - 检查是否使用了正确的队列（FinalDrill、RetrievalPractice 等）
   - 不同队列可能有不同的 UI 配置

3. **添加调试日志**：
   - 在 Adapter 中添加日志，输出 `uiConfig.showRatingButtons` 和 `context.showAnswer` 的值

## 与 DeckDataSource 修改的关系

我刚才的修改主要是：
1. 修改 `DeckDataSource` 构造函数，直接接收 `manager` 参数
2. 添加可选的 `plugin` 参数用于特殊功能

这些修改**不应该**影响复习界面的答案显示逻辑，因为：
- 复习界面使用的是队列的 Adapter（如 `FinalDrillAdapter`）
- Adapter 的逻辑没有被修改
- `showAnswer` 的逻辑完全由 `uiConfig.showRatingButtons` 和 `context.showAnswer` 控制

## 下一步调试步骤

1. **添加调试日志**：
   ```typescript
   console.log('[DeckDataSource] getSupportedActions:', {
     hasPlugin: !!this.plugin,
     hasOpenSubsetReviewDialog: !!this.plugin?.openSubsetReviewDialog,
     plugin: this.plugin,
   });
   ```

2. **检查复习界面日志**：
   - 查看浏览器控制台中的日志
   - 确认 `uiConfig.showRatingButtons` 的值
   - 确认 `context.showAnswer` 的值

3. **确认卡片类型**：
   - 检查当前复习的卡片是否是 `topic` 类型
   - `topic` 卡片不显示答案是预期行为

4. **回滚测试**：
   - 如果问题确实由我的修改引起，可以回滚 `DeckDataSource` 的修改
   - 但根据代码分析，这不太可能

## 临时解决方案

如果需要立即恢复功能，可以：

1. **恢复"选中复习"功能**：
   - 确保 `props.plugin` 正确传递给 `DeckDataSource`
   - 或者在 `DeckDataSource` 中添加 fallback 逻辑

2. **修复答案显示**：
   - 检查队列配置，确保 `showRatingButtons = true`
   - 或者修改 Adapter 逻辑，强制显示答案按钮

## 建议

建议用户提供：
1. 浏览器控制台的完整日志
2. 当前复习的队列类型（FinalDrill、RetrievalPractice 等）
3. 当前复习的卡片类型（item 或 topic）
4. 问题是否在所有队列中都出现，还是只在特定队列中出现
