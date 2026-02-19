# 运行时问题修复 - 2026-02-19

## 问题概述

用户报告了三个运行时问题：

1. **浏览器右键菜单缺失** - 在全部闪卡里，右键菜单缺失
2. **队列复习按钮失效** - 插件顶栏按钮右键菜单里的队列复习按钮都失效了
3. **开始练习菜单按钮无反应** - 浏览器工具栏的【开始练习】菜单里的按钮点了没反应

## 问题分析

### 问题 2：队列复习按钮失效

**错误信息**：
```
[SiYuanMemo][createUnifiedReviewDialog] Failed to create dialog: {queueType: 'incremental-learning', error: 'this.eventBus.subscribe is not a function'}
```

**根本原因**：
- `createUnifiedReviewDialog` 尝试从 `plugin.eventBus` 或 `window.siyuanMemoPlugin.eventBus` 获取 EventBus
- 但插件实例（`src/index.ts`）没有暴露 `eventBus` 属性
- `UnifiedQueueStrategy` 构造函数需要 EventBus 实例，但获取失败导致 `this.eventBus` 为 undefined

**修复方案**：
在 `src/index.ts` 中添加 `eventBus` getter：

```typescript
public get eventBus() { return this.context.getEventBus(); }
```

### 问题 3：开始练习菜单按钮无反应

**根本原因**：
- `openPracticeMenu` 函数调用 `plugin.openReviewDialog()` 等方法
- 但这些方法没有在插件实例上定义
- DialogManager 的方法没有代理到插件实例

**修复方案**：
在 `src/index.ts` 中添加 DialogManager 方法代理：

```typescript
// DialogManager 方法代理
public openReviewDialog() { return this.context.getDialogManager()?.openReviewDialog(); }
public openIncrementalLearningDialog() { return this.context.getDialogManager()?.openIncrementalLearningDialog(); }
public openFinalDrillDialog() { return this.context.getDialogManager()?.openFinalDrillDialog(); }
public openNeuralRoamDialog(options?: any) { return this.context.getDialogManager()?.openNeuralRoamDialog(options); }
public openFilterGroupPracticeDialog() { return this.context.getDialogManager()?.openFilterGroupPracticeDialog(); }
public openLeechReviewDialog() { return this.context.getDialogManager()?.openLeechReviewDialog(); }
```

### 问题 1：浏览器右键菜单缺失

**根本原因**：
- 在"全部卡片"模式下，`currentDataSource.value` 被设置为 `null`
- 右键菜单依赖 `currentDataSource.getSupportedActions()` 来获取可用操作
- 当数据源为 null 时，`getSupportedActions()` 返回空数组，导致菜单缺失

**修复方案**：
在 `src/ui/browser/SRSBrowser.vue` 的 `loadData()` 函数中，即使在全部卡片模式下也创建 `DeckDataSource`：

```typescript
// ✅ 创建 DeckDataSource 以支持右键菜单
// 即使在全部卡片模式下，也需要数据源来提供操作菜单
const unifiedDataSourceManager = props.browserService?.getUnifiedDataSourceManager?.() || props.plugin?.unifiedDataSourceManager;
if (unifiedDataSourceManager) {
  currentDataSource.value = new DeckDataSource(
    unifiedDataSourceManager,
    props.plugin,
    {
      preset: currentPreset.value,
      queryText: searchQuery.value,
      cardType: currentCardType.value as 'all' | 'topic-only' | 'item-only',
    }
  );
} else {
  currentDataSource.value = null;
}
```

## 修复实施

### ✅ 已完成

1. **修复 src/index.ts**
   - 添加 `eventBus` getter
   - 添加 DialogManager 方法代理

2. **修复 src/ui/browser/SRSBrowser.vue**
   - 在全部卡片模式下创建 `DeckDataSource` 以支持右键菜单
   - 确保 `currentDataSource.value` 不为 null

### 🔍 待验证

所有修复已完成，等待用户测试验证。

## 测试验证

### 测试步骤

1. **测试队列复习按钮**：
   - 右键点击插件顶栏按钮
   - 点击"渐进学习"、"刻意练习"等菜单项
   - 验证对话框是否正常打开

2. **测试开始练习菜单**：
   - 打开浏览器
   - 点击工具栏的【开始练习】按钮
   - 验证菜单是否显示
   - 点击菜单项，验证对话框是否打开

3. **测试右键菜单**：
   - 打开浏览器
   - 在卡片列表中右键点击
   - 验证菜单是否显示
   - 验证菜单项是否完整

### 预期结果

- ✅ 队列复习按钮应该正常工作
- ✅ 开始练习菜单应该正常显示和工作
- ✅ 右键菜单应该正常显示（包括全部卡片模式）

## 相关文件

- `src/index.ts` - 插件主文件（已修复）
- `src/application/factories/createUnifiedReviewDialog.ts` - 对话框工厂
- `src/application/adapters/UnifiedQueueStrategy.ts` - 队列策略
- `src/ui/browser/SRSBrowser.vue` - 浏览器组件
- `src/ui/browser/datasource/DeckDataSource.ts` - 数据源实现

## 后续行动

1. 请用户测试修复后的版本
2. 验证所有三个问题是否已解决
3. 如果仍有问题，请提供详细的错误日志和复现步骤

## 技术总结

这次修复涉及三个关键问题：

1. **依赖注入问题**：EventBus 没有暴露给外部访问
2. **接口代理问题**：DialogManager 的方法没有代理到插件实例
3. **数据源生命周期问题**：在某些模式下数据源被错误地设置为 null

所有问题都源于 DDD 重构后的架构变化，需要确保：
- 核心服务通过 ApplicationContext 正确暴露
- UI 组件能够访问必要的服务和管理器
- 数据源在所有模式下都正确初始化
