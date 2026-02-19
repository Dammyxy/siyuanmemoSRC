# 快速诊断指南

## 问题：顶栏右键菜单和复习界面打不开

### 快速检查清单

在浏览器控制台（F12）中执行以下命令，逐一检查：

#### 1. 检查插件是否加载成功

```javascript
// 检查插件实例
const plugin = window.siyuanMemoPlugin;
console.log('✓ Plugin loaded:', !!plugin);

// 检查初始化状态
console.log('✓ Plugin initialized:', plugin?.isInitialized);

// 检查 ApplicationContext
console.log('✓ Context exists:', !!plugin?.context);
```

**预期结果**：
```
✓ Plugin loaded: true
✓ Plugin initialized: true
✓ Context exists: true
```

#### 2. 检查 MenuManager

```javascript
const plugin = window.siyuanMemoPlugin;
const menuManager = plugin?.context?.getMenuManager?.();

console.log('✓ MenuManager exists:', !!menuManager);
console.log('✓ MenuManager type:', menuManager?.constructor?.name);
console.log('✓ MenuManager has openTopBarMenu:', typeof menuManager?.openTopBarMenu);
```

**预期结果**：
```
✓ MenuManager exists: true
✓ MenuManager type: MenuManager
✓ MenuManager has openTopBarMenu: function
```

#### 3. 检查 DialogManager

```javascript
const plugin = window.siyuanMemoPlugin;
const dialogManager = plugin?.context?.getDialogManager?.();

console.log('✓ DialogManager exists:', !!dialogManager);
console.log('✓ DialogManager type:', dialogManager?.constructor?.name);
console.log('✓ DialogManager has openReviewDialog:', typeof dialogManager?.openReviewDialog);
```

**预期结果**：
```
✓ DialogManager exists: true
✓ DialogManager type: DialogManager
✓ DialogManager has openReviewDialog: function
```

#### 4. 检查 ReviewDialogManager

```javascript
const plugin = window.siyuanMemoPlugin;
const reviewDialogManager = plugin?.context?.getReviewDialogManager?.();

console.log('✓ ReviewDialogManager exists:', !!reviewDialogManager);
console.log('✓ ReviewDialogManager type:', reviewDialogManager?.constructor?.name);
console.log('✓ ReviewDialogManager has openRetrievalPractice:', typeof reviewDialogManager?.openRetrievalPractice);
```

**预期结果**：
```
✓ ReviewDialogManager exists: true
✓ ReviewDialogManager type: ReviewDialogManager
✓ ReviewDialogManager has openRetrievalPractice: function
```

#### 5. 检查事件监听器

```javascript
const plugin = window.siyuanMemoPlugin;
const topBarElement = plugin?.topBarElement;

console.log('✓ TopBar element exists:', !!topBarElement);
console.log('✓ TopBar is connected:', topBarElement?.isConnected);
console.log('✓ TopBar has contextmenu listener:', !!plugin?.topBarContextMenuHandler);
```

**预期结果**：
```
✓ TopBar element exists: true
✓ TopBar is connected: true
✓ TopBar has contextmenu listener: true
```

### 手动测试

#### 测试 1：手动打开菜单

```javascript
const plugin = window.siyuanMemoPlugin;
const menuManager = plugin?.context?.getMenuManager?.();

if (menuManager) {
  const mockEvent = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: 100,
    currentTarget: plugin.topBarElement
  });
  
  try {
    menuManager.openTopBarMenu(mockEvent);
    console.log('✓ Menu opened successfully');
  } catch (error) {
    console.error('✗ Failed to open menu:', error);
  }
} else {
  console.error('✗ MenuManager not found');
}
```

#### 测试 2：手动打开复习对话框

```javascript
const plugin = window.siyuanMemoPlugin;
const dialogManager = plugin?.context?.getDialogManager?.();

if (dialogManager) {
  try {
    await dialogManager.openReviewDialog();
    console.log('✓ Review dialog opened successfully');
  } catch (error) {
    console.error('✗ Failed to open review dialog:', error);
  }
} else {
  console.error('✗ DialogManager not found');
}
```

### 常见问题和解决方案

#### 问题 1：MenuManager 不存在

**症状**：
```
✗ MenuManager exists: false
```

**可能原因**：
1. MenuManager 未在 ApplicationContext 中注册
2. 服务工厂注册失败
3. 构建时出错

**解决方案**：
1. 检查 `src/application/ApplicationContext.ts` 中的 `registerServiceFactories` 方法
2. 确保有以下代码：
```typescript
this.registerServiceFactory('menuManager', (context) => {
  const dialogManager = context.getDialogManager();
  return new MenuManager(context, context.getPlugin(), context.getI18n(), dialogManager);
});
```
3. 重新构建项目：`npm run build`

#### 问题 2：DialogManager 不存在

**症状**：
```
✗ DialogManager exists: false
```

**可能原因**：
1. DialogManager 未在 ApplicationContext 中注册
2. 服务工厂注册失败

**解决方案**：
1. 检查 `src/application/ApplicationContext.ts` 中的 `registerServiceFactories` 方法
2. 确保有以下代码：
```typescript
this.registerServiceFactory('dialogManager', (context) => {
  return new DialogManager(context, context.getPlugin());
});
```
3. 重新构建项目：`npm run build`

#### 问题 3：ReviewDialogManager 不存在

**症状**：
```
✗ ReviewDialogManager exists: false
```

**可能原因**：
1. ReviewDialogManager 未在 ApplicationContext.create() 中创建
2. 未添加到服务容器

**解决方案**：
1. 检查 `src/application/ApplicationContext.ts` 中的 `create` 方法
2. 确保创建了 ReviewDialogManager：
```typescript
const reviewDialogManager = new ReviewDialogManager({
  app: (config.plugin as any).app,
  i18n: config.i18n,
  storage: storageManager,
  scheduler: scheduler,
  isInitialized: () => true,
  plugin: config.plugin as any,
  openReviewTab: (options) => {},
});
```
3. 确保添加到服务容器：
```typescript
const context = new ApplicationContext(config, {
  // ... 其他服务
  reviewDialogManager,
  // ...
});
```

#### 问题 4：事件监听器未绑定

**症状**：
```
✗ TopBar has contextmenu listener: false
```

**可能原因**：
1. 事件监听器未在 `setupTopBar` 中绑定
2. topBarElement 为 null

**解决方案**：
1. 检查 `src/index.ts` 中的 `setupTopBar` 方法
2. 确保有以下代码：
```typescript
this.topBarContextMenuHandler = (ev: MouseEvent) => {
  ev.preventDefault();
  this.context.getMenuManager()?.openTopBarMenu(ev);
};
this.topBarElement?.addEventListener('contextmenu', this.topBarContextMenuHandler);
```

#### 问题 5：插件未初始化完成

**症状**：
```
✓ Plugin loaded: true
✗ Plugin initialized: false
```

**可能原因**：
1. ApplicationContext 创建失败
2. 初始化过程中抛出异常

**解决方案**：
1. 查看控制台是否有错误信息
2. 检查 `src/index.ts` 中的 `onload` 方法
3. 确保 `this.isInitialized = true` 被执行

### 完整诊断脚本

将以下代码复制到浏览器控制台，一次性执行所有检查：

```javascript
(function() {
  console.log('=== FSRS Plugin Diagnosis ===\n');
  
  const plugin = window.siyuanMemoPlugin;
  
  // 1. 基础检查
  console.log('1. Basic Checks:');
  console.log('  ✓ Plugin loaded:', !!plugin);
  console.log('  ✓ Plugin initialized:', plugin?.isInitialized);
  console.log('  ✓ Context exists:', !!plugin?.context);
  console.log('');
  
  if (!plugin || !plugin.context) {
    console.error('✗ Plugin or context not found. Please reload the plugin.');
    return;
  }
  
  // 2. MenuManager 检查
  console.log('2. MenuManager:');
  const menuManager = plugin.context.getMenuManager?.();
  console.log('  ✓ Exists:', !!menuManager);
  console.log('  ✓ Type:', menuManager?.constructor?.name);
  console.log('  ✓ Has openTopBarMenu:', typeof menuManager?.openTopBarMenu);
  console.log('');
  
  // 3. DialogManager 检查
  console.log('3. DialogManager:');
  const dialogManager = plugin.context.getDialogManager?.();
  console.log('  ✓ Exists:', !!dialogManager);
  console.log('  ✓ Type:', dialogManager?.constructor?.name);
  console.log('  ✓ Has openReviewDialog:', typeof dialogManager?.openReviewDialog);
  console.log('');
  
  // 4. ReviewDialogManager 检查
  console.log('4. ReviewDialogManager:');
  const reviewDialogManager = plugin.context.getReviewDialogManager?.();
  console.log('  ✓ Exists:', !!reviewDialogManager);
  console.log('  ✓ Type:', reviewDialogManager?.constructor?.name);
  console.log('  ✓ Has openRetrievalPractice:', typeof reviewDialogManager?.openRetrievalPractice);
  console.log('');
  
  // 5. 事件监听器检查
  console.log('5. Event Listeners:');
  const topBarElement = plugin.topBarElement;
  console.log('  ✓ TopBar element exists:', !!topBarElement);
  console.log('  ✓ TopBar is connected:', topBarElement?.isConnected);
  console.log('  ✓ TopBar has contextmenu listener:', !!plugin.topBarContextMenuHandler);
  console.log('');
  
  // 6. 总结
  console.log('=== Summary ===');
  const allGood = plugin && 
                  plugin.isInitialized && 
                  plugin.context && 
                  menuManager && 
                  dialogManager && 
                  reviewDialogManager && 
                  topBarElement?.isConnected;
  
  if (allGood) {
    console.log('✓ All checks passed! Plugin should work correctly.');
    console.log('\nYou can now test:');
    console.log('  - Right-click the topbar icon to open menu');
    console.log('  - Left-click the topbar icon to open browser');
  } else {
    console.error('✗ Some checks failed. Please review the output above.');
  }
})();
```

### 获取详细日志

如果问题仍然存在，请执行以下命令获取详细信息：

```javascript
const plugin = window.siyuanMemoPlugin;

console.log('=== Detailed Plugin State ===');
console.log('Plugin:', plugin);
console.log('Context:', plugin?.context);
console.log('MenuManager:', plugin?.context?.getMenuManager?.());
console.log('DialogManager:', plugin?.context?.getDialogManager?.());
console.log('ReviewDialogManager:', plugin?.context?.getReviewDialogManager?.());
console.log('TopBar Element:', plugin?.topBarElement);
console.log('TopBar Handler:', plugin?.topBarContextMenuHandler);
```

将输出结果提供给开发者，以便进一步诊断。

## 下一步

如果所有检查都通过，但问题仍然存在，请：

1. 清除浏览器缓存
2. 重启思源笔记
3. 重新构建插件：`npm run build`
4. 查看详细的调试指南：[menu-dialog-debug.md](./menu-dialog-debug.md)
5. 查看长期改进计划：[long-term-improvements.md](./long-term-improvements.md)
