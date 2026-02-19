# DDD 重构后的 Bug 修复

## 问题 1: 右键插件顶栏按钮，没有菜单弹出

### 错误信息
```
plugin:siyuan-plugin-siyuanmemo:90340 Uncaught TypeError: scheduler.getScheduleInfo is not a function
at eval (plugin:siyuan-plugin-siyuanmemo:90340:38)
at Array.filter (<anonymous>)
at MenuManager.getDueCount (plugin:siyuan-plugin-siyuanmemo:90339:34)
at MenuManager.openTopBarMenu (plugin:siyuan-plugin-siyuanmemo:90227:27)
at HTMLDivElement.topBarContextMenuHandler (plugin:siyuan-plugin-siyuanmemo:107246:68)
```

### 根本原因
`MenuManager.getDueCount()` 方法试图调用 `scheduler.getScheduleInfo(card.id)`，但 `SchedulerRouter` 类没有这个方法。这是因为在 DDD 重构过程中，调度器的接口发生了变化。

### 解决方案
修改 `MenuManager.getDueCount()` 方法，直接使用 `storage.getDueCards()` 而不是手动过滤：

```typescript
// 修改前
private getDueCount(): number {
  const storage = this.context.getStorage();
  const scheduler = this.context.getScheduler();
  const now = new Date();
  
  return storage.getAllCards().filter(card => {
    const scheduleInfo = scheduler.getScheduleInfo(card.id);
    if (!scheduleInfo) return false;
    return new Date(scheduleInfo.due) <= now;
  }).length;
}

// 修改后
private getDueCount(): number {
  const storage = this.context.getStorage();
  return storage.getDueCards().length;
}
```

### 修改文件
- `src/application/managers/MenuManager.ts`

## 问题 2: 打开浏览器后，浏览器变窄，预览区不可用，点击开始练习，几个队列的复习界面都打不开

### 根本原因
`reviewDialogManager` 和 `hybridSyncService` 没有在 plugin 实例上暴露，导致 `MenuManager` 和其他组件无法访问这些服务。

### 解决方案
在 `index.ts` 中添加 getter 方法，将这些服务暴露给 plugin 实例：

```typescript
// 添加到 index.ts 的向后兼容访问器部分
public get reviewDialogManager() { return this.context.getReviewDialogManager(); }
public get hybridSyncService() { return this.context.getHybridSyncService(); }
```

### 修改文件
- `src/index.ts`

## 验证步骤

### 验证问题 1 修复
1. 启动插件
2. 右键点击顶栏按钮
3. 确认菜单正常弹出，显示到期卡片数量

### 验证问题 2 修复
1. 打开 SRS 浏览器
2. 确认浏览器宽度正常
3. 确认预览区可用
4. 点击"开始练习"
5. 确认各个队列的复习界面都能正常打开

## 测试建议

建议添加以下测试：

1. 单元测试：`MenuManager.getDueCount()` 方法
2. 集成测试：顶栏菜单打开流程
3. 集成测试：复习对话框打开流程
4. 集成测试：SRS 浏览器打开流程

## 相关文件
- `src/application/managers/MenuManager.ts`
- `src/index.ts`
- `src/application/ApplicationContext.ts`
