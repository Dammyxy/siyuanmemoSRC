# 安排复习日期功能修复

## 问题描述

安排复习日期功能报错：`[SiYuanMemo][ReviewActions] FSRS plugin instance not found`

## 根本原因

在 DDD 重构后，`src/index.ts` 中移除了全局变量 `window.siyuanMemoPlugin`（第 149 行被注释），但 `ReviewActions.vue` 的 `onScheduleConfirm` 方法仍然尝试从全局获取插件实例：

```typescript
// ReviewActions.vue:298
const fsrsPlugin = (window as any).siyuanMemoPlugin;
if (!fsrsPlugin) {
  console.error('[SiYuanMemo][ReviewActions] FSRS plugin instance not found');
  return;
}
```

## DDD 架构问题

违反了依赖注入原则：
- ❌ UI 组件不应该依赖全局变量
- ❌ 应该通过 props 传递依赖
- ❌ 服务应该通过适配器或上下文提供

## 解决方案

通过 props 传递 plugin 实例（推荐方案）：

1. `ReviewActions.vue` 接收 `plugin` prop
2. `ReviewView.vue` 将 `props.plugin` 传递给 `ReviewActions`
3. `TabManager.ts` 在创建 `ReviewView` 时传递 `plugin`
4. `createUnifiedReviewDialog.ts` 已经在传递 `plugin`（第 107 行）

## 实施完成

### 1. 修改 ReviewActions.vue

- ✅ 添加 `plugin` prop
- ✅ 修改 `onScheduleConfirm` 使用 `props.plugin.getContext()`
- ✅ 移除对全局变量 `window.siyuanMemoPlugin` 的依赖

### 2. 修改 ReviewView.vue

- ✅ 传递 `:plugin="props.plugin"` 给 `ReviewActions`

### 3. 修改 TabManager.ts

- ✅ 在 queue + adapter 模式中传递 `plugin: plugin`
- ✅ 在 provider 模式中传递 `plugin: plugin`

### 4. createUnifiedReviewDialog.ts

- ✅ 已经在传递 `plugin` 实例（无需修改）

## 验证步骤

1. 点击"跳过"按钮的下拉菜单
2. 选择"安排复习日期"
3. 选择日期或天数
4. 确认操作
5. 验证卡片的到期日期被正确更新
6. 验证卡片从队列中移除
7. 验证继续显示下一张卡片

## DDD 架构合规性

- ✅ 使用依赖注入而非全局变量
- ✅ UI 层通过 props 接收服务
- ✅ 服务由应用层（ApplicationContext）提供
- ✅ 保持单向数据流
- ✅ 符合 SOLID 原则中的依赖倒置原则

## 相关修复

同时修复了插入队列功能的字段名不一致问题（见 insert-queue-fix.md）
