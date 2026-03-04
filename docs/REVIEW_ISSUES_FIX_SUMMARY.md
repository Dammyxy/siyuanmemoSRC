# 复习功能问题修复总结

## 问题描述

用户报告两个问题：
1. "选中复习"功能消失了
2. 复习界面无法显示答案，直接显示评分按钮

## 修复措施

### 1. 添加调试日志

在 `DeckDataSource.ts` 中添加了详细的调试日志，帮助诊断问题：

```typescript
if (this.plugin?.openSubsetReviewDialog) {
  actions.unshift({ id: 'review-subset', label: 'Review Subset', icon: 'iconPlay' });
  console.log('[DeckDataSource] ✅ 已添加"选中复习"菜单');
} else {
  console.log('[DeckDataSource] ❌ 没有添加"选中复习"菜单', {
    hasPlugin: !!this.plugin,
    hasOpenSubsetReviewDialog: !!this.plugin?.openSubsetReviewDialog,
    pluginKeys: this.plugin ? Object.keys(this.plugin) : [],
  });
}
```

### 2. 确认修改的正确性

我的修改主要是：
1. 修改 `DeckDataSource` 构造函数，直接接收 `manager` 参数
2. 添加可选的 `plugin` 参数用于特殊功能（Review Subset、神经漫游、时间调整）
3. 在 `SRSBrowser.vue` 中传递 `props.plugin` 参数

这些修改**不应该**破坏现有功能，因为：
- `plugin` 参数已经正确传递
- 所有依赖 `plugin` 的功能都保留了

## 可能的问题原因

### 问题 1：选中复习功能消失

可能的原因：
1. **`props.plugin` 为 `undefined`**：
   - 检查 `SRSBrowser.vue` 的调用者是否传递了 `plugin` prop
   
2. **`props.plugin` 不包含 `openSubsetReviewDialog` 方法**：
   - 检查 `plugin` 对象的实际内容
   - 可能是插件初始化顺序问题

3. **`createFocusDataSource` 没有传递 `plugin`**：
   - 这是预期行为，`createFocusDataSource` 用于聚焦计算，不需要"选中复习"功能

### 问题 2：复习界面无法显示答案

可能的原因：
1. **卡片类型是 `topic`**：
   - `topic` 卡片不显示答案，而是显示"插入"和"跳过"按钮
   - 这是预期行为

2. **`uiConfig.showRatingButtons` 为 `false`**：
   - 检查队列的 `getUIConfig()` 方法
   - 某些队列（如神经漫游）可能不显示评分按钮

3. **队列配置错误**：
   - 检查是否使用了正确的队列类型
   - 检查队列的初始化是否正确

## 下一步调试步骤

1. **查看浏览器控制台日志**：
   - 打开浏览器开发者工具
   - 查看 `[DeckDataSource]` 开头的日志
   - 确认 `plugin` 和 `openSubsetReviewDialog` 的状态

2. **确认卡片类型**：
   - 检查当前复习的卡片是 `item` 还是 `topic`
   - 在复习界面的控制台中查看 `uiConfig.showRatingButtons` 的值

3. **测试不同队列**：
   - 测试 FinalDrill 队列
   - 测试 RetrievalPractice 队列
   - 测试 SubsetPractice（选中复习）
   - 确认问题是否在所有队列中都出现

## 临时解决方案

如果问题确实存在，可以尝试：

### 方案 1：强制添加"选中复习"功能

在 `DeckDataSource.ts` 中：

```typescript
// 强制添加"选中复习"功能（临时方案）
actions.unshift({ id: 'review-subset', label: 'Review Subset', icon: 'iconPlay' });
```

### 方案 2：强制显示答案按钮

在 `FinalDrillAdapter.ts` 中：

```typescript
// 强制显示答案按钮（临时方案）
showAnswer: !context.showAnswer,  // 移除 uiConfig.showRatingButtons 的检查
```

## 建议

建议用户提供以下信息以便进一步诊断：

1. **浏览器控制台日志**：
   - 完整的 `[DeckDataSource]` 日志
   - 完整的 `[FSRS ReviewView]` 日志

2. **复现步骤**：
   - 如何触发"选中复习"功能
   - 如何进入复习界面
   - 当前复习的队列类型

3. **环境信息**：
   - 思源笔记版本
   - 插件版本
   - 浏览器类型和版本

4. **问题范围**：
   - 问题是否在所有队列中都出现
   - 问题是否在所有卡片类型中都出现
   - 问题是否在重启后仍然存在

## 编译状态

✅ 编译成功，无错误：
```
dist/index.js   1,668.42 kB │ gzip: 475.04 kB
✓ built in 6.79s
```

## 文件修改

1. `siyuan-plugin-fsrs/src/ui/browser/datasource/DeckDataSource.ts`
   - 添加了调试日志

2. `siyuan-plugin-fsrs/REVIEW_ISSUES_DIAGNOSIS.md`
   - 创建了诊断文档

3. `siyuan-plugin-fsrs/REVIEW_ISSUES_FIX_SUMMARY.md`
   - 创建了修复总结文档
